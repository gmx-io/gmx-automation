/*

Example usage:
```
GELATO_MSG_SENDER_PRIVATE_KEY=PRIVATE_KEY \
TX=0x5ab895df8c4b227fc77ada660d5a2cab40b6cd9d5902ca3056ff28a8a762a539 \
INITIAL_FROM_TIMESTAMP=1744333353 \
WNT_PRICE_KEY=0x66af7011ac8687696c07a8c00f07a4cd3b8574eccaa9d8609991b2824888e113 \
GMX_PRICE_KEY=0xfb0c2a8c499410abada8871e1b7bb6142f067b1b04951090b658c6843dcf78c9 \
ESGMX_REWARDS_KEY=0x40526da0fbc85a8524586c9c30616320eabcc480b42239a800f3287664b8b34f \
SKIP_SEND_NATIVE_TOKEN=true \
SHOULD_SEND_TXN=false \
    npx hardhat run scripts/simulateTx_feeDistribution_processLzReceive.ts --network localhost
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
import { getFeeDistributionCompletedEventData } from "../src/domain/fee/feeDistributionUtils";
import { formatAmount, USD_DECIMALS, GMX_DECIMALS } from "../src/lib/number";

const logger: Logger = getLogger();
const txHash = process.env.TX;

const initialFromTimestamp = process.env.INITIAL_FROM_TIMESTAMP;
const wntPriceKey = process.env.WNT_PRICE_KEY;
const gmxPriceKey = process.env.GMX_PRICE_KEY;
const esGmxRewardsKey = process.env.ESGMX_REWARDS_KEY;
const skipSendNativeToken = process.env.SKIP_SEND_NATIVE_TOKEN;
const shouldSendTxn = process.env.SHOULD_SEND_TXN;

const gelatoMsgSenderPrivateKey = process.env.GELATO_MSG_SENDER_PRIVATE_KEY;

assert(txHash, "TX is not set");
assert(initialFromTimestamp, "INITIAL_FROM_TIMESTAMP is not set");
assert(wntPriceKey, "WNT_PRICE_KEY is not set");
assert(gmxPriceKey, "GMX_PRICE_KEY is not set");
assert(esGmxRewardsKey, "ESGMX_REWARDS_KEY is not set");
assert(skipSendNativeToken, "SKIP_SEND_NATIVE_TOKEN is not set");
assert(shouldSendTxn, "SHOULD_SEND_TXN is not set");
assert(gelatoMsgSenderPrivateKey, "GELATO_MSG_SENDER_PRIVATE_KEY is not set");

const topics = [
  "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
  "0x55ac1650a32c2b1a50780bc0322564f8a36092ee04680ea414c44c7283bc3937", // EventName = FeeDistributionDataReceived
];

const topics2 = [
  "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
  "0xb4f52781abb3fd345f04301fe57915de07b9d6292be94dce510aa8d59dd589e1", // EventName = FeeDistributionCompleted
];

const main = async () => {
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
        skipSendNativeToken,
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
      const snap = await provider.send("evm_snapshot", []);

      const txResponse = await gelatoMsgSender.sendTransaction({
        to: call.to,
        data: call.data,
      });
      const receipt = await txResponse.wait();

      logger.log(`tx mined @ block ${receipt.blockNumber}`);

      const fdCompletedLogs = receipt.logs.filter(
        (l) =>
          l.topics.length >= 2 &&
          l.topics[0] === topics2[0] &&
          l.topics[1] === topics2[1]
      );

      for (const log of fdCompletedLogs) {
        const ev = getFeeDistributionCompletedEventData(log, eventEmitter);

        logger.log("FeeDistributionCompleted:", {
          feesV1Usd: formatAmount(ev.feesV1Usd, USD_DECIMALS, 4),
          feesV2Usd: formatAmount(ev.feesV2Usd, USD_DECIMALS, 4),
          wntForKeepers: formatAmount(ev.wntForKeepers, GMX_DECIMALS, 4),
          wntForChainlink: formatAmount(ev.wntForChainlink, GMX_DECIMALS, 4),
          wntForTreasury: formatAmount(ev.wntForTreasury, GMX_DECIMALS, 4),
          wntForGlp: formatAmount(ev.wntForGlp, GMX_DECIMALS, 4),
          wntForReferralRewards: formatAmount(
            ev.wntForReferralRewards,
            GMX_DECIMALS,
            4
          ),
          esGmxForReferralRewards: formatAmount(
            ev.esGmxForReferralRewards,
            USD_DECIMALS,
            4
          ),
        });
      }

      await provider.send("evm_revert", [snap]);
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
    secrets: {
      get(key?) {
        if (!key) {
          return null as any;
        }
        return null as any; // update if there is a simulation script that includes secrets
      },
    },
    storage: {
      get: () => null as any,
      set: () => null as any,
      delete: () => null as any,
      getKeys: () => null as any,
      getSize: () => null as any,
    },
  });
}

main();
