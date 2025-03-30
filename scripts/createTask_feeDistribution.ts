import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import {
  AutomateSDK,
  TriggerType,
  Web3Function,
} from "@gelatonetwork/automate-sdk";
import { Logger } from "@gelatonetwork/web3-functions-sdk/*";
import hre from "hardhat";
import { getAddress } from "../src/config/addresses";

const logger: Logger;

const { ethers, w3f } = hre;

const main = async () => {
  const feeDistributionW3f = w3f.get("feeDistribution");

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const automate = new AutomateSDK(chainId, deployer);
  const web3Function = new Web3Function(chainId, deployer);

  // Deploy Web3Function on IPFS
  logger.log("Deploying Web3Function on IPFS...");
  const cid = await feeDistributionW3f.deploy();
  logger.log(`Web3Function IPFS CID: ${cid}`);

  // Create task using automate sdk
  logger.log("Creating automate task...");

  const { taskId, tx } = await automate.createBatchExecTask({
    name: "FeeDistribution",
    web3FunctionHash: cid,
    web3FunctionArgs: {
      initialFromTimestamp: "timestamp to be added",
      esGmxRewardsKey:
        "0x40526da0fbc85a8524586c9c30616320eabcc480b42239a800f3287664b8b34f",
      skipSendNativeToken: "true",
      shouldSendTxn: "false",
    },
    trigger: {
      type: TriggerType.EVENT,
      filter: {
        address: getAddress(chainId, "eventEmitter"),
        topics: [
          [
            "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
          ],
          [
            "0x18b8c59f2f59ef65527915db9544ac15717fd3d18bc754a45263b232b1529ebe", // EventName = FeeDistributionBridgedGmxReceived
            "0x55ac1650a32c2b1a50780bc0322564f8a36092ee04680ea414c44c7283bc3937", // EventName = FeeDistributionDataReceived
            "0xb4f52781abb3fd345f04301fe57915de07b9d6292be94dce510aa8d59dd589e1", // EventName = FeeDistributionCompleted
          ],
        ],
      },
      blockConfirmations: 0,
    },
  });

  await tx.wait();
  logger.log(`Task created, taskId: ${taskId} (tx hash: ${tx.hash})`);
  logger.log(
    `> https://app.gelato.network/functions/task/${taskId}:${chainId}`
  );

  // Set task specific secrets
  const secrets = feeDistributionW3f.getSecrets();
  if (Object.keys(secrets).length > 0) {
    await web3Function.secrets.set(secrets, taskId);
    logger.log(`Secrets set`);
  }
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
