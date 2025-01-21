import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { BytesLike } from "ethers/lib/utils";
import { getOraclePriceUpdateEventData } from "../../domain/oracle/oracleUtils";
import { getContracts } from "../../lib/contracts";
import { parseLog } from "../../lib/events";

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { log, multiChainProvider, userArgs, gelatoArgs } = context;

  const contracts = getContracts(
    gelatoArgs.chainId,
    multiChainProvider.default()
  );
  const event = contracts.eventEmitter.interface.parseLog(log);
  const parsedLog = parseLog(event);
  const oraclePriceUpdateEventData = getOraclePriceUpdateEventData(parsedLog);

  return {
    canExec: true,
    message: "Test",
    callData: [
      {
        to: contracts.dataStore.address,
        data: contracts.dataStore.interface.encodeFunctionData("setUint", [
          userArgs.uintKey as BytesLike, // otherwise it infers incorrect function
          oraclePriceUpdateEventData.minPrice,
        ]),
      },
    ],
  };
});
