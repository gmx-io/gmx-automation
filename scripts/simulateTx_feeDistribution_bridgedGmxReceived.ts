/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x138a4dacc8aa3d23e91c30f76664ea492ce51c9c196ed51c4f38905b3d0eeea2 \
INITIAL_FROM_TIMESTAMP=1754965540 \
SHOULD_SEND_TXN=true \
REVERT_TX=true \
    npx hardhat run scripts/simulateTx_feeDistribution_bridgedGmxReceived.ts --network localhost
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
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH,
  FEE_DISTRIBUTION_COMPLETED_HASH,
  DISTRIBUTION_ID,
  getFeeDistributionCompletedEventData,
} from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, USD_DECIMALS, GMX_DECIMALS } from "../src/lib/number";
import { createSecrets, createStorage, flushStorage } from "../src/lib/storage";

export type RevertOverride = {
  disableRevert: boolean;
};

const logger: Logger = getLogger(false);
const txHash = process.env.TX;

const initialFromTimestamp = process.env.INITIAL_FROM_TIMESTAMP;
const shouldSendTxnStr = process.env.SHOULD_SEND_TXN;
const revertTxStr = process.env.REVERT_TX;

const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;

assert(txHash, "TX is not set");
assert(initialFromTimestamp, "INITIAL_FROM_TIMESTAMP is not set");
assert(shouldSendTxnStr, "SHOULD_SEND_TXN is not set");
assert(revertTxStr, "REVERT_TX is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const shouldSendTxn = shouldSendTxnStr.toLowerCase() === "true";

const wntPriceKey = WNT_PRICE_KEY;
const gmxPriceKey = GMX_PRICE_KEY;
const maxRewardsEsGmxAmountKey = MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY;
const distributionId = DISTRIBUTION_ID;

const feeDistributionBridgedGmxReceivedTopics = [
  EVENT_LOG_TOPIC,
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH,
];

const feeDistributionCompletedTopics = [
  EVENT_LOG_TOPIC,
  FEE_DISTRIBUTION_COMPLETED_HASH,
];

const bridgedGmxReceivedSimulation = async (opts?: RevertOverride) => {
  const envRevert = process.env.REVERT_TX?.toLowerCase() === "true";
  const revertTx = opts?.disableRevert ? false : envRevert;

  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const txReceipt = await ethers.provider.getTransactionReceipt(txHash);
  const txLogs = txReceipt.logs;
  logger.log("total logs in receipt:", txLogs.length);

  const relevantLogs = txLogs.filter(
    (log) =>
      log.topics.length >= 2 &&
      log.topics[0] === feeDistributionBridgedGmxReceivedTopics[0] &&
      log.topics[1] === feeDistributionBridgedGmxReceivedTopics[1]
  );

  logger.log(
    "matching logs:",
    relevantLogs.length,
    relevantLogs.map((l) => l.logIndex)
  );

  const executions: { txHash: string; snapId: string }[] = [];

  for (const log of relevantLogs) {
    const gelatoContext = createEventContext(
      log,
      {
        initialFromTimestamp,
        wntPriceKey,
        gmxPriceKey,
        maxRewardsEsGmxAmountKey,
        distributionId,
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
      const snap = (await provider.send("evm_snapshot", [])) as string;

      const txResponse = await gelatoMsgSender.sendTransaction({
        to: call.to,
        data: call.data,
      });
      const receipt = await txResponse.wait();

      logger.log(`tx mined @ block ${receipt.blockNumber}`);

      logger.log("total logs in receipt:", receipt.logs.length);

      executions.push({ txHash: receipt.transactionHash, snapId: snap });

      const fdCompletedLogs = receipt.logs.filter(
        (l) =>
          l.topics.length >= 2 &&
          l.topics[0] === feeDistributionCompletedTopics[0] &&
          l.topics[1] === feeDistributionCompletedTopics[1]
      );

      logger.log(
        "matching logs:",
        fdCompletedLogs.length,
        fdCompletedLogs.map((l) => l.logIndex)
      );

      for (const log of fdCompletedLogs) {
        const ev = getFeeDistributionCompletedEventData(log, eventEmitter);

        logger.log("FeeDistributionCompleted:", {
          feesV1Usd: formatAmount(ev.feesV1Usd, USD_DECIMALS, 4),
          feesV2Usd: formatAmount(ev.feesV2Usd, USD_DECIMALS, 4),
          wntForKeepers: formatAmount(ev.wntForKeepers, GMX_DECIMALS, 4),
          wntForChainlink: formatAmount(ev.wntForChainlink, GMX_DECIMALS, 4),
          wntForTreasury: formatAmount(ev.wntForTreasury, GMX_DECIMALS, 4),
          wntForReferralRewards: formatAmount(
            ev.wntForReferralRewards,
            GMX_DECIMALS,
            4
          ),
          esGmxForReferralRewards: formatAmount(
            ev.esGmxForReferralRewards,
            GMX_DECIMALS,
            4
          ),
        });
      }

      if (revertTx) {
        await provider.send("evm_revert", [snap]);
      }
    }
  }

  await flushStorage();

  return executions;
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

if (require.main === module) {
  bridgedGmxReceivedSimulation();
}

export { bridgedGmxReceivedSimulation };
