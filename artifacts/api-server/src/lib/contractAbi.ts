export const PAYAGENT_ESCROW_ABI = [
  "constructor(address _cUSD, address _aiAgent)",

  "function depositEscrow(bytes32 jobId, address worker, uint256 amount, string calldata jobTitle) external",
  "function releasePayment(bytes32 jobId) external",
  "function initiateDispute(bytes32 jobId) external",
  "function resolveDispute(bytes32 jobId, address winner) external",
  "function refundExpired(bytes32 jobId) external",

  "function getEscrowDetails(bytes32 jobId) external view returns (tuple(address employer, address worker, uint256 amount, uint256 fee, uint8 status, uint256 createdAt, string jobTitle))",
  "function getWorkerJobs(address worker) external view returns (bytes32[])",
  "function getEmployerJobs(address employer) external view returns (bytes32[])",

  "function setAIAgent(address newAgent) external",
  "function setFeeBps(uint256 newFeeBps) external",
  "function withdrawFees() external",
  "function recoverToken(address token, uint256 amount) external",

  "function aiAgent() external view returns (address)",
  "function feeBps() external view returns (uint256)",
  "function collectedFees() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function cUSD() external view returns (address)",

  "event PaymentEscrowed(bytes32 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 fee, string jobTitle)",
  "event PaymentReleased(bytes32 indexed jobId, address indexed worker, uint256 amount)",
  "event DisputeInitiated(bytes32 indexed jobId, address indexed initiator)",
  "event DisputeResolved(bytes32 indexed jobId, address indexed winner, uint256 amount)",
  "event PaymentRefunded(bytes32 indexed jobId, address indexed employer, uint256 amount)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
] as const;

export const PAYAGENT_ESCROW_BYTECODE =
  "0x608060405234801561001057600080fd5b50604051620027de380380620027de83398101604081905261003191610145565b6100413361008e60201b60201c565b6001600255600080546001600160a01b038085166001600160a01b03199283161790925560018054928416929091169190911790556003556040516100839061018a565b604051809103906000f08015801561009f573d6000803e3d6000fd5b5050610179565b600380546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a35050565b80516001600160a01b038116811461010157600080fd5b919050565b634e487b7160e01b600052604160045260246000fd5b60005b8381101561013157818101518382015260200161011957565b50506000910152565b60008060408385031215610158578182fd5b610161836100ea565b9150610171602084016100ea565b90509250929050565b610655806101886000396000f3fe";

export const STATUS_MAP: Record<number, string> = {
  0: "None",
  1: "Escrowed",
  2: "Released",
  3: "Disputed",
  4: "Resolved",
  5: "Refunded",
};

export const CUSD_ADDRESSES: Record<string, string> = {
  celo: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  alfajores: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
  celoSepolia: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
};

export const CHAIN_IDS: Record<string, number> = {
  celo: 42220,
  alfajores: 44787,
  celoSepolia: 44787,
};

export function getCeloRpc(network: string): string {
  const alchemyKey = process.env.ALCHEMY_KEY;
  if (alchemyKey) {
    const alchemyUrls: Record<string, string> = {
      celo: `https://celo-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      alfajores: `https://celo-alfajores.g.alchemy.com/v2/${alchemyKey}`,
      celoSepolia: `https://celo-sepolia.g.alchemy.com/v2/${alchemyKey}`,
    };
    if (alchemyUrls[network]) return alchemyUrls[network];
  }
  const fallback: Record<string, string> = {
    celo: "https://forno.celo.org",
    alfajores: "https://alfajores-forno.celo-testnet.org",
    celoSepolia: "https://alfajores-forno.celo-testnet.org",
  };
  const url = fallback[network];
  if (!url) throw new Error(`Unknown network: ${network}`);
  return url;
}

export const CELO_RPC: Record<string, string> = {
  celo: "https://forno.celo.org",
  alfajores: "https://alfajores-forno.celo-testnet.org",
  celoSepolia: "https://alfajores-forno.celo-testnet.org",
};

export const CELOSCAN_BASE: Record<string, string> = {
  celo: "https://celoscan.io",
  alfajores: "https://alfajores.celoscan.io",
  celoSepolia: "https://alfajores.celoscan.io",
};
