/*

Example usage:
```
GELATO_MSG_SENDER=0x00D6ffb506167f4b704bB3a2023274f7793c90cc \
LOG_INDEX=11 \
TX=0x1fa3d337e5c306ce6b36fea85caf2126663e79f39ac0ae0f0282f0591e101091 \
UINT_KEY=0xb090a2b4b1460d089313317d9c8dde87144d93e949a91730da157796e1a45cee \
    npx hardhat run scripts/replayTx_exampleFunction.ts --network arbitrum
```
*/

import { Web3FunctionEventContext } from "@gelatonetwork/web3-functions-sdk";
import { Web3FunctionResult } from "@gelatonetwork/web3-functions-sdk";
import { ethers } from "hardhat";
import assert from "node:assert";
import { Context, wrapContext } from "../src/lib/gelato";
import { Log } from "@ethersproject/providers";
import { isSupportedChainId, SupportedChainId } from "../src/config/chains";
import { BigNumber } from "ethers";
import { exampleFunction } from "../src/web3-functions/example-function/exampleFunction";
import { getRpcProviderUrl } from "../src/config/providers";
import { getContracts } from "../src/lib/contracts";

const txHash = process.env.TX;
const logIndex =
  process.env.LOG_INDEX !== undefined
    ? parseInt(process.env.LOG_INDEX)
    : undefined;

const uintKey = process.env.UINT_KEY;

const gelatoMsgSender = process.env.GELATO_MSG_SENDER;

assert(txHash, "TX is not set");
assert(uintKey, "UINT_KEY is not set");
assert(gelatoMsgSender, "GELATO_MSG_SENDER is not set");

const topics = [
  "0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160",
  "0x41c7b30afab659d385f1996d0addfa6e647694862e72378d0b43773f556cbeb2",
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
        uintKey,
      },
      chainId
    );
    const context = wrapContext(gelatoContext);
    const result = await exampleFunction(context);

    if (!result.canExec) {
      console.log("Nothing to execute: ", result);
      return;
    }

    const provider = context.multiChainProvider.default();
    const { dataStore } = getContracts(chainId, provider);

    for (const call of result.callData) {
      const res = await provider.call(
        {
          to: call.to,
          data: call.data,
          from: gelatoMsgSender,
        },
        txReceipt.blockNumber + 1 // replaying on the next block
      );

      const decoded = dataStore.interface.decodeFunctionResult("setUint", res);
      console.log("decoded response ->", decoded);
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

  return wrapContext({
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
