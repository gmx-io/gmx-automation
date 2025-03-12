import { Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk/*";
import {
  getMarketService,
  MarketService,
} from "../domain/market/marketService";
import { getContracts } from "./contracts";
import { getLogger, Logger } from "./logger";

type Secrets = {
  get: (key: string) => Promise<string | undefined>;
};

export async function getSecrets(
  secrets: Secrets,
  keys: string[]
): Promise<string[]> {
  const values = await Promise.all(keys.map((key) => secrets.get(key)));
  for (const [i, value] of values.entries()) {
    if (value === undefined) {
      throw new Error(`Secret ${keys[i]} is undefined`);
    }
  }
  return values as string[];
}

export type Storage = {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export type Context<GelatoContext extends Web3FunctionContext> =
  GelatoContext & {
    services: {
      marketService: MarketService;
    };
    contracts: ReturnType<typeof getContracts>;
    logger: Logger;
    isGelatoEnvironment: boolean;
  };

export const wrapContext = <GelatoContext extends Web3FunctionContext>(
  isGelatoEnvironment: boolean,
  gelatoContext: GelatoContext
): Context<GelatoContext> => {
  return {
    ...gelatoContext,
    contracts: getContracts(
      gelatoContext.gelatoArgs.chainId,
      gelatoContext.multiChainProvider.default()
    ),
    services: {
      marketService: getMarketService({
        chainId: gelatoContext.gelatoArgs.chainId,
        storage: gelatoContext.storage,
        provider: gelatoContext.multiChainProvider.default(),
      }),
    },
    logger: getLogger(isGelatoEnvironment),
    isGelatoEnvironment,
  };
};
