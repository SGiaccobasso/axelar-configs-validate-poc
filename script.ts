import fs from "fs";
import { ethers } from "ethers";
import axios from "axios";
/*
 * =============================
 * Section: Types and Constants
 * =============================
 */
interface ChainInfo {
  symbol: string;
  name: string;
  axelarChainId: string;
  tokenAddress: string;
  tokenManager: string;
  tokenManagerType: TokenManagerType;
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
type TokenManagerType = (typeof tokenManagerTypes)[number];
// Constants
const tokenManagerTypes = [
  "nativeInterchainToken",
  "mintBurnFrom",
  "lockUnlock",
  "lockUnlockFee",
  "mintBurn",
  "gateway",
] as const;
const ITSAddress = "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";
const CHAIN_CONFIGS_URL =
  "https://axelar-mainnet.s3.us-east-2.amazonaws.com/configs/mainnet-config-1.x.json";
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
async function getAxelarChains() {
  const { data } = await axios.get(CHAIN_CONFIGS_URL);
  return data.chains;
}

async function getRpcUrl(axelarChainId: string): Promise<string | null> {
  const chains = await getAxelarChains();
  return chains[axelarChainId].config.rpc[0];
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
      const rpcUrl = await getRpcUrl(chain.axelarChainId);
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
            tokenManagerTypes.indexOf(chain.tokenManagerType)
          ) {
            errors.push(
              `Token manager on chain ${chain.axelarChainId} has incorrect implementation type: ` +
                `expected ${
                  tokenManagerTypes[Number(implementationType)] || "Unknown"
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
      const rpcUrl = await getRpcUrl(info.originAxelarChainId);
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
