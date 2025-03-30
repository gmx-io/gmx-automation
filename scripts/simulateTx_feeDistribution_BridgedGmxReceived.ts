/*

Example usage:
```
GELATO_MSG_SENDER=0x00D6ffb506167f4b704bB3a2023274f7793c90cc \
LOG_INDEX=11 \
TX=0x1fa3d337e5c306ce6b36fea85caf2126663e79f39ac0ae0f0282f0591e101091 \
INITIAL_FROM_TIMESTAMP=1742968800 \
ESGMX_REWARDS_KEY=0x40526da0fbc85a8524586c9c30616320eabcc480b42239a800f3287664b8b34f \
SKIP_SEND_NATIVE_TOKEN=true \
SHOULD_SEND_TXN=false \
    npx hardhat run scripts/simulateTx_feeDistribution.ts --network arbitrum
```
*/

import { Log } from "@ethersproject/providers";
import {
  Web3FunctionEventContext,
  Logger,
} from "@gelatonetwork/web3-functions-sdk/*";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import assert from "node:assert";
import { isSupportedChainId, SupportedChainId } from "../src/config/chains";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";
import { Context, wrapContext } from "../src/lib/gelato";
import { feeDistribution } from "../src/web3-functions/feeDistribution/feeDistribution";

const logger: Logger;
const txHash = process.env.TX;
const logIndex =
  process.env.LOG_INDEX !== undefined
    ? parseInt(process.env.LOG_INDEX, 10)
    : undefined;

const initialFromTimestamp = process.env.INITIAL_FROM_TIMESTAMP;
const esGmxRewardsKey = process.env.ESGMX_REWARDS_KEY;
const skipSendNativeToken = process.env.SKIP_SEND_NATIVE_TOKEN;
const shouldSendTxn = process.env.SHOULD_SEND_TXN;

const gelatoMsgSender = process.env.GELATO_MSG_SENDER;

assert(txHash, "TX is not set");
assert(initialFromTimestamp, "INITIAL_FROM_TIMESTAMP is not set");
assert(esGmxRewardsKey, "ESGMX_REWARDS_KEY is not set");
assert(skipSendNativeToken, "SKIP_SEND_NATIVE_TOKEN is not set");
assert(shouldSendTxn, "SHOULD_SEND_TXN is not set");
assert(gelatoMsgSender, "GELATO_MSG_SENDER is not set");

const topics = [
  "0x7e3bde2ba7aca4a8499608ca57f3b0c1c1c93ace63ffd3741a9fab204146fc9a", // EventLog event signature
  "0x18b8c59f2f59ef65527915db9544ac15717fd3d18bc754a45263b232b1529ebe", // EventName = FeeDistributionBridgedGmxReceived
];

const main = async () => {
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const txReceipt = await ethers.provider.getTransactionReceipt(txHash);
  const txLogs = txReceipt.logs;

  const relevantLogs = txLogs.filter((log) => {
    if (typeof logIndex === "number" && log.logIndex !== logIndex) {
      return false;
    }
    return log.topics[0] === topics[0] && log.topics[1] === topics[1];
  });

  for (const log of relevantLogs) {
    const gelatoContext = createEventContext(
      log,
      {
        initialFromTimestamp,
        esGmxRewardsKey,
        skipSendNativeToken,
        shouldSendTxn,
      },
      chainId
    );
    const context = wrapContext(false, gelatoContext);
    const result = await feeDistribution(context);

    if (!result.canExec) {
      logger.log("Nothing to execute: ", result);
      return;
    }

    const provider = context.multiChainProvider.default();
    const { feeDistributor } = getContracts(chainId, provider);

    for (const call of result.callData) {
      const res = await provider.call(
        {
          to: call.to,
          data: call.data,
          from: gelatoMsgSender,
        },
        txReceipt.blockNumber + 1 // replaying on the next block
      );

      const decoded = feeDistributor.interface.decodeFunctionResult(
        "distribute",
        res
      );
      // should never be called actually as we won't set CONTROLLER role to the gelato msg sender
      logger.log("decoded response:", decoded);
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      get(key) {
        return null as any;
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
