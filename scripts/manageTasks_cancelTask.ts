import { ethers } from "hardhat";
import { initCreateTask, run } from "./utils/createTaskUtils";
import { TaskTransaction } from "@gelatonetwork/automate-sdk";

const main = async () => {
  const { logger, chainId, automate } = await initCreateTask();

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer found");
  }

  const taskId = process.env.TASK_ID;
  if (!taskId) {
    throw new Error("No signer found");
  }

  logger.log(
    `Canceling task\n with task ID: ${taskId}\n deployed on network: ${process.env.HARDHAT_NETWORK}\n by account: ${signer.address}\n`
  );
  const { tx }: TaskTransaction = await automate.cancelTask(taskId);
  await tx.wait();
  logger.log(
    `Task successfully canceled, taskId: ${taskId} (tx hash: ${tx.hash})`
  );
  logger.log(`> https://app.gelato.network/task/${taskId}?chainId=${chainId}`);
};

run(main);
