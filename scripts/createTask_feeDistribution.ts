import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { TriggerType } from "@gelatonetwork/automate-sdk";
import hre from "hardhat";
import assert from "node:assert";
import { initCreateTask, logTaskCreation, run } from "./utils/createTaskUtils";
import { getAddress } from "../src/config/addresses";
import { EVENT_LOG_TOPIC } from "../src/lib/events";
import {
  WNT_PRICE_KEY,
  GMX_PRICE_KEY,
  MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
} from "../src/lib/keys/keys";
import {
  FEE_DISTRIBUTION_DATA_RECEIVED_HASH,
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH,
  FEE_DISTRIBUTION_COMPLETED_HASH,
} from "../src/domain/fee/feeDistributionUtils";

const { w3f } = hre;

const main = async () => {
  assert.ok(
    process.env.INITIAL_FROM_TIMESTAMP,
    "no INITIAL_FROM_TIMESTAMP in .env"
  );
  assert.ok(
    process.env.DISTRIBUTION_ID,
    "no DISTRIBUTION_ID in .env"
  );
  assert.ok(process.env.SHOULD_SEND_TXN, "no SHOULD_SEND_TXN in .env");

  const { logger, chainId, automate, web3Function } = await initCreateTask();

  const feeDistributionW3f = w3f.get("feeDistribution");

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
      initialFromTimestamp: process.env.INITIAL_FROM_TIMESTAMP,
      wntPriceKey: WNT_PRICE_KEY,
      gmxPriceKey: GMX_PRICE_KEY,
      maxRewardsEsGmxAmountKey: MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
      distributionId: process.env.DISTRIBUTION_ID,
      shouldSendTxn: process.env.SHOULD_SEND_TXN,
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

  await logTaskCreation(tx, taskId, chainId);

  // Set task specific secrets
  const secrets = feeDistributionW3f.getSecrets();
  if (Object.keys(secrets).length > 0) {
    await web3Function.secrets.set(secrets, taskId);
    logger.log(`Secrets set`);
  }
};

run(main);
