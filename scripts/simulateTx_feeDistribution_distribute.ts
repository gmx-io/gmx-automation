/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x5ab895df8c4b227fc77ada660d5a2cab40b6cd9d5902ca3056ff28a8a762a539 \
INITIAL_FROM_TIMESTAMP=1746096466 \
WNT_PRICE_KEY=0x66af7011ac8687696c07a8c00f07a4cd3b8574eccaa9d8609991b2824888e113 \
GMX_PRICE_KEY=0xfb0c2a8c499410abada8871e1b7bb6142f067b1b04951090b658c6843dcf78c9 \
ESGMX_REWARDS_KEY=0xdc01aee9b14bf3c45fd436469d8dd2c0d19d1926910cfe7173c8e683ed3c0c57 \
SHOULD_SEND_TXN=false \
REVERT_TX=true \
FEE_SURPLUS=true \
    npx hardhat run scripts/simulateTx_feeDistribution_distribute.ts --network localhost
```
*/

import { Log } from "@ethersproject/providers";
import { Web3FunctionEventContext } from "@gelatonetwork/web3-functions-sdk/*";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import assert from "node:assert";
import { isSupportedChainId, SupportedChainId } from "../src/config/chains";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";
import { Context, wrapContext } from "../src/lib/gelato";
import { getLogger, Logger } from "../src/lib/logger";
import { feeDistribution } from "../src/web3-functions/feeDistribution/feeDistribution";
import {
  getFeeDistributionEsGmxReferralRewardsSentEventData,
  getFeeDistributionWntReferralRewardsSentEventData,
  getFeeDistributorEventName,
} from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, GMX_DECIMALS } from "../src/lib/number";
import { processLzReceiveSimulation } from "./simulateTx_feeDistribution_processLzReceive";
import { bridgedGmxReceivedSimulation } from "./simulateTx_feeDistribution_bridgedGmxReceived";
import { fileStore, flushStorage } from "../src/lib/storage";

const logger: Logger = getLogger();

const initialFromTimestamp = process.env.INITIAL_FROM_TIMESTAMP;
const wntPriceKey = process.env.WNT_PRICE_KEY;
const gmxPriceKey = process.env.GMX_PRICE_KEY;
const esGmxRewardsKey = process.env.ESGMX_REWARDS_KEY;
const shouldSendTxnStr = process.env.SHOULD_SEND_TXN;
const revertTxStr = process.env.REVERT_TX;
const feeSurplusStr = process.env.FEE_SURPLUS;

const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;

assert(initialFromTimestamp, "INITIAL_FROM_TIMESTAMP is not set");
assert(wntPriceKey, "WNT_PRICE_KEY is not set");
assert(gmxPriceKey, "GMX_PRICE_KEY is not set");
assert(esGmxRewardsKey, "ESGMX_REWARDS_KEY is not set");
assert(shouldSendTxnStr, "SHOULD_SEND_TXN is not set");
assert(revertTxStr, "REVERT_TX is not set");
assert(feeSurplusStr, "FEE_SURPLUS is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const shouldSendTxn = shouldSendTxnStr.toLowerCase() === "true";
const revertTx = revertTxStr.toLowerCase() === "true";
const feeSurplus = feeSurplusStr.toLowerCase() === "true";

const topics = [
  "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
  "0xb4f52781abb3fd345f04301fe57915de07b9d6292be94dce510aa8d59dd589e1", // EventName = FeeDistributionCompleted
];

const topics2 = [
  "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
  "0x7e7a1877476b749fc6ce109adb20e9e217862a35d9ba0f348dd579237a110945", // EventName = EsGmxReferralRewardsSent
  "0x86ef018967188096cafdce10b5feb80ce4bd3701f0013eac9bfd7589e527a5cb", // EventName = WntReferralRewardsSent
];

const distributeSimulation = async () => {
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  let executions: { txHash: string; snapId: string }[];

  if (feeSurplus) {
    executions = await processLzReceiveSimulation({ disableRevert: true });
  } else {
    executions = await bridgedGmxReceivedSimulation({ disableRevert: true });
  }
  await flushStorage();

  logger.log("first txHash:", executions[0]?.txHash);
  logger.log("first snapId:", executions[0]?.snapId);

  const txReceipt = await ethers.provider.getTransactionReceipt(
    executions[0].txHash
  );
  const txLogs = txReceipt.logs;
  logger.log("total logs in second receipt:", txLogs.length);

  const relevantLogs = txLogs.filter(
    (log) =>
      log.topics.length >= 2 &&
      log.topics[0] === topics[0] &&
      log.topics[1] === topics[1]
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
        esGmxRewardsKey,
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

    for (const call of result.callData) {
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
          l.topics[0] === topics2[0] &&
          (l.topics[1] === topics2[1] || l.topics[1] === topics2[2])
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
        } else {
          const ev = getFeeDistributionWntReferralRewardsSentEventData(
            log,
            eventEmitter
          );

          logger.log("WntReferralRewardsSent:", {
            wntAmount: formatAmount(ev.wntAmount, GMX_DECIMALS, 4),
          });
        }
      }
    }

    if (revertTx) {
      await provider.send("evm_revert", [executions[0].snapId]);
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

  const storage = {
    async get(key: string) {
      return fileStore[key];
    },
    async set(key: string, val: string) {
      fileStore[key] = val;
    },
    async delete(key: string) {
      delete fileStore[key];
    },
    async getKeys() {
      return Object.keys(fileStore);
    },
    async getSize() {
      return Object.keys(fileStore).length;
    },
  };

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
    secrets: {
      get(key?) {
        if (!key) {
          return null as any;
        }
        return null as any; // update if there is a simulation script that includes secrets
      },
    },
    storage,
  });
}

distributeSimulation()
  .then(flushStorage)
  .catch(async (err) => {
    logger.error(err);
    await flushStorage();
    process.exit(1);
  });
