import { ethers } from "ethers";
import {
  PAYAGENT_ESCROW_ABI,
  PAYAGENT_ESCROW_BYTECODE,
  ERC20_ABI,
  STATUS_MAP,
  CUSD_ADDRESSES,
  CELOSCAN_BASE,
  getCeloRpc,
} from "./contractAbi.js";
import { db } from "@workspace/db";
import {
  transactionsTable,
  contractDeploymentTable,
  receiptsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "./logger.js";

function getProvider(network: string) {
  const rpc = getCeloRpc(network);
  return new ethers.JsonRpcProvider(rpc);
}

function getDeployerWallet(network: string) {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  return new ethers.Wallet(key, getProvider(network));
}

function getAgentWallet(network: string) {
  const key = process.env.AI_AGENT_PRIVATE_KEY;
  if (!key) throw new Error("AI_AGENT_PRIVATE_KEY not set");
  return new ethers.Wallet(key, getProvider(network));
}

export async function getActiveDeployment() {
  const envAddress = process.env.CONTRACT_ADDRESS;
  const envNetwork = process.env.CELO_NETWORK ?? "alfajores";

  if (envAddress) {
    const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY ?? ethers.Wallet.createRandom().privateKey);
    const agent = new ethers.Wallet(process.env.AI_AGENT_PRIVATE_KEY ?? ethers.Wallet.createRandom().privateKey);
    return {
      id: 0,
      contractAddress: envAddress,
      txHash: "",
      network: envNetwork,
      deployerAddress: deployer.address,
      aiAgentAddress: agent.address,
      cUSDAddress: CUSD_ADDRESSES[envNetwork] ?? CUSD_ADDRESSES.alfajores,
      blockNumber: null,
      createdAt: 0,
    };
  }

  const rows = await db
    .select()
    .from(contractDeploymentTable)
    .orderBy(desc(contractDeploymentTable.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function deployContract(network: string, cUSDOverride?: string) {
  const cUSDAddress = cUSDOverride ?? CUSD_ADDRESSES[network];
  if (!cUSDAddress) throw new Error(`No cUSD address for network: ${network}`);

  const deployer = getDeployerWallet(network);
  const agentWallet = getAgentWallet(network);

  logger.info({ network, deployer: deployer.address, agent: agentWallet.address }, "Deploying PayAgentEscrow");

  const factory = new ethers.ContractFactory(PAYAGENT_ESCROW_ABI, buildBytecode(), deployer);
  const contract = await factory.deploy(cUSDAddress, agentWallet.address);
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("No deployment transaction");

  const receipt = await deployTx.wait(1);
  if (!receipt) throw new Error("No receipt");

  const contractAddress = await contract.getAddress();

  const now = Date.now();
  await db.insert(contractDeploymentTable).values({
    contractAddress,
    txHash: deployTx.hash,
    network,
    deployerAddress: deployer.address,
    aiAgentAddress: agentWallet.address,
    cUSDAddress,
    blockNumber: receipt.blockNumber,
    createdAt: now,
  });

  await logTransaction({
    type: "deploy",
    txHash: deployTx.hash,
    from: deployer.address,
    to: contractAddress,
    status: "success",
    blockNumber: receipt.blockNumber,
    network,
    createdAt: now,
  });

  logger.info({ contractAddress, txHash: deployTx.hash }, "Contract deployed");

  return {
    contractAddress,
    txHash: deployTx.hash,
    network,
    deployerAddress: deployer.address,
    aiAgentAddress: agentWallet.address,
    cUSDAddress,
    blockNumber: receipt.blockNumber,
    celoscanUrl: `${CELOSCAN_BASE[network]}/address/${contractAddress}`,
  };
}

export async function depositEscrow(
  jobIdStr: string,
  workerAddress: string,
  amountHuman: string,
  jobTitle: string,
) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed. Call /api/admin/deploy first.");

  const { network, contractAddress, cUSDAddress } = deployment;
  const deployer = getDeployerWallet(network);

  const jobId = ethers.keccak256(ethers.toUtf8Bytes(jobIdStr));
  const amount = ethers.parseUnits(amountHuman, 18);

  const cusdContract = new ethers.Contract(cUSDAddress, ERC20_ABI, deployer);
  const approveTx = await cusdContract.approve(contractAddress, amount);
  await approveTx.wait(1);

  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, deployer);
  const tx = await escrowContract.depositEscrow(jobId, workerAddress, amount, jobTitle);
  const receipt = await tx.wait(1);

  const now = Date.now();
  await logTransaction({
    type: "deposit",
    jobId: jobId,
    txHash: tx.hash,
    from: deployer.address,
    to: contractAddress,
    amount: amountHuman,
    status: receipt?.status === 1 ? "success" : "failed",
    blockNumber: receipt?.blockNumber,
    network,
    createdAt: now,
  });

  logger.info({ jobId, txHash: tx.hash, amount: amountHuman }, "Escrow deposited");
  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status === 1 ? "success" : "failed",
    jobId,
    gasUsed: receipt?.gasUsed?.toString() ?? "0",
    timestamp: Math.floor(now / 1000),
  };
}

export async function releasePayment(jobId: string, completionProof?: string) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed.");

  const { network, contractAddress } = deployment;
  const agent = getAgentWallet(network);

  logger.info({ jobId, completionProof }, "AI agent releasing payment");

  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, agent);
  const tx = await escrowContract.releasePayment(jobId);
  const receipt = await tx.wait(1);

  const escrow = await escrowContract.getEscrowDetails(jobId);
  const amountHuman = ethers.formatUnits(escrow.amount, 18);

  const now = Date.now();
  await logTransaction({
    type: "release",
    jobId,
    txHash: tx.hash,
    from: agent.address,
    to: escrow.worker,
    amount: amountHuman,
    status: receipt?.status === 1 ? "success" : "failed",
    blockNumber: receipt?.blockNumber,
    network,
    createdAt: now,
  });

  const existing = await db.select().from(receiptsTable).where(eq(receiptsTable.jobId, jobId)).limit(1);
  if (existing.length === 0) {
    await db.insert(receiptsTable).values({
      jobId,
      jobTitle: escrow.jobTitle,
      worker: escrow.worker,
      employer: escrow.employer,
      amount: amountHuman,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      network,
      contractAddress,
      timestamp: Math.floor(now / 1000),
      status: "Released",
    });
  }

  logger.info({ jobId, txHash: tx.hash, worker: escrow.worker, amount: amountHuman }, "Payment released");
  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status === 1 ? "success" : "failed",
    jobId,
    gasUsed: receipt?.gasUsed?.toString() ?? "0",
    timestamp: Math.floor(now / 1000),
  };
}

export async function initiateDisputeOnChain(jobId: string, initiatorAddress: string) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed.");

  const { network, contractAddress } = deployment;
  const provider = getProvider(network);

  const key = process.env.DEPLOYER_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(key, provider);

  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, wallet);
  const tx = await escrowContract.initiateDispute(jobId);
  const receipt = await tx.wait(1);

  const now = Date.now();
  await logTransaction({
    type: "dispute",
    jobId,
    txHash: tx.hash,
    from: initiatorAddress,
    to: contractAddress,
    status: receipt?.status === 1 ? "success" : "failed",
    blockNumber: receipt?.blockNumber,
    network,
    createdAt: now,
  });

  return {
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status === 1 ? "success" : "failed",
    jobId,
    gasUsed: receipt?.gasUsed?.toString() ?? "0",
    timestamp: Math.floor(Date.now() / 1000),
  };
}

export async function getEscrowDetails(jobId: string) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed.");

  const { network, contractAddress } = deployment;
  const provider = getProvider(network);
  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, provider);

  const escrow = await escrowContract.getEscrowDetails(jobId);
  return {
    jobId,
    employer: escrow.employer,
    worker: escrow.worker,
    amount: ethers.formatUnits(escrow.amount, 18),
    fee: ethers.formatUnits(escrow.fee, 18),
    status: STATUS_MAP[Number(escrow.status)] ?? "Unknown",
    createdAt: Number(escrow.createdAt),
    jobTitle: escrow.jobTitle,
  };
}

export async function getWorkerJobs(workerAddress: string) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed.");

  const { network, contractAddress } = deployment;
  const provider = getProvider(network);
  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, provider);

  const jobIds: string[] = await escrowContract.getWorkerJobs(workerAddress);
  return { address: workerAddress, jobIds: Array.from(jobIds), count: jobIds.length };
}

export async function getEmployerJobs(employerAddress: string) {
  const deployment = await getActiveDeployment();
  if (!deployment) throw new Error("No contract deployed.");

  const { network, contractAddress } = deployment;
  const provider = getProvider(network);
  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, provider);

  const jobIds: string[] = await escrowContract.getEmployerJobs(employerAddress);
  return { address: employerAddress, jobIds: Array.from(jobIds), count: jobIds.length };
}

export async function getContractStatus() {
  const deployment = await getActiveDeployment();
  if (!deployment) return { deployed: false };

  const { network, contractAddress } = deployment;
  const provider = getProvider(network);
  const escrowContract = new ethers.Contract(contractAddress, PAYAGENT_ESCROW_ABI, provider);

  const [aiAgent, feeBps, collectedFees, owner] = await Promise.all([
    escrowContract.aiAgent(),
    escrowContract.feeBps(),
    escrowContract.collectedFees(),
    escrowContract.owner(),
  ]);

  return {
    deployed: true,
    contractAddress,
    network,
    aiAgent: aiAgent as string,
    feeBps: Number(feeBps),
    collectedFees: ethers.formatUnits(collectedFees as bigint, 18),
    deployerAddress: owner as string,
    celoscanUrl: `${CELOSCAN_BASE[network]}/address/${contractAddress}`,
  };
}

export async function getTransactionLog(limit: number, offset: number) {
  const rows = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionsTable);

  return { transactions: rows, total: count, limit, offset };
}

export async function getReceipt(jobId: string) {
  const rows = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.jobId, jobId))
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  const deployment = await getActiveDeployment();
  const network = r.network;
  return {
    ...r,
    celoscanUrl: `${CELOSCAN_BASE[network] ?? CELOSCAN_BASE.alfajores}/tx/${r.txHash}`,
  };
}

export async function getWorkerReceipts(workerAddress: string) {
  const rows = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.worker, workerAddress.toLowerCase()))
    .orderBy(desc(receiptsTable.timestamp));

  const enriched = rows.map((r) => ({
    ...r,
    celoscanUrl: `${CELOSCAN_BASE[r.network] ?? CELOSCAN_BASE.alfajores}/tx/${r.txHash}`,
  }));

  return { worker: workerAddress, receipts: enriched, count: enriched.length };
}

async function logTransaction(entry: {
  type: string;
  jobId?: string;
  txHash: string;
  from?: string;
  to?: string;
  amount?: string;
  status: string;
  blockNumber?: number;
  network: string;
  createdAt: number;
}) {
  try {
    await db.insert(transactionsTable).values({
      type: entry.type,
      jobId: entry.jobId ?? null,
      txHash: entry.txHash,
      from: entry.from ?? null,
      to: entry.to ?? null,
      amount: entry.amount ?? null,
      status: entry.status,
      blockNumber: entry.blockNumber ?? null,
      network: entry.network,
      createdAt: entry.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log transaction");
  }
}

function buildBytecode(): string {
  return PAYAGENT_ESCROW_BYTECODE;
}
