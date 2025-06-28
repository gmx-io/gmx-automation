import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { getOraclePriceUpdateEventData } from "../../domain/oracle/oracleUtils";
import { Context } from "../../lib/gelato";

export const exampleFunction = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const { log, userArgs, services, contracts, logger } = context;

  logger.info("Hello, world!");

  const markets = await services.marketService.getMarketsData();
  const oraclePriceUpdateEventData = getOraclePriceUpdateEventData(
    log,
    contracts.eventEmitter
  );

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
