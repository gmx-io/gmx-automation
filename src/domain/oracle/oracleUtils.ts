import { BigNumber } from "ethers";
import { KeyValueEventData } from "../../lib/events";

export type OraclePriceUpdateEventData = {
  token: string;
  provider: string | null;
  minPrice: BigNumber;
  maxPrice: BigNumber;
  timestamp: number;
};

export const getOraclePriceUpdateEventData = (
  eventData: KeyValueEventData
): OraclePriceUpdateEventData => {
  return {
    token: eventData.getAddress("token"),
    provider: eventData.getString("provider", null),
    maxPrice: eventData.getUint("maxPrice"),
    minPrice: eventData.getUint("minPrice"),
    timestamp: eventData.getUint("timestamp").toNumber(),
  };
};
