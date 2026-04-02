/**
 * Standalone deployment script for PayAgentEscrow on Celo.
 * Run: pnpm --filter @workspace/scripts run deploy-celo
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  — deployer/owner wallet
 *   AI_AGENT_PRIVATE_KEY  — AI agent wallet (releases payments)
 *
 * Optional env:
 *   CELO_NETWORK          — "alfajores" (default) or "celo"
 *   CUSD_ADDRESS          — override cUSD token address
 */

import { ethers } from "ethers";
import { db } from "@workspace/db";
import {
  contractDeploymentTable,
  transactionsTable,
} from "@workspace/db/schema";

const CUSD_ADDRESSES: Record<string, string> = {
  celo: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  alfajores: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
};

const CELO_RPC: Record<string, string> = {
  celo: "https://forno.celo.org",
  alfajores: "https://alfajores-forno.celo-testnet.org",
};

const CELOSCAN_BASE: Record<string, string> = {
  celo: "https://celoscan.io",
  alfajores: "https://alfajores.celoscan.io",
};

const ABI = [
  "constructor(address _cUSD, address _aiAgent)",
  "function aiAgent() external view returns (address)",
  "function feeBps() external view returns (uint256)",
  "function owner() external view returns (address)",
];

const BYTECODE =
  "0x608060405234801561001057600080fd5b50604051620027de380380620027de83398101604081905261003191610145565b6100413361008e60201b60201c565b6001600255600080546001600160a01b038085166001600160a01b03199283161790925560018054928416929091169190911790556003556040516100839061018a565b604051809103906000f08015801561009f573d6000803e3d6000fd5b5050610179565b600380546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b80516001600160a01b038116811461010157600080fd5b919050565b634e487b7160e01b600052604160045260246000fd5b60005b8381101561013157818101518382015260200161011957565b50506000910152565b60008060408385031215610158578182fd5b610161836100ea565b9150610171602084016100ea565b90509250929050565b610655806101886000396000f3fe";

async function main() {
  const network = (process.env.CELO_NETWORK ?? "alfajores") as string;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const agentKey = process.env.AI_AGENT_PRIVATE_KEY;

  if (!deployerKey || !agentKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY and AI_AGENT_PRIVATE_KEY must be set",
    );
  }

  const rpc = CELO_RPC[network];
  if (!rpc) throw new Error(`Unknown network: ${network}`);

  const provider = new ethers.JsonRpcProvider(rpc);
  const deployer = new ethers.Wallet(deployerKey, provider);
  const agentWallet = new ethers.Wallet(agentKey, provider);

  const cUSDAddress = process.env.CUSD_ADDRESS ?? CUSD_ADDRESSES[network];
  if (!cUSDAddress) throw new Error("No cUSD address available");

  console.log(`\n=== PayAgentEscrow Deployment ===`);
  console.log(`Network:   ${network}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`AI Agent:  ${agentWallet.address}`);
  console.log(`cUSD:      ${cUSDAddress}`);
  console.log(`RPC:       ${rpc}\n`);

  const balance = await provider.getBalance(deployer.address);
  console.log(`Deployer CELO balance: ${ethers.formatEther(balance)} CELO`);

  if (balance === 0n) {
    console.error(
      "ERROR: Deployer wallet has 0 CELO. Fund it at https://faucet.celo.org before deploying.",
    );
    process.exit(1);
  }

  console.log("Deploying contract...");
  const factory = new ethers.ContractFactory(ABI, BYTECODE, deployer);
  const contract = await factory.deploy(cUSDAddress, agentWallet.address);
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("No deployment transaction");

  console.log(`TX hash: ${deployTx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await deployTx.wait(2);
  if (!receipt) throw new Error("No receipt");

  const contractAddress = await contract.getAddress();
  const celoscanUrl = `${CELOSCAN_BASE[network]}/address/${contractAddress}`;

  console.log(`\n✅ Contract deployed!`);
  console.log(`Address:   ${contractAddress}`);
  console.log(`Block:     ${receipt.blockNumber}`);
  console.log(`Celoscan:  ${celoscanUrl}\n`);

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

  await db.insert(transactionsTable).values({
    type: "deploy",
    txHash: deployTx.hash,
    from: deployer.address,
    to: contractAddress,
    status: "success",
    blockNumber: receipt.blockNumber,
    network,
    createdAt: now,
  });

  console.log("Deployment recorded in database.");
  console.log(`\n=== Add to your .env / Replit Secrets ===`);
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`CELO_NETWORK=${network}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
