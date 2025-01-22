import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk/*";
import { getMarketService } from "../../domain/market/marketService";
import { getContracts } from "../../lib/contracts";
import { getOraclePriceUpdateEventData } from "../../domain/oracle/oracleUtils";
import { parseLog } from "../../lib/events";

export const testFunction: Parameters<typeof Web3Function.onRun>[0] = async (
  context: Web3FunctionEventContext
) => {
  const { log, multiChainProvider, userArgs, gelatoArgs } = context;

  const marketService = getMarketService({
    chainId: gelatoArgs.chainId,
    storage: context.storage,
    provider: multiChainProvider.default(),
  });

  const markets = await marketService.getMarketsData();

  const contracts = getContracts(
    gelatoArgs.chainId,
    multiChainProvider.default()
  );
  const event = contracts.eventEmitter.interface.parseLog(log);
  const parsedLog = parseLog(event);
  const oraclePriceUpdateEventData = getOraclePriceUpdateEventData(parsedLog);

  return {
    canExec: true,
    callData: [
      {
        to: contracts.dataStore.address,
        data: contracts.dataStore.interface.encodeFunctionData("setUint", [
          userArgs.uintKey as string,
          oraclePriceUpdateEventData.minPrice.add(markets.length),
        ]),
      },
    ],
  };
};
