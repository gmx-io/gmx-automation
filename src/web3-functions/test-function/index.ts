import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Interface } from "ethers/lib/utils";
import EventEmitter from "../../abis/EventEmitter.json";
import DataStore from "../../abis/DataStore.json";
import { Contract } from "ethers";
import { parseLog } from "../../utils/events";

const dataStoreAddress = "0x0000000000000000000000000000000000000000";

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { log, multiChainProvider, userArgs } = context;

  const provider = multiChainProvider.default();
  const eventEmitterInterface = new Interface(EventEmitter.abi);

  const dataStore = new Contract(dataStoreAddress, DataStore.abi, provider);
  const event = eventEmitterInterface.parseLog(log);

  const parsedLog = parseLog(event);

  return {
    canExec: true,
    message: "Test",
    callData: [
      {
        to: dataStoreAddress,
        data: dataStore.interface.encodeFunctionData("setUint", [
          userArgs.uintKey,
          parsedLog.getUint("minPrice"),
        ]),
      },
    ],
  };
});
