/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x4c4b20c976e1f0a16ae992cdf72d03352cb49f4cbc60513d660a4e17ba0287b9 \
INITIAL_FROM_TIMESTAMP=1750044238 \
SHOULD_SEND_TXN=true \
REVERT_TX=true \
FEE_SURPLUS=true \
    npx hardhat run scripts/simulateTx_feeDistribution_distribute.ts --network localhost
```
*/

import { Log } from "@ethersproject/providers";
import { Web3FunctionEventContext } from "@gelatonetwork/web3-functions-sdk/*";
import { Web3FunctionResultCallData } from "@gelatonetwork/web3-functions-sdk";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import assert from "node:assert";
import { isSupportedChainId, SupportedChainId } from "../src/config/chains";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";
import { Context, wrapContext } from "../src/lib/gelato";
import { getLogger, Logger } from "../src/lib/logger";
import { feeDistribution } from "../src/web3-functions/feeDistribution/feeDistribution";
import { EVENT_LOG_TOPIC } from "../src/lib/events";
import {
  WNT_PRICE_KEY,
  GMX_PRICE_KEY,
  MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
} from "../src/lib/keys/keys";
import {
  FEE_DISTRIBUTION_COMPLETED_HASH,
  ES_GMX_REFERRAL_REWARDS_SENT_HASH,
  WNT_REFERRAL_REWARDS_SENT_HASH,
  getFeeDistributionEsGmxReferralRewardsSentEventData,
  getFeeDistributionWntReferralRewardsSentEventData,
  getFeeDistributorEventName,
} from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, GMX_DECIMALS } from "../src/lib/number";
import { processLzReceiveSimulation } from "./simulateTx_feeDistribution_processLzReceive";
import { bridgedGmxReceivedSimulation } from "./simulateTx_feeDistribution_bridgedGmxReceived";
import { createSecrets, createStorage, flushStorage } from "../src/lib/storage";

const logger: Logger = getLogger(false);

const initialFromTimestamp = process.env.INITIAL_FROM_TIMESTAMP;
const shouldSendTxnStr = process.env.SHOULD_SEND_TXN;
const revertTxStr = process.env.REVERT_TX;
const feeSurplusStr = process.env.FEE_SURPLUS;

const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;

assert(initialFromTimestamp, "INITIAL_FROM_TIMESTAMP is not set");
assert(shouldSendTxnStr, "SHOULD_SEND_TXN is not set");
assert(revertTxStr, "REVERT_TX is not set");
assert(feeSurplusStr, "FEE_SURPLUS is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const shouldSendTxn = shouldSendTxnStr.toLowerCase() === "true";
const revertTx = revertTxStr.toLowerCase() === "true";
const feeSurplus = feeSurplusStr.toLowerCase() === "true";

const wntPriceKey = WNT_PRICE_KEY;
const gmxPriceKey = GMX_PRICE_KEY;
const maxRewardsEsGmxAmountKey = MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY;

const distributeSimulation = async () => {
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const feeDistributionCompletedTopics = [
    EVENT_LOG_TOPIC,
    FEE_DISTRIBUTION_COMPLETED_HASH,
  ];

  const referralRewardsSentTopics = [
    EVENT_LOG_TOPIC,
    ES_GMX_REFERRAL_REWARDS_SENT_HASH,
    WNT_REFERRAL_REWARDS_SENT_HASH,
  ];

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

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

  const txReceipt = await ethers.provider.getTransactionReceipt(txHash);
  const txLogs = txReceipt.logs;
  logger.log("total logs in second receipt:", txLogs.length);

  const relevantLogs = txLogs.filter(
    (log) =>
      log.topics.length >= 2 &&
      log.topics[0] === feeDistributionCompletedTopics[0] &&
      log.topics[1] === feeDistributionCompletedTopics[1]
  );

  logger.log(
    "matching logs:",
    relevantLogs.length,
    relevantLogs.map((l) => l.logIndex)
  );

  for (const log of relevantLogs) {
    const gelatoContext = createEventContext(
      log,
      {
        initialFromTimestamp,
        wntPriceKey,
        gmxPriceKey,
        maxRewardsEsGmxAmountKey,
        shouldSendTxn,
      },
      chainId
    );
    const context = wrapContext(false, gelatoContext);
    const result = await feeDistribution(context);
    const provider = context.multiChainProvider.default();
    const gelatoMsgSender = new ethers.Wallet(
      gelatoMsgSenderPrivateKey,
      provider
    );

    if (!result.canExec) {
      logger.log("Nothing to execute: ", result);
      return;
    }

    const { eventEmitter } = getContracts(chainId, provider);

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

      const fdCompletedLogs = receipt.logs.filter(
        (l) =>
          l.topics.length >= 2 &&
          l.topics[0] === referralRewardsSentTopics[0] &&
          (l.topics[1] === referralRewardsSentTopics[1] ||
            l.topics[1] === referralRewardsSentTopics[2])
      );

      logger.log(
        "matching logs:",
        fdCompletedLogs.length,
        fdCompletedLogs.map((l) => l.logIndex)
      );

      for (const log of fdCompletedLogs) {
        const eventName = getFeeDistributorEventName(log, eventEmitter);
        if (eventName === "EsGmxReferralRewardsSent") {
          const ev = getFeeDistributionEsGmxReferralRewardsSentEventData(
            log,
            eventEmitter
          );

          logger.log("EsGmxReferralRewardsSent:", {
            esGmxAmount: formatAmount(ev.esGmxAmount, GMX_DECIMALS, 4),
            updatedBonusRewards: formatAmount(
              ev.updatedBonusRewards,
              GMX_DECIMALS,
              4
            ),
          });
        } else if (eventName === "WntReferralRewardsSent") {
          const ev = getFeeDistributionWntReferralRewardsSentEventData(
            log,
            eventEmitter
          );

          logger.log("WntReferralRewardsSent:", {
            wntAmount: formatAmount(ev.wntAmount, GMX_DECIMALS, 4),
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

function createEventContext(
  log: Log,
  userArgs: any,
  chainId: SupportedChainId
): Context<Web3FunctionEventContext> {
  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  return wrapContext(false, {
    log,
    userArgs,
    gelatoArgs: {
      chainId,
      gasPrice: BigNumber.from(0),
    },
    multiChainProvider: {
      default: () => provider,
    } as any,
    secrets: createSecrets(),
    storage: createStorage(),
  });
}

distributeSimulation()
  .then(flushStorage)
  .catch(async (err) => {
    logger.error(err);
    await flushStorage();
    process.exit(1);
  });
