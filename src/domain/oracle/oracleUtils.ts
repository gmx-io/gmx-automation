import { BigNumber } from "ethers";
import { parseLogToEventData } from "../../lib/events";
import { Log } from "hardhat-deploy/dist/types";
import { EventEmitter } from "../../typechain";

export type OraclePriceUpdateEventData = {
  token: string;
  provider: string | null;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  timestamp: number;
};

export const getOraclePriceUpdateEventData = (
  log: Log,
  eventEmitter: EventEmitter
): OraclePriceUpdateEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    token: eventData.getAddress("token"),
    provider: eventData.getString("provider", null),
    maxPrice: eventData.getUint("maxPrice"),
    minPrice: eventData.getUint("minPrice"),
    timestamp: eventData.getUint("timestamp").toNumber(),
  };
};
