import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Interface } from "ethers/lib/utils";
import EventEmitter from "../../abis/EventEmitter.json";
import DataStore from "../../abis/DataStore.json";
import { Contract } from "ethers";
import { parseLog } from "../../lib/events";
import { getOraclePriceUpdateEventData } from "../../domain/oracle/oracleUtils";
import { getAddress } from "../../config/addresses";

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { log, multiChainProvider, userArgs, gelatoArgs } = context;

  const provider = multiChainProvider.default();
  const eventEmitterInterface = new Interface(EventEmitter.abi);

  const dataStoreAddress = getAddress(gelatoArgs.chainId, "dataStore");

  const dataStore = new Contract(dataStoreAddress, DataStore.abi, provider);
  const event = eventEmitterInterface.parseLog(log);

  const parsedLog = parseLog(event);
  const oraclePriceUpdateEventData = getOraclePriceUpdateEventData(parsedLog);

  return {
    canExec: true,
    message: "Test",
    callData: [
      {
        to: dataStoreAddress,
        data: dataStore.interface.encodeFunctionData("setUint", [
          // TODO use keys
          userArgs.uintKey,
          oraclePriceUpdateEventData.minPrice,
        ]),
      },
    ],
  };
});
