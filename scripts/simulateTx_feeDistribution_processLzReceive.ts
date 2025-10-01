/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x1b558201ca91fa11dbd8b5b805cb40f7ac3b3d3a34c14a86a47c1306e504c70d \
REVERT_TX=true \
    npx hardhat run scripts/simulateTx_feeDistribution_processLzReceive.ts --network localhost
```
*/

import { ethers } from "hardhat";
import assert from "node:assert";
import { Web3FunctionResultCallData } from "@gelatonetwork/web3-functions-sdk";
import {
  FEE_DISTRIBUTION_EVENT_TOPICS,
  flushStorage,
  createEventContext,
} from "./utils/simulateTxUtils";
import { isSupportedChainId } from "../src/config/chains";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";
import { wrapContext } from "../src/lib/gelato";
import { getLogger, Logger } from "../src/lib/logger";
import { feeDistribution } from "../src/web3-functions/feeDistribution/feeDistribution";
import {
  WNT_PRICE_KEY,
  GMX_PRICE_KEY,
  MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
} from "../src/lib/keys/keys";
import {
  FEE_DISTRIBUTION_DATA_RECEIVED,
  FEE_DISTRIBUTION_COMPLETED,
  DISTRIBUTION_ID,
  getFeeDistributionCompletedEventData,
  getFeeDistributorEventDescription,
} from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, USD_DECIMALS, GMX_DECIMALS } from "../src/lib/number";

export type RevertOverride = {
  disableRevert: boolean;
};

const logger: Logger = getLogger(false);
const txHash = process.env.TX;

const revertTxStr = process.env.REVERT_TX;

const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;

assert(txHash, "TX is not set");
assert(revertTxStr, "REVERT_TX is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const wntPriceKey = WNT_PRICE_KEY;
const gmxPriceKey = GMX_PRICE_KEY;
const maxRewardsEsGmxAmountKey = MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY;
const distributionId = DISTRIBUTION_ID;

const processLzReceiveSimulation = async (opts?: RevertOverride) => {
  const envRevert = process.env.REVERT_TX?.toLowerCase() === "true";
  const revertTx = opts?.disableRevert ? false : envRevert;

  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  const { eventEmitter } = getContracts(chainId, provider);

  const txReceipt = await ethers.provider.getTransactionReceipt(txHash);
  const txLogs = txReceipt.logs;
  logger.log("total logs in receipt:", txLogs.length);

  let relevantLogs = txLogs.filter(
    (l) =>
      l.topics.length >= 2 &&
      l.topics[0] === FEE_DISTRIBUTION_EVENT_TOPICS[0] &&
      l.topics[1] === FEE_DISTRIBUTION_EVENT_TOPICS[1] &&
      getFeeDistributorEventDescription(l, eventEmitter) ===
        FEE_DISTRIBUTION_DATA_RECEIVED
  );

  logger.log(
    "matching logs:",
    relevantLogs.length,
    relevantLogs.map((l) => l.logIndex)
  );

  const executions: { txHash: string; snapId: string }[] = [];

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
      const snap = (await provider.send("evm_snapshot", [])) as string;

      const txResponse = await gelatoMsgSender.sendTransaction({
        to: call.to,
        data: call.data,
      });
      const receipt = await txResponse.wait();

      logger.log(`tx mined @ block ${receipt.blockNumber}`);

      logger.log("total logs in receipt:", receipt.logs.length);

      executions.push({ txHash: receipt.transactionHash, snapId: snap });

      relevantLogs = receipt.logs.filter(
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
        const event = getFeeDistributionCompletedEventData(l, eventEmitter);

        logger.log("FeeDistributionCompleted:", {
          feesV1Usd: formatAmount(event.feesV1Usd, USD_DECIMALS, 4),
          feesV2Usd: formatAmount(event.feesV2Usd, USD_DECIMALS, 4),
          wntForKeepers: formatAmount(event.wntForKeepers, GMX_DECIMALS, 4),
          wntForChainlink: formatAmount(event.wntForChainlink, GMX_DECIMALS, 4),
          wntForTreasury: formatAmount(event.wntForTreasury, GMX_DECIMALS, 4),
          wntForReferralRewards: formatAmount(
            event.wntForReferralRewards,
            GMX_DECIMALS,
            4
          ),
          esGmxForReferralRewards: formatAmount(
            event.esGmxForReferralRewards,
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

if (require.main === module) {
  processLzReceiveSimulation();
}

export { processLzReceiveSimulation };
