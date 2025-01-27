import { HardhatUserConfig } from "hardhat/config";

import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";

import * as dotenv from "dotenv";
import assert from "assert";

dotenv.config({ path: __dirname + "/.env" });

const ARBITRUM_PRIVATE_KEY = process.env.ARBITRUM_PRIVATE_KEY;
assert.ok(ARBITRUM_PRIVATE_KEY, "no ARBITRUM_PRIVATE_KEY in .env");
const ARBITRUM_SEPOLIA_PRIVATE_KEY = process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY;
assert.ok(
  ARBITRUM_SEPOLIA_PRIVATE_KEY,
  "no ARBITRUM_SEPOLIA_PRIVATE_KEY in .env"
);
const AVALANCHE_PRIVATE_KEY = process.env.AVALANCHE_PRIVATE_KEY;
assert.ok(AVALANCHE_PRIVATE_KEY, "no AVALANCHE_PRIVATE_KEY in .env");

const config: HardhatUserConfig = {
  paths: {
    tests: "./src/test",
  },

  w3f: {
    rootDir: "./src/web3-functions",
    debug: false,
    networks: ["hardhat"],
  },

  defaultNetwork: "hardhat",

  networks: {
    arbitrum: {
      chainId: 42161,
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [ARBITRUM_PRIVATE_KEY],
    },
  },
};

export default config;
