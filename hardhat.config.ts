import { HardhatUserConfig } from "hardhat/config";

// PLUGINS
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";

// ================================= TASKS =========================================

// Process Env Variables
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

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
};

export default config;
