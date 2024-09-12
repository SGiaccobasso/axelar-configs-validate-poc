const ethers = require("ethers");
const axios = require("axios");

// InterchainTokenService ABI (simplified for this example)
const interchainTokenServiceABI = [
  "function interchainTokenId(address tokenAddress) view returns (bytes32)",
  "function tokenManagerAddress(bytes32 tokenId) view returns (address)",
  "function tokenAddress(bytes32 tokenId) view returns (address)",
];

async function validateTokenData(tokenData) {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://mainnet.infura.io/v3/YOUR-PROJECT-ID"
  );
  const interchainTokenServiceAddress =
    "0xB5FB4BE02232B1bBA4dC8f81dc24C26978566E3D"; // Ethereum mainnet address
  const interchainTokenService = new ethers.Contract(
    interchainTokenServiceAddress,
    interchainTokenServiceABI,
    provider
  );

  const validationResults = [];

  for (const [tokenId, data] of Object.entries(tokenData)) {
    let isValid = true;
    const errors = [];

    // Validate tokenId format
    if (!ethers.utils.isHexString(tokenId, 32)) {
      isValid = false;
      errors.push("Invalid tokenId format");
    }

    // Validate deployer address
    if (!ethers.utils.isAddress(data.deployer)) {
      isValid = false;
      errors.push("Invalid deployer address");
    }

    // Validate chains data
    for (const chain of data.chains) {
      if (!ethers.utils.isAddress(chain.tokenAddress)) {
        isValid = false;
        errors.push(`Invalid token address for chain ${chain.axelarChainId}`);
      }
      if (!ethers.utils.isAddress(chain.tokenManager)) {
        isValid = false;
        errors.push(
          `Invalid token manager address for chain ${chain.axelarChainId}`
        );
      }

      // Validate using InterchainTokenService
      try {
        const calculatedTokenId =
          await interchainTokenService.interchainTokenId(chain.tokenAddress);
        if (calculatedTokenId !== tokenId) {
          isValid = false;
          errors.push(`Mismatch in tokenId for chain ${chain.axelarChainId}`);
        }

        const tokenManagerAddress =
          await interchainTokenService.tokenManagerAddress(tokenId);
        if (
          tokenManagerAddress.toLowerCase() !== chain.tokenManager.toLowerCase()
        ) {
          isValid = false;
          errors.push(
            `Mismatch in token manager address for chain ${chain.axelarChainId}`
          );
        }

        const tokenAddress = await interchainTokenService.tokenAddress(tokenId);
        if (tokenAddress.toLowerCase() !== chain.tokenAddress.toLowerCase()) {
          isValid = false;
          errors.push(
            `Mismatch in token address for chain ${chain.axelarChainId}`
          );
        }
      } catch (error) {
        isValid = false;
        errors.push(
          `Error validating with InterchainTokenService: ${error.message}`
        );
      }
    }

    // Validate icon URL
    if (data.iconUrls && data.iconUrls.svg) {
      try {
        const response = await axios.get(data.iconUrls.svg);
        if (
          response.status !== 200 ||
          !response.headers["content-type"].includes("image/svg+xml")
        ) {
          isValid = false;
          errors.push("Invalid or inaccessible SVG icon URL");
        }
      } catch (error) {
        isValid = false;
        errors.push("Error accessing SVG icon URL");
      }
    }

    validationResults.push({
      tokenId,
      isValid,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  return validationResults;
}

// Example usage
const tokenData = {
  "0x526c3812e992e0a293ca6f7214f23625acb240e7132eb98e36c11d1428f5a961": {
    tokenId:
      "0x526c3812e992e0a293ca6f7214f23625acb240e7132eb98e36c11d1428f5a961",
    deployer: "0x7270b20603FbB3dF0921381670fbd62b9991aDa4",
    originalMinter: null,
    prettySymbol: "CFG",
    decimals: 18,
    originAxelarChainId: "ethereum",
    tokenType: "custom",
    deploySalt:
      "0x38a835532c2f53812b20282c76ce54b3af6ceed73b13eccd9bc21a3d52b7f9d4",
    iconUrls: {
      svg: "https://raw.githubusercontent.com/axelarnetwork/axelar-configs/main/images/tokens/cvg.svg",
    },
    deploymentMessageId: "0x0d91014FFC62b40C17180fD6cf962332cfba9f08",
    coinGeckoId: "wrapped-centrifuge",
    chains: [
      {
        symbol: "CFG",
        name: "Centrifuge",
        axelarChainId: "ethereum",
        tokenAddress: "0xc221b7e65ffc80de234bbb6667abdd46593d34f0",
        tokenManager: "0x0d91014FFC62b40C17180fD6cf962332cfba9f08",
        tokenManagerType: "mintBurn",
      },
      {
        symbol: "CFG",
        name: "Centrifuge",
        axelarChainId: "base",
        tokenAddress: "0x2b51E2Ec9551F9B87B321f63b805871f1c81ba97",
        tokenManager: "0x0d91014FFC62b40C17180fD6cf962332cfba9f08",
        tokenManagerType: "mintBurn",
      },
    ],
  },
};

validateTokenData(tokenData)
  .then((results) => console.log(JSON.stringify(results, null, 2)))
  .catch((error) => console.error("Validation error:", error));
