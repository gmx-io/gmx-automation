export type Market = {
  marketToken: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
};

export type MarketData = Market & {
  isDisabled: boolean;
};
