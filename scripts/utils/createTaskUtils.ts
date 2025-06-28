import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import {
  AutomateSDK,
  isAutomateSupported,
  Web3Function,
} from "@gelatonetwork/automate-sdk";
import { ethers } from "hardhat";
import { getRpcProviderUrl } from "../../src/config/providers";
import { getLogger, Logger } from "../../src/lib/logger";
import type { ContractTransaction } from "ethers";

const logger: Logger = getLogger(false);

export async function initCreateTask() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer found");
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (!isAutomateSupported(chainId)) {
    throw new Error(`Gelato Automate network not supported (${chainId})`);
  }

  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  const automate = new AutomateSDK(chainId, deployer);

  const web3Function = new Web3Function(chainId, deployer);

  return { logger, chainId, provider, automate, web3Function };
}

export async function logTaskCreation(
  tx: ContractTransaction,
  taskId: string | undefined,
  chainId: number
) {
  if (!taskId) {
    throw new Error("taskId missing from Automate SDK response");
  }
  await tx.wait();
  logger.log(`Task created, taskId: ${taskId} (tx hash: ${tx.hash})`);
  logger.log(
    `> https://app.gelato.network/functions/task/${taskId}:${chainId}`
  );
}

export function run(main: () => Promise<void>) {
  main()
    .then(() => process.exit())
    .catch((err) => {
      if (err?.response) {
        logger.error("Error Response:", err.response.body);
      } else {
        logger.error("Error:", err?.message ?? err);
      }
      process.exit(1);
    });
}
