/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x1b558201ca91fa11dbd8b5b805cb40f7ac3b3d3a34c14a86a47c1306e504c70d \
REVERT_TX=true \
FEE_SURPLUS=true \
    npx hardhat run scripts/simulateTx_feeDistribution_distribute.ts --network localhost
```
*/

import { ethers } from "hardhat";
import assert from "node:assert";
import { Web3FunctionResultCallData } from "@gelatonetwork/web3-functions-sdk";
import {
  FEE_DISTRIBUTION_EVENT_TOPICS,
  TOTAL_ES_GMX_REWARDS_INCREASED_TOPICS,
  flushStorage,
  initSimulateTx,
  createEventContext,
} from "./utils/simulateTxUtils";
import { wrapContext } from "../src/lib/gelato";
import { getLogger, Logger } from "../src/lib/logger";
import { feeDistribution } from "../src/web3-functions/feeDistribution/feeDistribution";
import {
  WNT_PRICE_KEY,
  GMX_PRICE_KEY,
  MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
} from "../src/lib/keys/keys";
import {
  FEE_DISTRIBUTION_COMPLETED,
  DISTRIBUTION_ID,
  getFeeDistributionTotalEsGmxRewardsIncreasedEventData,
  getFeeDistributorEventName,
  getFeeDistributorEventDescription,
} from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, GMX_DECIMALS } from "../src/lib/number";
import { processLzReceiveSimulation } from "./simulateTx_feeDistribution_processLzReceive";
import { bridgedGmxReceivedSimulation } from "./simulateTx_feeDistribution_bridgedGmxReceived";

const logger: Logger = getLogger(false);

const revertTxStr = process.env.REVERT_TX;
const feeSurplusStr = process.env.FEE_SURPLUS;
const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;
assert(revertTxStr, "REVERT_TX is not set");
assert(feeSurplusStr, "FEE_SURPLUS is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const revertTx = revertTxStr.toLowerCase() === "true";
const feeSurplus = feeSurplusStr.toLowerCase() === "true";

const wntPriceKey = WNT_PRICE_KEY;
const gmxPriceKey = GMX_PRICE_KEY;
const maxRewardsEsGmxAmountKey = MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY;
const distributionId = DISTRIBUTION_ID;

const distributeSimulation = async () => {
  const { chainId, provider, eventEmitter } = await initSimulateTx();

  let executions: { txHash: string; snapId: string }[] | undefined;

  if (feeSurplus) {
    executions =
      (await processLzReceiveSimulation({ disableRevert: true })) || [];
  } else {
    executions =
      (await bridgedGmxReceivedSimulation({ disableRevert: true })) || [];
  }
  await flushStorage();

  if (!executions) {
    throw new Error("No executions");
  }

  const txHash = executions[0]?.txHash;

  if (!txHash) {
    throw new Error("No txHash");
  }

  const snapId = executions[0]?.snapId;

  if (!snapId) {
    throw new Error("No snapId");
  }

  logger.log("first txHash:", txHash);
  logger.log("first snapId:", snapId);

  const txReceipt = await provider.getTransactionReceipt(txHash);
  const txLogs = txReceipt.logs;
  logger.log("total logs in second receipt:", txLogs.length);

  let relevantLogs = txLogs.filter(
    (l) =>
      l.topics.length >= 2 &&
      l.topics[0] === FEE_DISTRIBUTION_EVENT_TOPICS[0] &&
      l.topics[1] === FEE_DISTRIBUTION_EVENT_TOPICS[1] &&
      getFeeDistributorEventDescription(l, eventEmitter) ===
        FEE_DISTRIBUTION_COMPLETED
  );

  logger.log(
    "matching logs:",
    relevantLogs.length,
    relevantLogs.map((l) => l.logIndex)
  );

  for (const l of relevantLogs) {
    const gelatoContext = createEventContext(
      l,
      {
        wntPriceKey,
        gmxPriceKey,
        maxRewardsEsGmxAmountKey,
        distributionId,
      },
      chainId
    );
    const context = wrapContext(false, gelatoContext);
    const result = await feeDistribution(context);
    const gelatoMsgSender = new ethers.Wallet(
      gelatoMsgSenderPrivateKey,
      provider
    );

    if (!result.canExec) {
      logger.log("Nothing to execute: ", result);
      return;
    }

    for (const call of result.callData as Web3FunctionResultCallData[]) {
      const txResponse = await gelatoMsgSender.sendTransaction({
        to: call.to,
        data: call.data,
      });
      const receipt = await txResponse.wait();

      logger.log(`tx mined @ block ${receipt.blockNumber}`);

      logger.log(
        "total logs in referral rewards receipt:",
        receipt.logs.length
      );

      relevantLogs = receipt.logs.filter(
        (l) =>
          l.topics.length >= 2 &&
          l.topics[0] === TOTAL_ES_GMX_REWARDS_INCREASED_TOPICS[0] &&
          l.topics[1] === TOTAL_ES_GMX_REWARDS_INCREASED_TOPICS[1]
      );

      logger.log(
        "matching logs:",
        relevantLogs.length,
        relevantLogs.map((l) => l.logIndex)
      );

      for (const l of relevantLogs) {
        const eventName = getFeeDistributorEventName(l, eventEmitter);
        if (eventName === "TotalEsGmxRewardsIncreased") {
          const event = getFeeDistributionTotalEsGmxRewardsIncreasedEventData(
            l,
            eventEmitter
          );

          logger.log("TotalEsGmxRewardsIncreased:", {
            account: event.account,
            amount: formatAmount(event.amount, GMX_DECIMALS, 4),
            totalEsGmxRewards: formatAmount(
              event.totalEsGmxRewards,
              GMX_DECIMALS,
              4
            ),
          });
        } else {
          throw new Error("Unsupported event: " + eventName);
        }
      }
    }

    if (revertTx) {
      await provider.send("evm_revert", [snapId]);
    }
  }
};

distributeSimulation()
  .then(flushStorage)
  .catch(async (err) => {
    logger.error(err);
    await flushStorage();
    process.exit(1);
  });
