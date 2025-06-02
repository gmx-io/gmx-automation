import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import {
  AutomateSDK,
  TriggerType,
  Web3Function,
} from "@gelatonetwork/automate-sdk";
import { getLogger, Logger } from "../src/lib/logger";
import hre from "hardhat";
import { getAddress } from "../src/config/addresses";
import { EVENT_LOG_TOPIC } from "../src/lib/events";
import {
  FEE_DISTRIBUTION_DATA_RECEIVED_HASH,
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH,
  FEE_DISTRIBUTION_COMPLETED_HASH,
} from "../src/domain/fee/feeDistributionUtils";

const logger: Logger = getLogger(true);

const { ethers, w3f } = hre;

const main = async () => {
  const feeDistributionW3f = w3f.get("feeDistribution");

  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error("No deployer signer found");
  }

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
      wntPriceKey:
        "0x66af7011ac8687696c07a8c00f07a4cd3b8574eccaa9d8609991b2824888e113",
      gmxPriceKey:
        "0xfb0c2a8c499410abada8871e1b7bb6142f067b1b04951090b658c6843dcf78c9",
      esGmxRewardsKey:
        "0xdc01aee9b14bf3c45fd436469d8dd2c0d19d1926910cfe7173c8e683ed3c0c57",
      shouldSendTxn: "true",
    },
    trigger: {
      type: TriggerType.EVENT,
      filter: {
        address: getAddress(chainId, "eventEmitter"),
        topics: [
          [EVENT_LOG_TOPIC],
          [
            FEE_DISTRIBUTION_DATA_RECEIVED_HASH,
            FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH,
            FEE_DISTRIBUTION_COMPLETED_HASH,
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
