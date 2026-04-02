import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CUSD_ADDRESSES: Record<number, string> = {
  42220: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // Celo mainnet
  44787: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1", // Alfajores testnet
  31337: "",                                             // Local (deploy mock)
};

const NETWORK_NAMES: Record<number, string> = {
  42220: "celo",
  44787: "alfajores",
  31337: "hardhat-local",
};

const CELOSCAN: Record<number, string> = {
  42220: "https://celoscan.io",
  44787: "https://alfajores.celoscan.io",
  31337: "",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const chainIdNum = Number(chainId);

  const networkName = NETWORK_NAMES[chainIdNum] ?? `chain-${chainIdNum}`;
  console.log(`\n=== PayAgentEscrow Deployment ===`);
  console.log(`Network:   ${networkName} (chainId: ${chainIdNum})`);
  console.log(`Deployer:  ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:   ${ethers.formatEther(balance)} CELO`);

  if (balance === 0n && chainIdNum !== 31337) {
    throw new Error(
      `Deployer wallet has 0 CELO. Fund it at https://faucet.celo.org then retry.`
    );
  }

  // AI agent wallet — use env var or fall back to deployer for local testing
  const aiAgentAddress =
    process.env.AI_AGENT_ADDRESS ??
    (await ethers.getSigners())[1]?.address ??
    deployer.address;
  console.log(`AI Agent:  ${aiAgentAddress}`);

  // cUSD — deploy a mock for local hardhat node
  let cUSDAddress = process.env.CUSD_ADDRESS ?? CUSD_ADDRESSES[chainIdNum];
  if (!cUSDAddress) {
    console.log("\nDeploying MockERC20 as cUSD for local testing...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mock = await MockERC20.deploy("Celo Dollar", "cUSD");
    await mock.waitForDeployment();
    cUSDAddress = await mock.getAddress();
    console.log(`MockcUSD:  ${cUSDAddress}`);
  }
  console.log(`cUSD:      ${cUSDAddress}\n`);

  // Deploy PayAgentEscrow
  console.log("Deploying PayAgentEscrow...");
  const PayAgentEscrow = await ethers.getContractFactory("PayAgentEscrow");
  const escrow = await PayAgentEscrow.deploy(cUSDAddress, aiAgentAddress);
  await escrow.waitForDeployment();

  const contractAddress = await escrow.getAddress();
  const deployTx = escrow.deploymentTransaction();
  if (!deployTx) throw new Error("No deployment transaction");

  console.log(`\n✅ PayAgentEscrow deployed!`);
  console.log(`Contract:  ${contractAddress}`);
  console.log(`Tx Hash:   ${deployTx.hash}`);

  if (CELOSCAN[chainIdNum]) {
    console.log(`Celoscan:  ${CELOSCAN[chainIdNum]}/address/${contractAddress}`);
  }

  // Verify deployment
  const owner = await escrow.owner();
  const agent = await escrow.aiAgent();
  const feeBps = await escrow.feeBps();
  console.log(`\n─── Contract State ───`);
  console.log(`Owner:     ${owner}`);
  console.log(`AI Agent:  ${agent}`);
  console.log(`Fee:       ${Number(feeBps) / 100}% (${feeBps} bps)`);

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    txHash: deployTx.hash,
    network: networkName,
    chainId: chainIdNum,
    deployer: deployer.address,
    aiAgent: aiAgentAddress,
    cUSDAddress,
    feeBps: Number(feeBps),
    deployedAt: new Date().toISOString(),
    celoscanUrl: CELOSCAN[chainIdNum]
      ? `${CELOSCAN[chainIdNum]}/address/${contractAddress}`
      : null,
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment saved → deployments/${networkName}.json`);

  console.log(`\n─── Add to Replit Secrets ───`);
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`CELO_NETWORK=${networkName}`);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message ?? err);
  process.exit(1);
});
