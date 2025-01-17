import { Contract } from "ethers";
import { Market, MarketData } from "./marketUtils";
import { getAddress } from "../../config/addresses";
import { Storage } from "../../lib/gelato";

export class MarketService {
  _reader: Contract;
  _multicall3: Contract;
  _dataStore: Contract;
  _chainId: number;
  _storage: Storage;

  constructor(p: {
    chainId: number;
    reader: Contract;
    multicall3: Contract;
    dataStore: Contract;
    storage: Storage;
  }) {
    this._reader = p.reader;
    this._dataStore = p.dataStore;
    this._multicall3 = p.multicall3;
    this._chainId = p.chainId;
    this._storage = p.storage;
  }

  async getMarketsData(
    p: { requiredMarkets?: string[]; skipCache?: true } = {}
  ): Promise<MarketData[]> {
    console.time("getMarketsData");

    let marketsData: MarketData[] = [];

    if (!p.skipCache) {
      const marketsData = await this._getMarketsDataFromStorage();
      if (marketsData) {
        if (
          !p.requiredMarkets ||
          p.requiredMarkets.every((address) =>
            marketsData.find((m) => m.marketToken === address)
          )
        ) {
          console.timeEnd("getMarketsData");
          return marketsData;
        }
      }
    }

    const markets = await this._getMarkets(p);
    const isDisabled = await this._getIsDisabled(
      markets,
      p.requiredMarkets,
      p.skipCache
    );

    console.timeEnd("getMarketsData");
    marketsData = markets.map((market, i) => ({
      ...market,
      isDisabled: isDisabled[i],
    }));

    await this._saveMarketsToStorage(marketsData);
    return marketsData;
  }

  async _getMarkets(
    p: { requiredMarkets?: string[]; skipCache?: true } = {}
  ): Promise<Market[]> {
    console.time("getMarkets");
    const dataStoreAddress = getAddress(this._chainId, "dataStore");
    const markets = await this._reader.getMarkets(dataStoreAddress, 0, 1000);

    console.timeEnd("getMarkets");
    return markets;
  }

  async _getMarketsDataFromStorage(): Promise<MarketData[] | undefined> {
    const cacheValue = await this._storage.get("markets");
    if (cacheValue) {
      const data = JSON.parse(cacheValue);
      return data.map((m: any) => ({
        marketToken: m[0],
        indexToken: m[1],
        longToken: m[2],
        shortToken: m[3],
        isDisabled: m[4],
      }));
    }
  }

  async _saveMarketsToStorage(markets: MarketData[]): Promise<void> {
    await this._storage.set(
      "markets",
      JSON.stringify(
        markets.map((m) => [
          m.marketToken,
          m.indexToken,
          m.longToken,
          m.shortToken,
          m.isDisabled,
        ])
      )
    );
  }

  async _getIsDisabled(
    markets: Market[],
    requiredMarkets?: string[],
    skipCache?: true
  ) {
    return markets.map(() => false);
  }
}
