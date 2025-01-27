import {
  Web3FunctionContext,
  Web3FunctionEventContext,
  Web3FunctionUserArgs,
} from "@gelatonetwork/web3-functions-sdk/*";
import { BigNumber } from "ethers";
import { MockedJsonRpcProvider } from "./MockedJsonRpcProvider";
import { Log } from "@ethersproject/abstract-provider";
import { HARDHAT } from "../config/chains";
import { getContracts } from "./contracts";
import { Context } from "./gelato";
import {
  getMarketService,
  MarketService,
} from "../domain/market/marketService";
import { jest } from "@jest/globals";
import { MarketData } from "../domain/market/marketUtils";

export const createMockedContext = ({
  userArgs,
}: {
  userArgs: Web3FunctionUserArgs;
}) => {
  const provider = new MockedJsonRpcProvider();
  const context = {
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
      get: jest.fn<() => Promise<string | undefined>>().mockResolvedValue(""),
      set: jest.fn<() => Promise<void>>(),
      delete: jest.fn<() => Promise<void>>(),
      getKeys: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
      getSize: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    userArgs,
  } satisfies Web3FunctionContext;

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

export const wrapMockContext = <GelatoContext extends Web3FunctionContext>(
  gelatoContext: GelatoContext
) => {
  const marketService = {
    getMarketsData: jest
      .fn<() => Promise<MarketData[]>>()
      .mockResolvedValue([]),
  } as unknown as MarketService;

  return {
    ...gelatoContext,
    contracts: getContracts(
      gelatoContext.gelatoArgs.chainId,
      gelatoContext.multiChainProvider.default()
    ),
    services: {
      marketService,
    },
  } satisfies Context<GelatoContext>;
};
