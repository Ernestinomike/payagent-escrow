import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const CELOSCAN_API_KEY = process.env.CELOSCAN_API_KEY ?? "";
const ALCHEMY_KEY = process.env.ALCHEMY_KEY ?? "";

function getCeloRpc(network: "celo" | "alfajores" | "celoSepolia"): string {
  if (ALCHEMY_KEY) {
    const urls = {
      celo: `https://celo-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
      alfajores: `https://celo-alfajores.g.alchemy.com/v2/${ALCHEMY_KEY}`,
      celoSepolia: `https://celo-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    };
    return urls[network];
  }
  const fallback = {
    celo: "https://forno.celo.org",
    alfajores: "https://alfajores-forno.celo-testnet.org",
    celoSepolia: "https://alfajores-forno.celo-testnet.org",
  };
  return fallback[network];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    alfajores: {
      url: getCeloRpc("alfajores"),
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 44787,
      gasPrice: 1000000000,
    },
    celoSepolia: {
      url: getCeloRpc("celoSepolia"),
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 44787,
      gasPrice: 1000000000,
    },
    celo: {
      url: getCeloRpc("celo"),
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 42220,
      gasPrice: 500000000,
    },
  },

  etherscan: {
    apiKey: {
      alfajores: CELOSCAN_API_KEY,
      celoSepolia: CELOSCAN_API_KEY,
      celo: CELOSCAN_API_KEY,
    },
    customChains: [
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
      {
        network: "celoSepolia",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
    ],
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
