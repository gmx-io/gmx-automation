import "@nomiclabs/hardhat-ethers";
import { TriggerType } from "@gelatonetwork/automate-sdk";
import { ethers } from "hardhat";
import { initCreateTask, logTaskCreation, run } from "./utils/createTaskUtils";
import { getContracts } from "../src/lib/contracts";

const main = async () => {
  const { logger, chainId, provider, automate } = await initCreateTask();

  const { feeDistributor, feeDistributorVault, gmxAdapter } = getContracts(
    chainId,
    provider
  );

  // Create task using automate sdk
  logger.log("Creating automate task...");

  const { taskId, tx } = await automate.createTask({
    execAddress: feeDistributor.address,
    execSelector: feeDistributor.interface.getSighash("bridgedGmxReceived()"),
    execAbi: feeDistributor.interface.format("json") as string,
    trigger: {
      type: TriggerType.EVENT,
      filter: {
        address: gmxAdapter.address,
        topics: [
          [gmxAdapter.interface.getEventTopic("OFTReceived")],
          [],
          [ethers.utils.hexZeroPad(feeDistributorVault.address, 32)],
        ],
      },
      blockConfirmations: 0,
    },
    name: "FeeDistributor.bridgedGmxReceived()",
    dedicatedMsgSender: true,
  });

  await logTaskCreation(tx, taskId, chainId);
};

run(main);
