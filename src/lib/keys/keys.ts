import { hashData, hashString } from "../hashing";

export const REALTIME_FEED_ID = hashString("REALTIME_FEED_ID");
export const IS_MARKET_DISABLED = hashString("IS_MARKET_DISABLED");
export const WNT_PRICE_KEY = hashString("FEE_DISTRIBUTOR_WNT_PRICE");
export const GMX_PRICE_KEY = hashString("FEE_DISTRIBUTOR_GMX_PRICE");
export const MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY = hashString(
  "FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT"
);

export function realtimeFeedIdKey(token: string) {
  return hashData(["bytes32", "address"], [REALTIME_FEED_ID, token]);
}

export function isMarketDisabledKey(market: string) {
  return hashData(["bytes32", "address"], [IS_MARKET_DISABLED, market]);
}
