import "@nomiclabs/hardhat-ethers";
import { TriggerType } from "@gelatonetwork/automate-sdk";
import { initCreateTask, logTaskCreation, run } from "./utils/createTaskUtils";
import { getContracts } from "../src/lib/contracts";

const main = async () => {
  const { logger, chainId, provider, automate } = await initCreateTask();

  const { feeDistributor } = getContracts(chainId, provider);

  // Create task using automate sdk
  logger.log("Creating automate task...");

  const { taskId, tx } = await automate.createTask({
    execAddress: feeDistributor.address,
    execSelector: feeDistributor.interface.getSighash("initiateDistribute()"),
    execAbi: feeDistributor.interface.format("json") as string,
    trigger: {
      type: TriggerType.CRON,
      cron: "0 0 * * WED",
    },
    name: "FeeDistributor.initiateDistribute()",
    dedicatedMsgSender: true,
  });

  await logTaskCreation(tx, taskId, chainId);
};

run(main);
