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
const COINGECKO_API_KEY = "CG-3VGxh1K3Qk7jAvpt4DJA3LvB";
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
  try {
    const chains = await getAxelarChains();
    return chains[axelarChainId].config.rpc[0];
  } catch (error) {
    throw new Error(
      `Error fetching chain configs for chain '${axelarChainId}': ${
        (error as Error).message
      }`
    );
  }
}

function exitWitheError(errorMessage: string) {
  console.error(errorMessage);
  fs.writeFileSync("validation_errors.txt", errorMessage);
  process.exit(1);
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
    try {
      await validateTokenId(tokenId, info);
      await validateCoinGeckoId(tokenId, info);
      await validateDeployerAddress(info);
      await validateChains(tokenId, info);
      await validateOriginChain(info);
      await validateInterchainTokenId(tokenId, info);
    } catch (error) {
      exitWitheError((error as Error).message);
    }
  }
  return errors;
}

async function validateTokenId(
  tokenId: string,
  info: TokenInfo
): Promise<void> {
  if (tokenId !== info.tokenId) {
    throw new Error(`Mismatch in tokenId: ${tokenId} vs ${info.tokenId}`);
  }
}

async function validateCoinGeckoId(
  tokenId: string,
  info: TokenInfo
): Promise<void> {
  if (!info.coinGeckoId) {
    throw new Error(`CoinGecko ID is missing for token ${tokenId}`);
  }

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${info.coinGeckoId}`,
      {
        headers: {
          "x-cg-demo-api-key": COINGECKO_API_KEY,
        },
      }
    );

    if (response.status !== 200)
      throw new Error(
        `CoinGecko API returned status ${response.status} for token ${tokenId}`
      );

    const coinData = response.data;
    if (coinData.symbol.toLowerCase() !== info.prettySymbol.toLowerCase()) {
      throw new Error(
        `CoinGecko symbol (${coinData.symbol}) does not match prettySymbol (${info.prettySymbol}) for token ${tokenId}`
      );
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error(
        `CoinGecko ID ${info.coinGeckoId} not found for token ${tokenId}`
      );
    }
    throw new Error(
      `Error fetching data from CoinGecko for token ${tokenId}: ${
        (error as Error).message
      }`
    );
  }
}

async function validateDeployerAddress(info: TokenInfo): Promise<void> {
  if (!ethers.isAddress(info.deployer)) {
    throw new Error(`Invalid deployer address: ${info.deployer}`);
  }
}

async function validateChains(tokenId: string, info: TokenInfo): Promise<void> {
  for (const chain of info.chains) {
    console.log(`Validating chain: ${chain.axelarChainId}`);

    const rpcUrl = await getRpcUrl(chain.axelarChainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL found for chain ${chain.axelarChainId}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    await validateTokenAddress(chain, provider);
    await validateTokenDetails(chain, info, provider);
    await validateTokenManager(chain, provider);
  }
}

async function validateTokenAddress(
  chain: any,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  const tokenCode = await provider.getCode(chain.tokenAddress);
  if (tokenCode === "0x")
    throw new Error(
      `Token address ${chain.tokenAddress} does not exist on chain ${chain.axelarChainId}`
    );
}

async function validateTokenDetails(
  chain: any,
  info: TokenInfo,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  const tokenContract = new ethers.Contract(
    chain.tokenAddress,
    ERC20ABI,
    provider
  );
  const tokenName = await tokenContract.name();
  const tokenSymbol = await tokenContract.symbol();
  const tokenDecimals = await tokenContract.decimals();
  const decimalsFromContract = Number(tokenDecimals);

  if (tokenName.toLowerCase() !== chain.name.toLowerCase())
    throw new Error(
      `Token name mismatch on chain ${chain.axelarChainId}: expected ${chain.name}, got ${tokenName}`
    );
  if (tokenSymbol.toLowerCase() !== chain.symbol.toLowerCase())
    throw new Error(
      `Token symbol mismatch on chain ${chain.axelarChainId}: expected ${chain.symbol}, got ${tokenSymbol}`
    );
  if (info.originAxelarChainId === chain.axelarChainId) {
    if (tokenSymbol.toLowerCase() !== info.prettySymbol.toLowerCase())
      throw new Error(
        `Token symbol mismatch on chain ${chain.axelarChainId}: expected ${info.prettySymbol}, got ${tokenSymbol}`
      );
    if (decimalsFromContract !== info.decimals)
      throw new Error(
        `Token decimals mismatch on chain ${chain.axelarChainId}: expected ${info.decimals}, got ${decimalsFromContract}`
      );
  }
}

async function validateTokenManager(
  chain: any,
  provider: ethers.JsonRpcProvider
): Promise<void> {
  const managerCode = await provider.getCode(chain.tokenManager);
  if (managerCode === "0x") {
    throw new Error(
      `Token manager ${chain.tokenManager} does not exist on chain ${chain.axelarChainId}`
    );
  }

  const tokenManagerContract = new ethers.Contract(
    chain.tokenManager,
    tokenManagerABI,
    provider
  );
  const managedTokenAddress = await tokenManagerContract.tokenAddress();
  if (managedTokenAddress.toLowerCase() !== chain.tokenAddress.toLowerCase())
    throw new Error(
      `Token manager ${chain.tokenManager} on chain ${chain.axelarChainId} does not manage the specified token address ${chain.tokenAddress}`
    );

  const implementationType = await tokenManagerContract.implementationType();
  if (
    Number(implementationType) !==
    tokenManagerTypes.indexOf(chain.tokenManagerType)
  )
    throw new Error(
      `Token manager on chain ${
        chain.axelarChainId
      } has incorrect implementation type: expected '${
        tokenManagerTypes[Number(implementationType)] || "Unknown"
      }', got '${chain.tokenManagerType}'`
    );
}

async function validateOriginChain(info: TokenInfo): Promise<void> {
  const originChain = info.chains.find(
    (chain) => chain.axelarChainId === info.originAxelarChainId
  );
  if (!originChain) {
    throw new Error(
      `Origin chain ${info.originAxelarChainId} not found in chains list`
    );
  }
}

async function validateInterchainTokenId(
  tokenId: string,
  info: TokenInfo
): Promise<void> {
  const rpcUrl = await getRpcUrl(info.originAxelarChainId);
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL found for origin chain ${info.originAxelarChainId}`
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const itsContract = new ethers.Contract(ITSAddress, ITSABI, provider);

  const calculatedTokenId = await itsContract.interchainTokenId(
    info.deployer,
    info.deploySalt
  );

  if (calculatedTokenId.toLowerCase() !== tokenId.toLowerCase())
    throw new Error(
      `Mismatch in interchainTokenId for token ${tokenId}:\n` +
        `Deployer or Deploy Salt could be incorrect\n` +
        `  Expected:   ${tokenId}\n` +
        `  Calculated: ${calculatedTokenId}\n` +
        `  Deployer:   ${info.deployer}\n` +
        `  Deploy Salt: ${info.deploySalt}`
    );
}

async function main() {
  try {
    // Read new token configurations from file
    const newTokens: Record<string, TokenInfo> = JSON.parse(
      fs.readFileSync("./new_tokens.json", "utf8")
    );
    await validateTokenInfo(newTokens);
  } catch (error) {
    exitWitheError((error as Error).message);
  }
}

main();
