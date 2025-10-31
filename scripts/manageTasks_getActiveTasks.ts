import { ethers } from "hardhat";
import { initCreateTask, run } from "./utils/createTaskUtils";
import { Task } from "@gelatonetwork/automate-sdk";

const main = async () => {
  const { logger, automate } = await initCreateTask();

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer found");
  }

  const activeTasks = await automate.getActiveTasks();
  logger.log(
    `Active tasks deployed on\n network: ${process.env.HARDHAT_NETWORK}\n by account: ${signer.address}\n`
  );
  activeTasks.forEach((task: Task) => {
    logger.log(`- ${task.name} (${task.taskId})`);
  });
};

run(main);
