import { ethers } from "hardhat";
import { initCreateTask, run } from "./utils/createTaskUtils";

const main = async () => {
  const { logger, automate } = await initCreateTask();

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer found");
  }

  const { address, isDeployed } = await automate.getDedicatedMsgSender();
  logger.log(
    `The Gelato dedicated msg.sender\n for account: ${signer.address}\n on network: ${process.env.HARDHAT_NETWORK}\n is: ${address}\n dedicated msg.sender already deployed: ${isDeployed}`
  );
};

run(main);
