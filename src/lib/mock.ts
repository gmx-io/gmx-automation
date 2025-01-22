import {
  Web3FunctionContext,
  Web3FunctionEventContext,
  Web3FunctionUserArgs,
} from "@gelatonetwork/web3-functions-sdk/*";
import { BigNumber } from "ethers";
import { MockedJsonRpcProvider } from "./MockedJsonRpcProvider";
import { Log } from "@ethersproject/abstract-provider";
import { HARDHAT } from "../config/chains";

export const createMockedContext = ({
  userArgs,
}: {
  userArgs: Web3FunctionUserArgs;
}) => {
  const provider = new MockedJsonRpcProvider();
  const context: Web3FunctionContext = {
    gelatoArgs: {
      chainId: HARDHAT,
      gasPrice: BigNumber.from(0),
    },
    multiChainProvider: {
      default: () => {
        return provider;
      },
    } as any as Web3FunctionContext["multiChainProvider"],
    secrets: {
      async get(key) {
        throw new Error("Not implemented");
      },
    },
    storage: {
      get: () => Promise.resolve(""),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      getKeys: () => Promise.resolve([]),
      getSize: () => Promise.resolve(0),
    },
    userArgs,
  };

  return context;
};

export const createMockedEventContext = ({
  log,
  userArgs,
}: {
  log: Log;
  userArgs: Web3FunctionUserArgs;
}) => {
  const context = createMockedContext({ userArgs });
  const eventContext: Web3FunctionEventContext = {
    ...context,
    log,
  };
  return eventContext;
};
