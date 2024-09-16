import fs from "fs";
import { ethers } from "ethers";
import {
  arbitrum,
  aurora,
  avalanche,
  base,
  blast,
  bsc,
  celo,
  fantom,
  filecoin,
  fraxtal,
  immutableZkEvm,
  kava,
  linea,
  mainnet,
  mantle,
  moonbeam,
  optimism,
  polygon,
  polygonZkEvm,
  scroll,
  Chain,
} from "viem/chains";
import axios from "axios";
import { Address, isAddress } from "viem";

/*
 * =============================
 * Section: Types and Constants
 * =============================
 */

interface ExtendedChain extends Chain {
  axelarChainId: string;
  axelarChainName: string;
  rpcUrls: {
    default: { http: string[] };
    public: { http: string[] };
  };
}
interface ChainInfo {
  symbol: string;
  name: string;
  axelarChainId: string;
  tokenAddress: string;
  tokenManager: string;
  tokenManagerType: string;
}
interface TokenInfo {
  tokenId: string;
  deployer: string;
  originalMinter: string | null;
  prettySymbol: string;
  decimals: number;
  originAxelarChainId: string;
  tokenType: string;
  deploySalt: string;
  iconUrls: {
    svg: string;
  };
  deploymentMessageId: string;
  coinGeckoId: string;
  chains: ChainInfo[];
}
const tokenManagerTypeMapping: Record<string, number> = {
  nativeInterchainToken: 0,
  mintBurnFrom: 1,
  lockUnlock: 2,
  lockUnlockFee: 3,
  mintBurn: 4,
  gateway: 5,
};
// Reverse mapping
const tokenManagerTypeReverseMapping: Record<number, string> =
  Object.fromEntries(
    Object.entries(tokenManagerTypeMapping).map(([key, value]) => [value, key])
  );
const ITSAddress = "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";
const mainnetChains = [
  {
    ...mainnet,
    rpcUrls: createRpcUrlConfig(mainnet, ["https://eth.llamarpc.com"]),
    axelarChainId: "ethereum",
    axelarChainName: "ethereum",
  },
  {
    ...moonbeam,
    rpcUrls: createRpcUrlConfig(moonbeam, ["https://moonbeam.drpc.org"]),
    axelarChainId: "moonbeam",
    axelarChainName: "Moonbeam",
  },
  {
    ...fantom,
    rpcUrls: createRpcUrlConfig(fantom, ["https://fantom.drpc.org"]),
    axelarChainId: "fantom",
    axelarChainName: "Fantom",
  },
  {
    ...immutableZkEvm,
    rpcUrls: createRpcUrlConfig(immutableZkEvm, [
      "https://immutable-zkevm.drpc.org",
    ]),
    axelarChainId: "immutable",
    axelarChainName: "Immutable",
  },
  {
    ...avalanche,
    rpcUrls: createRpcUrlConfig(avalanche, ["https://1rpc.io/avax/c"]),
    axelarChainId: "avalanche",
    axelarChainName: "Avalanche",
  },
  {
    ...polygon,
    rpcUrls: createRpcUrlConfig(polygon, ["https://polygon.llamarpc.com"]),
    axelarChainId: "polygon",
    axelarChainName: "Polygon",
  },
  {
    ...polygonZkEvm,
    rpcUrls: createRpcUrlConfig(polygonZkEvm, [
      "https://polygon-zkevm.drpc.org",
    ]),
    axelarChainId: "polygon-zkevm",
    axelarChainName: "polygon-zkevm",
  },
  {
    ...bsc,
    rpcUrls: createRpcUrlConfig(bsc, ["https://binance.llamarpc.com"]),
    axelarChainId: "binance",
    axelarChainName: "binance",
  },
  {
    ...arbitrum,
    rpcUrls: createRpcUrlConfig(arbitrum, ["https://arbitrum.drpc.org"]),
    axelarChainId: "arbitrum",
    axelarChainName: "arbitrum",
  },
  {
    ...celo,
    rpcUrls: createRpcUrlConfig(celo, ["https://1rpc.io/celo"]),
    axelarChainId: "celo",
    axelarChainName: "celo",
  },
  {
    ...aurora,
    rpcUrls: createRpcUrlConfig(aurora, ["https://1rpc.io/aurora"]),
    axelarChainId: "aurora",
    axelarChainName: "aurora",
  },
  {
    ...optimism,
    axelarChainId: "optimism",
    axelarChainName: "optimism",
  },
  {
    ...kava,
    rpcUrls: createRpcUrlConfig(kava, ["https://kava.drpc.org"]),
    axelarChainId: "kava",
    axelarChainName: "kava",
  },
  {
    ...filecoin,
    rpcUrls: createRpcUrlConfig(filecoin, ["https://rpc.ankr.com/filecoin"]),
    axelarChainId: "filecoin",
    axelarChainName: "filecoin",
  },
  {
    ...base,
    rpcUrls: createRpcUrlConfig(base, ["https://base.llamarpc.com"]),
    axelarChainId: "base",
    axelarChainName: "base",
  },
  {
    ...linea,
    rpcUrls: createRpcUrlConfig(linea, ["https://1rpc.io/linea"]),
    axelarChainId: "linea",
    axelarChainName: "linea",
  },
  {
    ...mantle,
    rpcUrls: createRpcUrlConfig(mantle, ["https://rpc.mantle.xyz"]),
    axelarChainId: "mantle",
    axelarChainName: "mantle",
  },
  {
    ...scroll,
    rpcUrls: createRpcUrlConfig(scroll, ["https://scroll.drpc.org"]),
    axelarChainId: "scroll",
    axelarChainName: "scroll",
  },
  {
    ...fraxtal,
    rpcUrls: createRpcUrlConfig(fraxtal, ["https://fraxtal.drpc.org"]),
    axelarChainId: "fraxtal",
    axelarChainName: "fraxtal",
  },
  {
    ...blast,
    rpcUrls: createRpcUrlConfig(blast, ["https://rpc.envelop.is/blast"]),
    axelarChainId: "blast",
    axelarChainName: "blast",
  },
];
const ERC20ABI = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];
const ITSABI = [
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "bytes32", name: "salt", type: "bytes32" },
    ],
    name: "interchainTokenId",
    outputs: [{ internalType: "bytes32", name: "tokenId", type: "bytes32" }],
    stateMutability: "pure",
    type: "function",
  },
];
const tokenManagerABI = [
  {
    inputs: [],
    name: "tokenAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "implementationType",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

/*
 * =============================
 * Section: Helper Functions
 * =============================
 */

function createRpcUrlConfig(
  chain: Chain,
  additionalUrls: string[]
): ExtendedChain["rpcUrls"] {
  const httpUrls = [...chain.rpcUrls.default.http, ...additionalUrls];
  return {
    default: { http: httpUrls },
    public: { http: httpUrls },
  };
}

function getRpcUrl(axelarChainId: string): string | null {
  const chainConfig = mainnetChains.find(
    (chain) => chain.axelarChainId === axelarChainId
  );
  return chainConfig ? chainConfig.rpcUrls.default.http[0] : null;
}

/*
 * =============================
 * Section: Main Functions
 * =============================
 */

async function validateTokenInfo(
  tokenInfo: Record<string, TokenInfo>
): Promise<string[]> {
  const errors: string[] = [];

  for (const [tokenId, info] of Object.entries(tokenInfo)) {
    console.log(`\nValidating token: ${tokenId}`);

    // Validate token ID
    if (tokenId !== info.tokenId)
      errors.push(`Mismatch in tokenId: ${tokenId} vs ${info.tokenId}`);

    // Validate CoinGecko ID with CoinGecko API
    if (info.coinGeckoId) {
      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${info.coinGeckoId}`,
          {
            headers: {
              "x-cg-demo-api-key": "CG-3VGxh1K3Qk7jAvpt4DJA3LvB",
            },
          }
        );

        if (response.status === 200) {
          const coinData = response.data;

          // Validate symbol
          if (
            coinData.symbol.toLowerCase() !== info.prettySymbol.toLowerCase()
          ) {
            errors.push(
              `CoinGecko symbol (${coinData.symbol}) does not match prettySymbol (${info.prettySymbol}) for token ${tokenId}`
            );
          }
        } else {
          errors.push(
            `CoinGecko API returned status ${response.status} for token ${tokenId}`
          );
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          errors.push(
            `CoinGecko ID ${info.coinGeckoId} not found for token ${tokenId}`
          );
        } else {
          errors.push(
            `Error fetching data from CoinGecko for token ${tokenId}: ${
              (error as Error).message
            }`
          );
        }
      }
    } else {
      errors.push(`CoinGecko ID is missing for token ${tokenId}`);
    }

    // Validate deployer address
    if (!ethers.isAddress(info.deployer))
      errors.push(`Invalid deployer address: ${info.deployer}`);

    // Validate chains
    for (const chain of info.chains) {
      console.log(`Validating chain: ${chain.axelarChainId}`);

      // Create provider
      const rpcUrl = getRpcUrl(chain.axelarChainId);
      if (!rpcUrl) {
        errors.push(`No RPC URL found for chain ${chain.axelarChainId}`);
        continue;
      }
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Validate token address
      const tokenCode = await provider.getCode(chain.tokenAddress);
      if (tokenCode === "0x") {
        errors.push(
          `Token address ${chain.tokenAddress} does not exist on chain ${chain.axelarChainId}`
        );
      } else {
        // Validate token details
        const tokenContract = new ethers.Contract(
          chain.tokenAddress,
          ERC20ABI,
          provider
        );
        try {
          const tokenName = await tokenContract.name();
          const tokenSymbol = await tokenContract.symbol();
          const tokenDecimals = await tokenContract.decimals();
          const decimalsFromContract = Number(tokenDecimals);

          if (tokenName.toLowerCase() !== chain.name.toLowerCase()) {
            errors.push(
              `Token name mismatch on chain ${chain.axelarChainId}: expected ${chain.name}, got ${tokenName}`
            );
          }
          if (tokenSymbol.toLowerCase() !== chain.symbol.toLowerCase()) {
            errors.push(
              `Token symbol mismatch on chain ${chain.axelarChainId}: expected ${chain.symbol}, got ${tokenSymbol}`
            );
          }
          // If it's original chain, compare with parent object
          if (info.originAxelarChainId === chain.axelarChainId) {
            if (tokenSymbol.toLowerCase() !== info.prettySymbol.toLowerCase()) {
              errors.push(
                `Token symbol mismatch on chain ${chain.axelarChainId}: expected ${info.prettySymbol}, got ${tokenSymbol}`
              );
            }
            if (decimalsFromContract !== info.decimals) {
              errors.push(
                `Token decimals mismatch on chain ${chain.axelarChainId}: expected ${info.decimals}, got ${decimalsFromContract}`
              );
            }
          }
        } catch (error) {
          errors.push(
            `Error fetching token info on chain ${chain.axelarChainId}: ${
              (error as Error).message
            }`
          );
        }
      }

      // Validate token manager
      const managerCode = await provider.getCode(chain.tokenManager);
      if (managerCode === "0x") {
        errors.push(
          `Token manager ${chain.tokenManager} does not exist on chain ${chain.axelarChainId}`
        );
      } else {
        const tokenManagerContract = new ethers.Contract(
          chain.tokenManager,
          tokenManagerABI,
          provider
        );
        try {
          // Validate token manager address
          const managedTokenAddress = await tokenManagerContract.tokenAddress();
          if (
            managedTokenAddress.toLowerCase() !==
            chain.tokenAddress.toLowerCase()
          ) {
            errors.push(
              `Token manager ${chain.tokenManager} on chain ${chain.axelarChainId} does not manage the specified token address ${chain.tokenAddress}`
            );
          }
          // Validate token manager type
          const implementationType =
            await tokenManagerContract.implementationType();
          if (
            Number(implementationType) !==
            tokenManagerTypeMapping[chain.tokenManagerType]
          ) {
            errors.push(
              `Token manager on chain ${chain.axelarChainId} has incorrect implementation type: ` +
                `expected ${
                  tokenManagerTypeReverseMapping[Number(implementationType)] ||
                  "Unknown"
                }, ` +
                `got ${chain.tokenManagerType}`
            );
          }
        } catch (error) {
          errors.push(
            `Error verifying token manager on chain ${chain.axelarChainId}: ${
              (error as Error).message
            }`
          );
        }
      }
    }

    // Validate origin chain
    const originChain = info.chains.find(
      (chain) => chain.axelarChainId === info.originAxelarChainId
    );
    if (!originChain) {
      errors.push(
        `Origin chain ${info.originAxelarChainId} not found in chains list`
      );
    }

    // Validate interchainTokenId with deployer and salt
    if (originChain) {
      const rpcUrl = getRpcUrl(info.originAxelarChainId);
      if (!rpcUrl) {
        errors.push(
          `No RPC URL found for origin chain ${info.originAxelarChainId}`
        );
        continue;
      }
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const itsContract = new ethers.Contract(ITSAddress, ITSABI, provider);

      try {
        const calculatedTokenId = await itsContract.interchainTokenId(
          info.deployer,
          info.deploySalt
        );

        if (calculatedTokenId.toLowerCase() !== tokenId.toLowerCase()) {
          errors.push(
            `Mismatch in interchainTokenId for token ${tokenId}:\n` +
              `  Expected:   ${tokenId}\n` +
              `  Calculated: ${calculatedTokenId}\n` +
              `  Deployer:   ${info.deployer}\n` +
              `  Deploy Salt: ${info.deploySalt}`
          );
        }
      } catch (error) {
        errors.push(
          `Error calculating interchainTokenId for token ${tokenId}: ${
            (error as Error).message
          }`
        );
      }
    }
  }

  return errors;
}

async function main() {
  const newTokens: Record<string, unknown> = JSON.parse(
    fs.readFileSync("./new_tokens.json", "utf8")
  );

  try {
    const validationErrors = await validateTokenInfo(
      newTokens as Record<string, TokenInfo>
    );
    if (validationErrors.length > 0) {
      console.log("Validation errors found:", validationErrors.length);
      for (const error of validationErrors) {
        console.error(error);
      }
      fs.writeFileSync("validation_errors.txt", validationErrors.join("\n"));
      process.exit(1);
    } else {
      console.log("All new token configurations are valid.");
    }
  } catch (error) {
    console.error("An error occurred during validation:", error);
    fs.writeFileSync("validation_errors.txt", (error as Error).toString());
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error in main function:", error);
  process.exit(1);
});
