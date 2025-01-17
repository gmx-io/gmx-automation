import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Interface } from "ethers/lib/utils";
import EventEmitter from "../../abis/EventEmitter.json";
import DataStore from "../../abis/DataStore.json";
import { Contract } from "ethers";

const dataStoreAddress = "0x0000000000000000000000000000000000000000";

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { gelatoArgs, log, multiChainProvider } = context;

  const provider = multiChainProvider.default();
  const eventEmitterInterface = new Interface(EventEmitter.abi);

  const dataStore = new Contract(dataStoreAddress, DataStore.abi, provider);
  // EventLog1
  const event = eventEmitterInterface.parseLog(log);

  // chainId: number
  const chainId = gelatoArgs.chainId;

  // gasPrice: BigNumber
  const gasPrice = gelatoArgs.gasPrice;

  // taskId: string
  const taskId = gelatoArgs.taskId;

  console.log({
    chainId,
    gasPrice,
    taskId,
    event,
  });

  return {
    canExec: true,
    message: "Test",
    callData: [
      {
        to: dataStoreAddress,
        data: dataStore.interface.encodeFunctionData("setBool", [
          // TODO userArgs
          "0x1234567890123456789012345678901234567890123456789012345678901234",
          true,
        ]),
      },
    ],
  };
});
