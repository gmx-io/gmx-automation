import "@nomiclabs/hardhat-ethers";
import { TriggerType } from "@gelatonetwork/automate-sdk";
import { initCreateTask, logTaskCreation, run } from "./utils/createTaskUtils";
import { getContracts } from "../src/lib/contracts";

const main = async () => {
  const { logger, chainId, provider, automate } = await initCreateTask();

  const { contributorHandler } = getContracts(chainId, provider);

  // Create task using automate sdk
  logger.log("Creating automate task...");

  const { taskId, tx } = await automate.createTask({
    execAddress: contributorHandler.address,
    execSelector: contributorHandler.interface.getSighash("sendPayments()"),
    execAbi: contributorHandler.interface.format("json") as string,
    trigger: {
      type: TriggerType.CRON,
      cron: "0 0 28 * *",
    },
    name: "ContributorHandler.sendPayments()",
    dedicatedMsgSender: true,
  });

  await logTaskCreation(tx, taskId, chainId);
};

run(main);
