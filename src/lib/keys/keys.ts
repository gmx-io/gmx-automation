import { hashData, hashString } from "../hashing";

export const ORDER_LIST = hashString("ORDER_LIST");
export const POSITION_LIST = hashString("POSITION_LIST");
export const REALTIME_FEED_ID = hashString("REALTIME_FEED_ID");
export const IS_MARKET_DISABLED = hashString("IS_MARKET_DISABLED");

export function realtimeFeedIdKey(token: string) {
  return hashData(["bytes32", "address"], [REALTIME_FEED_ID, token]);
}

export function isMarketDisabledKey(market: string) {
  return hashData(["bytes32", "address"], [IS_MARKET_DISABLED, market]);
}
