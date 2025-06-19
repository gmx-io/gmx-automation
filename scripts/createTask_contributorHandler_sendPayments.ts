import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import {
  AutomateSDK,
  TaskTransaction,
  TriggerType,
  isAutomateSupported,
} from "@gelatonetwork/automate-sdk";
import { getLogger, Logger } from "../src/lib/logger";
import hre from "hardhat";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";

const logger: Logger = getLogger(true);

const { ethers } = hre;

const main = async () => {
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

  const { contributorHandler } = getContracts(chainId, provider);

  // Create task using automate sdk
  logger.log("Creating Task...");

  const { taskId, tx }: TaskTransaction = await automate.createTask({
    execAddress: contributorHandler.address,
    execSelector: contributorHandler.interface.getSighash("sendPayments()"),
    execAbi: contributorHandler.interface.format("json") as string,
    trigger: {
      type: TriggerType.CRON,
      cron: "0 0 * * WED",
    },
    name: "ContributorHandler.sendPayments()",
    dedicatedMsgSender: true,
  });

  await tx.wait();
  logger.log(`Task created, taskId: ${taskId} (tx hash: ${tx.hash})`);
  logger.log(
    `> https://app.gelato.network/functions/task/${taskId}:${chainId}`
  );
};

main()
  .then(() => {
    process.exit();
  })
  .catch((err) => {
    if (err.response) {
      logger.error("Error Response:", err.response.body);
    } else {
      logger.error("Error:", err.message);
    }
    process.exit(1);
  });
