/* eslint-disable @typescript-eslint/naming-convention */

import { subWeeks, addWeeks } from "date-fns";
import { ethers } from "ethers";
import { RequestInfo, RequestInit } from "node-fetch";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { Context } from "../../lib/gelato";

const fetch = (...args: [input: RequestInfo | URL, init?: RequestInit]) =>
  import("node-fetch").then(({ default: f }) => f(...args));

const ARBITRUM_SUBGRAPH_ENDPOINT =
  "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-referrals/api";
const AVALANCHE_SUBGRAPH_ENDPOINT =
  "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-avalanche-referrals/api";

const ES_GMX_TOKEN_ADDRESS: Record<string, string> = {
  arbitrum: "0xf42ae1d54fd613c9bb14810b0588faaa09a426ca",
  avalanche: "0xff1489227bbaac61a9209a08929e4c2a526ddd17",
};

const BigNumber = ethers.BigNumber;
const { formatUnits, parseUnits } = ethers.utils;
const { AddressZero } = ethers.constants;

const dayFormat = "dd.MM.yyyy";

const SHARE_DIVISOR = BigNumber.from("1000000000"); // 1e9
const BONUS_TIER = 2; // for EsGMX distributions
const USD_DECIMALS = 30;
const GMX_DECIMALS = 18;
const REWARD_THRESHOLD = expandDecimals(1, 28); // 1 cent
const ESGMX_REWARDS_THRESHOLD = expandDecimals(1, 16); // 0.01 esGMX
const VAULT_ADDRESS: Record<string, string> = {
  arbitrum: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  avalanche: "0x9ab2De34A33fB459b538c43f251eB825645e8595",
};
const VAULT_ABI = [
  "function getMaxPrice(address) external view returns (uint256)",
];
const UNISWAP_POOL_ADDRESS = "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E";
const UNISWAP_POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];
const WNT_ADDRESS: Record<string, string> = {
  arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  avalanche: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};

export const feeDistributor = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const { log, userArgs, storage, services, contracts, multiChainProvider } = context;
  const provider = multiChainProvider.default();
  const network = userArgs.network;
  
  const vault = new ethers.Contract(VAULT_ADDRESS[network], VAULT_ABI, provider);
  let wntPrice, gmxPrice;
  if (network === "arbitrum") {
    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, provider);
    ({ ethPrice: wntPrice, gmxPrice } = await getPrices(vault, uniswapPool, WNT_ADDRESS.arbitrum));
  }
  else {
    const arbitrumProvider = multiChainProvider.chainId(42161);
    const arbitrumVault = new ethers.Contract(VAULT_ADDRESS.arbitrum, VAULT_ABI, arbitrumProvider);
    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, arbitrumProvider);
    ({ gmxPrice } = await getPrices(arbitrumVault, uniswapPool, WNT_ADDRESS.arbitrum));
    wntPrice = await vault.getMaxPrice(WNT_ADDRESS[network]);
  }

  const distributeReferralRewards; // logic to parse log from event to be added
  if (!distributeReferralRewards) {
    await storage.delete("distributionData");
    
    const fromTimestamp = Number(
      (await storage.get("fromTimestamp")) ?? userArgs.initialFromTimestamp
    );
    const toTimestamp = await provider.getBlock("latest").timestamp;

    const esGmxRewards = contracts.dataStore.getUint(userArgs.esGmxRewardsKey);

    const feesV1Usd = await processPeriodV1('prev', network);
    const feesV2Usd = await processPeriodV2('prev', network).mul(10).div(100);
    
    const [totalRebateUsd, esgmxRewardsTotal] = await getDistributionData(
      network,
      fromTimestamp,
      toTimestamp,
      gmxPrice,
      esGmxRewards
    );

    const nextFromTimestamp = toTimestamp + 1;
    await storage.set("fromTimestamp", nextFromTimestamp.toString());

    return {
      canExec: true,
      callData: [
        {
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.referralRewardsAmountNativeTokenKey as string,
            totalRebateUsd,
          ]),
        },
        {
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.referralRewardsAmountEsGmxKey as string,
            esgmxRewardsTotal,
          ]),
        },
        {
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.feeAmountUsdV1Key as string,
            feesV1Usd,
          ]),
        },
        {
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.feeAmountUsdV2Key as string,
            feesV2Usd,
          ]),
        },
        { //call to FeeDistributor.distribute() to be added below
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.referralRewardsAmountKey as string,
            totalRebateUsd,
          ]),
        },
      ],
    };
  }
  
  const shouldSendTxn = userArgs.shouldSendTxn;

  const referralDistributionSigner = "0x..." // Need to confirm address
  const referralDistributionSender = "0x..." // Need to confirm address
  const inputValues = "abcxyz" // Need to determine values

  const referralDistributionCalls = await referralRewardsCalls({
    skipSendNativeToken: userArgs.skipSendNativeToken,
    referralDistributionSigner,
    referralDistributionSender,
    shouldSendTxn: shouldSendTxn,
    nativeToken: { address: WNT_ADDRESS[network], name: "WNT" },
    nativeTokenPrice: wntPrice,
    gmxPrice,
    inputValues,
    network,
  });

  const referralDistributionCallData = referralDistributionCalls.map((c) => ({
    to: c.to,
    data: c.data,
  }));

  if (!shouldSendTxn) {
    console.log("Referral Rewards Not sent"); // potentially simulate calls here for testing
  }

  return {
    canExec: shouldSendTxn,
    callData: referralDistributionCallData,
  };
});

async function getPrices(
  vault: ethers.Contract,
  uniswapPool: ethers.Contract,
  WETH_ADDRESS: string
) {
  const [sqrtPriceX96] = await uniswapPool.slot0();
  const SCALE_1e30 = ethers.BigNumber.from("10").pow("30");
  const ratioSq = sqrtPriceX96.mul(sqrtPriceX96);
  const ratioScaled = ratioSq.mul(SCALE_1e30).div(
    ethers.BigNumber.from(2).pow(192)
  );

  const ethPrice = await vault.getMaxPrice(WETH_ADDRESS);
  const gmxPrice = ethPrice.mul(ratioScaled).div(SCALE_1e30);
  return { ethPrice, gmxPrice };
}

function stringToFixed(s: string | number, n: number): string {
  return Number(s).toFixed(n);
}

function bigNumberify(n: number | string): ethers.BigNumber {
  return ethers.BigNumber.from(n);
}

function expandDecimals(
  n: number | string,
  decimals: number
): ethers.BigNumber {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}

// functions used to retrieve and calculate referral rewards

function getSubgraphEndpoint(network: string): string {
  return {
    avalanche: AVALANCHE_SUBGRAPH_ENDPOINT,
    arbitrum: ARBITRUM_SUBGRAPH_ENDPOINT,
  }[network];
}

async function requestSubgraph(network: string, query: string): Promise<any> {
  const subgraphEndpoint = getSubgraphEndpoint(network);

  if (!subgraphEndpoint) {
    throw new Error("Unknown network " + network);
  }

  const payload = JSON.stringify({ query });
  const res = await fetch(subgraphEndpoint, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });

  const j = await res.json();
  if (j.errors) {
    throw new Error(JSON.stringify(j));
  }

  return j.data;
}

async function getAffiliatesTiers(
  network: string
): Promise<Record<string, number>> {
  const data = await requestSubgraph(
    network,
    `{
      affiliates(first: 1000, where: { tierId_in: ["2", "1"]}) {
        id,
        tierId
      }
    }`
  );

  if (data.affiliates.length === 1000) {
    throw new Error("Affiliates should be paginated");
  }

  return data.affiliates.reduce(
    (memo: Record<string, number>, item: { id: string; tierId: string }) => {
      memo[item.id] = parseInt(item.tierId);
      return memo;
    },
    {}
  );
}

async function getDistributionData(
  network: string,
  fromTimestamp: number,
  toTimestamp: number,
  gmxPrice: ethers.BigNumber,
  esgmxRewards: ethers.BigNumber
): Promise<void> {
  let affiliateCondition = "";
  let referralCondition = "";

  const getAffiliateStatsQuery = (
    skip: number
  ) => `affiliateStats(first: 10000, skip: ${skip}, where: {
    period: daily,
    timestamp_gte: ${fromTimestamp},
    timestamp_lt: ${toTimestamp},
    discountUsd_gt: 0
    ${affiliateCondition}
  }) {
    id
    timestamp
    affiliate
    v1Data {
      totalRebateUsd
      discountUsd
      volume
      trades
    }
    v2Data {
      totalRebateUsd
    }
  }`;

  const getReferralStatsQuery = (
    skip: number
  ) => `referralStats(first: 10000, skip: ${skip}, where: {
    period: daily,
    timestamp_gte: ${fromTimestamp},
    timestamp_lt: ${toTimestamp},
    discountUsd_gt: 0
    ${referralCondition}
  }) {
    id
    timestamp
    referral
    v1Data {
      discountUsd
      volume
    }
  }`;

  const query = `{
    affiliateStats0: ${getAffiliateStatsQuery(0)}
    affiliateStats1: ${getAffiliateStatsQuery(10000)}
    affiliateStats2: ${getAffiliateStatsQuery(20000)}
    affiliateStats3: ${getAffiliateStatsQuery(30000)}
    affiliateStats4: ${getAffiliateStatsQuery(40000)}
    affiliateStats5: ${getAffiliateStatsQuery(50000)}

    referralStats0: ${getReferralStatsQuery(0)}
    referralStats1: ${getReferralStatsQuery(10000)}
    referralStats2: ${getReferralStatsQuery(20000)}
    referralStats3: ${getReferralStatsQuery(30000)}
    referralStats4: ${getReferralStatsQuery(40000)}
    referralStats5: ${getReferralStatsQuery(50000)}
  }`;

  const [data, affiliatesTiers] = await Promise.all([
    requestSubgraph(network, query),
    getAffiliatesTiers(network),
  ]);

  const affiliateStats = [
    ...data.affiliateStats0,
    ...data.affiliateStats1,
    ...data.affiliateStats2,
    ...data.affiliateStats3,
    ...data.affiliateStats4,
    ...data.affiliateStats5,
  ];

  const referralStats = [
    ...data.referralStats0,
    ...data.referralStats1,
    ...data.referralStats2,
    ...data.referralStats3,
    ...data.referralStats4,
    ...data.referralStats5,
  ];

  if (referralStats.length === 60000) {
    throw new Error("Referrals stats should be paginated");
  }

  if (affiliateStats.length === 60000) {
    throw new Error("Affiliates stats should be paginated");
  }

  let allAffiliatesRebateUsd = BigNumber.from(0);
  let totalReferralVolume = BigNumber.from(0);
  let totalRebateUsd = BigNumber.from(0);
  let esgmxRewardsTotal = BigNumber.from(0);

  interface IAffiliateData {
    rebateUsd: ethers.BigNumber;
    totalRebateUsd: ethers.BigNumber;
    volume: ethers.BigNumber;
    v2TotalRebateUsd: ethers.BigNumber;
    tradesCount: number;
    tierId: number;
    esgmxRewards?: ethers.BigNumber;
    esgmxRewardsUsd?: ethers.BigNumber;
    allAffiliatesRebateUsd?: ethers.BigNumber;
    account?: string;
    share?: ethers.BigNumber;
  }

  const affiliatesRebatesData = affiliateStats.reduce(
    (memo: Record<string, IAffiliateData>, item: any) => {
      const tierId = affiliatesTiers[item.affiliate] || 0;
      if (!memo[item.affiliate]) {
        memo[item.affiliate] = {
          rebateUsd: BigNumber.from(0),
          totalRebateUsd: BigNumber.from(0),
          volume: BigNumber.from(0),
          v2TotalRebateUsd: BigNumber.from(0),
          tradesCount: 0,
          tierId,
        };
      }

      const affiliateRebatesUsd = BigNumber.from(
        item.v1Data.totalRebateUsd
      ).sub(BigNumber.from(item.v1Data.discountUsd));
      allAffiliatesRebateUsd = allAffiliatesRebateUsd.add(affiliateRebatesUsd);
      memo[item.affiliate].rebateUsd =
        memo[item.affiliate].rebateUsd.add(affiliateRebatesUsd);
      memo[item.affiliate].totalRebateUsd = memo[
        item.affiliate
      ].totalRebateUsd.add(BigNumber.from(item.v1Data.totalRebateUsd));
      memo[item.affiliate].volume = memo[item.affiliate].volume.add(
        BigNumber.from(item.v1Data.volume)
      );
      memo[item.affiliate].v2TotalRebateUsd = memo[
        item.affiliate
      ].v2TotalRebateUsd.add(BigNumber.from(item.v2Data.totalRebateUsd));
      memo[item.affiliate].tradesCount += Number(item.v1Data.trades);

      totalRebateUsd = totalRebateUsd.add(
        BigNumber.from(item.v1Data.totalRebateUsd)
      );
      totalReferralVolume = totalReferralVolume.add(
        BigNumber.from(item.v1Data.volume)
      );
      return memo;
    },
    {}
  );

  if (allAffiliatesRebateUsd.eq(0)) {
    console.warn("No rebates on %s", network);
    return;
  }

  Object.entries(affiliatesRebatesData).forEach(([account, data]) => {
    data.allAffiliatesRebateUsd = allAffiliatesRebateUsd;
    data.account = account;
    data.share = data.rebateUsd.mul(SHARE_DIVISOR).div(allAffiliatesRebateUsd);
  });

  const esgmxRewardsUsdLimit = esgmxRewards
    .mul(gmxPrice)
    .div(expandDecimals(1, GMX_DECIMALS));
  let esgmxRewardsUsdTotal = BigNumber.from(0);

  Object.values(affiliatesRebatesData).forEach((data) => {
    if (data.tierId !== BONUS_TIER) {
      return;
    }
    // in v2 traders get discount automatically and affiliates can claim their rewards
    // however for both v1 and v2 esGMX rewards are distributed as airdrop
    // use total rebates from both v1 and v2 to calculate esGMX rewards
    //
    // tier 3 gets 25% of fees trading fees, esGMX reward are 5%
    // esGMX rewards = total rebates / 5
    data.esgmxRewardsUsd = data.totalRebateUsd
      .add(data.v2TotalRebateUsd)
      .div(5);

    data.esgmxRewards = data.esgmxRewardsUsd
      .mul(expandDecimals(1, USD_DECIMALS))
      .div(gmxPrice)
      .div(expandDecimals(1, 12));
    
    esgmxRewardsUsdTotal = esgmxRewardsUsdTotal.add(data.esgmxRewardsUsd);
    esgmxRewardsTotal = esgmxRewardsTotal.add(data.esgmxRewards);
  });

  if (esgmxRewardsUsdTotal.gt(esgmxRewardsUsdLimit)) {
    const denominator = esgmxRewardsUsdTotal
      .mul(USD_DECIMALS)
      .div(esgmxRewardsUsdLimit);
    
    esgmxRewardsTotal = BigNumber.from(0);
    Object.values(affiliatesRebatesData).forEach((data) => {
      if (!data.esgmxRewardsUsd) return;
      data.esgmxRewardsUsd = data.esgmxRewardsUsd
        .mul(USD_DECIMALS)
        .div(denominator);
      data.esgmxRewards = data.esgmxRewardsUsd
        .mul(expandDecimals(1, USD_DECIMALS))
        .div(gmxPrice)
        .div(expandDecimals(1, 12));
      esgmxRewardsTotal = esgmxRewardsTotal.add(data.esgmxRewards);
    });
  }

  const output: any = {
    fromTimestamp,
    toTimestamp,
    network,
    totalReferralVolume: totalReferralVolume.toString(),
    totalRebateUsd: totalRebateUsd.toString(),
    shareDivisor: SHARE_DIVISOR.toString(),
    affiliates: [],
    referrals: [],
    gmxPrice: gmxPrice,
    esgmxRewards: esgmxRewards,
  };

  console.log(
    "\nTotal referral volume: %s ($%s)",
    totalReferralVolume.toString(),
    Number(formatUnits(totalReferralVolume, USD_DECIMALS)).toFixed(4)
  );
  console.log(
    "Total fees collected from referral traders: %s ($%s)",
    totalReferralVolume.div(1000).toString(),
    Number(formatUnits(totalReferralVolume.div(1000), USD_DECIMALS)).toFixed(4)
  );
  console.log(
    "Total rebates (for Affiliates + Traders): %s ($%s)",
    totalRebateUsd.toString(),
    Number(formatUnits(totalRebateUsd, USD_DECIMALS)).toFixed(4)
  );

  console.log("\nAffiliates (Affiliates):");
  console.log(
    "Rebates sum: %s ($%s)",
    allAffiliatesRebateUsd.toString(),
    Number(formatUnits(allAffiliatesRebateUsd, USD_DECIMALS)).toFixed(4)
  );

  let consoleData: any[] = [];
  let filteredAffiliatesCount = 0;

  for (const data of Object.values(affiliatesRebatesData)) {
    const tooSmallEsgmx =
      !data.esgmxRewards || data.esgmxRewards.lt(ESGMX_REWARDS_THRESHOLD);
    const tooSmallReward = data.rebateUsd.lt(REWARD_THRESHOLD);
    const tooSmall = tooSmallReward && tooSmallEsgmx;

    consoleData.push({
      affiliate: data.account,
      "share, %": stringToFixed(formatUnits(data.share || 0, 7), 4),
      "volume, $": stringToFixed(formatUnits(data.volume, USD_DECIMALS), 4),
      "rebateUsd, $": stringToFixed(
        formatUnits(data.rebateUsd, USD_DECIMALS),
        4
      ),
      trades: data.tradesCount,
      tierId: data.tierId,
      "esgmxRewards, $": data.esgmxRewardsUsd
        ? formatUnits(data.esgmxRewardsUsd, USD_DECIMALS)
        : null,
      esgmxRewards: data.esgmxRewards
        ? formatUnits(data.esgmxRewards, GMX_DECIMALS)
        : null,
      tooSmall,
    });

    if (tooSmall) {
      filteredAffiliatesCount++;
      console.log(
        "skip affiliate %s small rewards %s and esGMX %s",
        data.account,
        stringToFixed(formatUnits(data.rebateUsd, USD_DECIMALS), 2),
        stringToFixed(formatUnits(data.esgmxRewards || 0, 18), 2)
      );
      continue;
    }
    output.affiliates.push({
      account: data.account,
      share: data.share?.toString(),
      volume: data.volume.toString(),
      tradesCount: data.tradesCount,
      rebateUsd: data.rebateUsd.toString(),
      totalRebateUsd: data.totalRebateUsd.toString(),
      tierId: data.tierId,
      esgmxRewards: data.esgmxRewards ? data.esgmxRewards.toString() : null,
      esgmxRewardsUsd: data.esgmxRewardsUsd
        ? data.esgmxRewardsUsd.toString()
        : null,
    });
  }

  console.log(
    "Filter %s of %s affiliates with rebate < $%s",
    filteredAffiliatesCount,
    output.affiliates.length + filteredAffiliatesCount,
    formatUnits(REWARD_THRESHOLD, USD_DECIMALS)
  );
  console.table(consoleData);

  let allReferralsDiscountUsd = BigNumber.from(0);
  const referralDiscountData = referralStats.reduce(
    (memo: Record<string, any>, item: any) => {
      if (!memo[item.referral]) {
        memo[item.referral] = {
          discountUsd: BigNumber.from(0),
          volume: BigNumber.from(0),
        };
      }
      memo[item.referral].discountUsd = memo[item.referral].discountUsd.add(
        BigNumber.from(item.v1Data.discountUsd)
      );
      memo[item.referral].volume = memo[item.referral].volume.add(
        BigNumber.from(item.v1Data.volume)
      );
      allReferralsDiscountUsd = allReferralsDiscountUsd.add(
        BigNumber.from(item.v1Data.discountUsd)
      );
      return memo;
    },
    {}
  );

  Object.entries(referralDiscountData).forEach(([account, data]) => {
    data.allReferralsDiscountUsd = allReferralsDiscountUsd;
    data.account = account;
    data.share = data.discountUsd
      .mul(SHARE_DIVISOR)
      .div(allReferralsDiscountUsd);
  });

  console.log("Referrals (Traders):");
  console.log(
    "Discount sum: %s ($%s)",
    allReferralsDiscountUsd.toString(),
    Number(formatUnits(allReferralsDiscountUsd, USD_DECIMALS)).toFixed(4)
  );

  consoleData = [];
  let filteredTradersCount = 0;

  for (const data of Object.values(referralDiscountData)) {
    if (data.share.eq(0)) {
      continue;
    }
    const tooSmall = data.discountUsd.lt(REWARD_THRESHOLD);
    consoleData.push({
      referral: data.account,
      "share, %": stringToFixed(formatUnits(data.share, 7), 4),
      "volume, $": stringToFixed(formatUnits(data.volume, USD_DECIMALS), 4),
      "discountUsd, $": stringToFixed(
        formatUnits(data.discountUsd, USD_DECIMALS),
        4
      ),
      tooSmall,
    });
    if (tooSmall) {
      filteredTradersCount++;
      continue;
    }
    output.referrals.push({
      account: data.account,
      share: data.share.toString(),
      discountUsd: data.discountUsd.toString(),
      volume: data.volume.toString(),
    });
  }

  console.log(
    "Filter %s of %s with discount < $%s",
    filteredTradersCount,
    filteredTradersCount + output.referrals.length,
    formatUnits(REWARD_THRESHOLD, USD_DECIMALS)
  );
  console.table(consoleData);

  await storage.set("distributionData", JSON.stringify(output, null, 4));

  return [output.totalRebateUsd, esgmxRewardsTotal];
}

interface EsGMXReferralRewardsDataParams {
  network: string;
  from: number;
  to: number;
  account?: string;
}

export async function getEsGMXReferralRewardsData({
  network,
  from,
  to,
  account,
}: EsGMXReferralRewardsDataParams): Promise<
  Array<{ account: string; amount: string }>
> {
  const esGmxTokenAddress = ES_GMX_TOKEN_ADDRESS[network];

  let accountCondition = "";
  if (account) {
    accountCondition = `, receiver: "${account}"`;
  }

  function getEsGmxDistributionQuery(skip: number) {
    return `distributions(
      where: {
        typeId: "1",
        tokens_contains: ["${esGmxTokenAddress}"]
        timestamp_gte: ${from},
        timestamp_lt: ${to}${accountCondition}
      }
      orderBy: timestamp
      orderDirection: desc
      first: 10000
      skip: ${skip}
    ) {
      tokens
      amounts
      receiver
    }`;
  }

  const query = `{
    esGmxDistribution0: ${getEsGmxDistributionQuery(0)}
    esGmxDistribution1: ${getEsGmxDistributionQuery(10000)}
    esGmxDistribution2: ${getEsGmxDistributionQuery(20000)}
    esGmxDistribution3: ${getEsGmxDistributionQuery(30000)}
    esGmxDistribution4: ${getEsGmxDistributionQuery(40000)}
    esGmxDistribution5: ${getEsGmxDistributionQuery(50000)}
  }`;

  const data = await requestSubgraph(network, query);

  const esGmxDistributions = [
    ...data.esGmxDistribution0,
    ...data.esGmxDistribution1,
    ...data.esGmxDistribution2,
    ...data.esGmxDistribution3,
    ...data.esGmxDistribution4,
    ...data.esGmxDistribution5,
  ];

  if (esGmxDistributions.length === 60000) {
    throw new Error("esGMX distributions should be paginated");
  }

  const aggregatedDistributionsByReceiver = esGmxDistributions.reduce(
    (distribution: Record<string, ethers.BigNumber>, item: any) => {
      const receiver = item.receiver;
      const amountIndex = item.tokens.indexOf(esGmxTokenAddress);
      if (amountIndex !== -1) {
        const amount = ethers.BigNumber.from(item.amounts[amountIndex]);
        if (!distribution[receiver]) {
          distribution[receiver] = amount;
        } else {
          distribution[receiver] = distribution[receiver].add(amount);
        }
      }
      return distribution;
    },
    {}
  );

  const nonZeroDistributionsByReceiver = Object.entries(
    aggregatedDistributionsByReceiver
  ).reduce((acc: Record<string, string>, [receiver, amount]) => {
    if (!amount.isZero()) {
      acc[receiver] = amount.toString();
    }
    return acc;
  }, {});

  console.table(nonZeroDistributionsByReceiver);

  const list: Array<{ account: string; amount: string }> = [];
  for (const [account, amount] of Object.entries(
    nonZeroDistributionsByReceiver
  )) {
    list.push({ account, amount });
  }

  return list;
}

// functions used to retrieve v1Fees v2Fees and prevPeriod used to retrieve for the correct period

async function fetchGql(url: string, gql: string): Promise<Response> {
  return fetch(`https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/${url}/api`, {
    method: "POST",
    body: JSON.stringify({ query: gql }),
  });
}

type RelativePeriodName = "prev" | "current";

async function processPeriodV1(
  relativePeriodName: RelativePeriodName,
  chainName: string
): Promise<ethers.BigNumber> {
  const [start, end] = getPeriod(relativePeriodName) ?? [];
  if (!start || !end) {
    throw new Error(`Invalid period name: ${relativePeriodName}`);
  }

  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(end)}, period: daily`;
  const gql = `
    {
      feeStats(where: { ${where} }) {
        id
        marginAndLiquidation
        swap
        mint
        burn
        period
      }
    }
  `;

  const response = await fetchGql(`gmx-${chainName}-stats`, gql);
  const json = (await response.json()) as {
    data: {
      feeStats: Array<{
        id: string;
        marginAndLiquidation: string;
        swap: string;
        mint: string;
        burn: string;
        period: string;
      }>;
    };
  };

  const stats = json.data.feeStats;

  const total = stats.reduce((acc, { marginAndLiquidation, swap, mint, burn }) => {
    return (
      acc + 
      BigInt(marginAndLiquidation) + 
      BigInt(swap) + 
      BigInt(mint) + 
      BigInt(burn)
    );
  }, 0n);

  return bigNumberify(total);
}

async function processPeriodV2(
  relativePeriodName: RelativePeriodName,
  chainName: string
): Promise<ethers.BigNumber> {
  const [start, end] = getPeriod(relativePeriodName) ?? [];
  if (!start || !end) {
    throw new Error(`Invalid period name: ${relativePeriodName}`);
  }

  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(end)},  period: "1d"`;
  const gql = `
    query {
      position: positionFeesInfoWithPeriods(where: { ${where} }) {
        totalBorrowingFeeUsd
        totalPositionFeeUsd
      }
      swap: swapFeesInfoWithPeriods(where: { ${where} }) {
        totalFeeReceiverUsd
        totalFeeUsdForPool
      }
    }
  `;

  const response = await fetchGql(`synthetics-${chainName}-stats`, gql);
  const json = (await response.json()) as {
    data: {
      position: Array<{
        totalBorrowingFeeUsd: string;
        totalPositionFeeUsd: string;
      }>;
      swap: Array<{
        totalFeeReceiverUsd: string;
        totalFeeUsdForPool: string;
      }>;
    };
  };

  const positionStats = json.data.position;
  const swapStats = json.data.swap;

  const positionFees = positionStats.reduce((acc, stat) => {
    return acc + BigInt(stat.totalBorrowingFeeUsd) + BigInt(stat.totalPositionFeeUsd);
  }, 0n);

  const swapFees = swapStats.reduce((acc, stat) => {
    return acc + BigInt(stat.totalFeeReceiverUsd) + BigInt(stat.totalFeeUsdForPool);
  }, 0n);

  return bigNumberify(positionFees + swapFees);
}

function dateToSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function getPeriod(
  relativePeriodName: RelativePeriodName
): [Date, Date] | undefined {
  const recentWednesday = getRecentWednesdayStartOfDay();
  const prevWednesday = subWeeks(recentWednesday, 1);
  const nextWednesday = addWeeks(recentWednesday, 1);

  switch (relativePeriodName) {
    case "prev":
      return [prevWednesday, recentWednesday];
    case "current":
      return [recentWednesday, nextWednesday];
    default:
      return undefined;
  }
}

function getRecentWednesdayStartOfDay(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysSinceWednesday = (dayOfWeek + 4) % 7;

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceWednesday,
      0,
      0,
      0
    )
  );
}

// send referral rewards function and related helper functions

async function sendTxn(
  txnPromise: Promise<ethers.providers.TransactionResponse>,
  label: string,
  network: string
): Promise<ethers.providers.TransactionResponse> {
  console.info(`Processing ${label}:`);
  const txn = await txnPromise;
  console.info(`Sending ${label}...`);

  if (network === "arbitrum") {
    await txn.wait(1);
  } else {
    await txn.wait(2);
  }

  console.info(`... Sent! ${txn.hash}`);
  return txn;
}

async function contractAt(
  name: string,
  address: string,
  providerOrSigner: ethers.providers.Provider | ethers.Signer
): Promise<ethers.Contract> {
  const contractFactory = await ethers.getContractFactory(
    name,
    providerOrSigner
  );
  return contractFactory.attach(address);
}

async function processBatch<T>(
  batchLists: T[][],
  batchSize: number,
  handler: (batch: T[][]) => Promise<void>
): Promise<void> {
  let currentBatch: T[][] = [];
  const referenceList = batchLists[0];

  for (let i = 0; i < referenceList.length; i++) {
    const item: T[] = [];

    for (let j = 0; j < batchLists.length; j++) {
      const list = batchLists[j];
      item.push(list[i]);
    }

    currentBatch.push(item);

    if (currentBatch.length === batchSize) {
      console.log(
        "handling currentBatch",
        i,
        currentBatch.length,
        referenceList.length
      );
      await handler(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    console.log(
      "handling final batch",
      currentBatch.length,
      referenceList.length
    );
    await handler(currentBatch);
  }
}

async function getArbValues(referralSender: any): Promise<any> {
  const vester = await contractAt(
    "Vester",
    "0x7c100c0F55A15221A4c1C5a25Db8C98A81df49B2",
    referralSender
  );
  const timelock = await contractAt(
    "Timelock",
    await vester.gov(),
    referralSender
  );
  const batchSender = await contractAt(
    "BatchSender",
    "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8",
    referralSender
  );
  const esGmx = await contractAt(
    "Token",
    "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA",
    referralSender
  );
  const data = await storage.get("distributionData");

  return { vester, timelock, batchSender, esGmx, data };
}

async function getAvaxValues(referralSender: any): Promise<any> {
  const vester = await contractAt(
    "Vester",
    "0x754eC029EF9926184b4CFDeA7756FbBAE7f326f7",
    referralSender
  );
  const timelock = await contractAt(
    "Timelock",
    await vester.gov(),
    referralSender
  );
  const batchSender = await contractAt(
    "BatchSender",
    "0xF0f929162751DD723fBa5b86A9B3C88Dc1D4957b",
    referralSender
  );
  const esGmx = await contractAt(
    "Token",
    "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17",
    referralSender
  );
  const data = await storage.get("distributionData");

  return { vester, timelock, batchSender, esGmx, data };
}

interface ReferralRewardsCallsParams {
  skipSendNativeToken: boolean;
  signer: any;
  referralSender: any;
  shouldSendTxn: boolean;
  nativeToken: { address: string; name: string };
  nativeTokenPrice: ethers.BigNumber;
  gmxPrice: ethers.BigNumber;
  values: any;
  network: string;
}

async function referralRewardsCalls({
  skipSendNativeToken,
  signer,
  referralSender,
  shouldSendTxn,
  nativeToken,
  nativeTokenPrice,
  gmxPrice,
  values,
  network,
}: ReferralRewardsCallsParams): Promise<Array<{ to: string; data: string }>> {
  const calls: Array<{ to: string; data: string }> = [];

  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" };
  const { vester, timelock, batchSender, esGmx, data } = values;
  const nativeTokenContract = await contractAt(
    "Token",
    nativeToken.address,
    referralSender
  );

  const affiliatesData = data.affiliates;
  const discountsData = data.referrals;

  const affiliateRewardsTypeId = 1;
  const traderDiscountsTypeId = 2;

  let totalAffiliateAmount = bigNumberify(0);
  let totalAffiliateUsd = bigNumberify(0);
  let allAffiliateUsd = bigNumberify(0);
  let totalDiscountAmount = bigNumberify(0);
  let totalDiscountUsd = bigNumberify(0);
  let allDiscountUsd = bigNumberify(0);
  let totalEsGmxAmount = bigNumberify(0);
  const affiliateAccounts: string[] = [];
  const affiliateAmounts: any[] = [];
  const discountAccounts: string[] = [];
  const discountAmounts: any[] = [];
  const esGmxAccounts: string[] = [];
  const esGmxAmounts: any[] = [];

  for (let i = 0; i < affiliatesData.length; i++) {
    const { account, rebateUsd, esgmxRewardsUsd } = affiliatesData[i];
    allAffiliateUsd = allAffiliateUsd.add(rebateUsd);

    if (account === AddressZero) {
      continue;
    }

    const amount = bigNumberify(rebateUsd)
      .mul(expandDecimals(1, 18))
      .div(nativeTokenPrice);
    affiliateAccounts.push(account);
    affiliateAmounts.push(amount);
    totalAffiliateAmount = totalAffiliateAmount.add(amount);
    totalAffiliateUsd = totalAffiliateUsd.add(rebateUsd);

    if (esgmxRewardsUsd) {
      const esGmxAmount = bigNumberify(esgmxRewardsUsd)
        .mul(expandDecimals(1, 18))
        .div(gmxPrice);
      esGmxAccounts.push(account);
      esGmxAmounts.push(esGmxAmount);
      totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount);
    }
  }

  for (let i = 0; i < discountsData.length; i++) {
    const { account, discountUsd } = discountsData[i];
    allDiscountUsd = allDiscountUsd.add(discountUsd);
    if (account === AddressZero) {
      continue;
    }

    const amount = bigNumberify(discountUsd)
      .mul(expandDecimals(1, 18))
      .div(nativeTokenPrice);
    discountAccounts.push(account);
    discountAmounts.push(amount);
    totalDiscountAmount = totalDiscountAmount.add(amount);
    totalDiscountUsd = totalDiscountUsd.add(discountUsd);
  }

  affiliatesData.sort((a: any, b: any) => {
    if (bigNumberify(a.rebateUsd).gt(b.rebateUsd)) {
      return -1;
    }
    if (bigNumberify(a.rebateUsd).lt(b.rebateUsd)) {
      return 1;
    }

    return 0;
  });

  const totalNativeAmount = totalAffiliateAmount.add(totalDiscountAmount);

  const batchSize = 150;

  const nativeTokenForSigner = await contractAt(
    "Token",
    nativeToken.address,
    signer
  );
  const balance = await nativeTokenForSigner.balanceOf(signer.address);
  if (!skipSendNativeToken) {
    if (balance.lt(totalNativeAmount)) {
      throw new Error(
        `Insufficient balance, required: ${totalNativeAmount.toString()}, available: ${balance.toString()}`
      );
    }
  }
  const esGmxBalance = await esGmx.balanceOf(referralSender.address);
  if (esGmxBalance.lt(totalEsGmxAmount)) {
    throw new Error(
      `Insufficient esGmx balance, required: ${totalEsGmxAmount.toString()}, available: ${esGmxBalance.toString()}`
    );
  }

  if (!shouldSendTxn) {
    return calls;
  }

  if (!skipSendNativeToken) {
    calls.push({
      to: nativeTokenForSigner.address,
      data: nativeTokenForSigner.interface.encodeFunctionData("transfer", [
        wallet.address,
        totalNativeAmount,
      ]),
    });

    calls.push({
      to: nativeTokenContract.address,
      data: nativeTokenContract.interface.encodeFunctionData("approve", [
        batchSender.address,
        totalNativeAmount,
      ]),
    });

    await processBatch(
      [affiliateAccounts, affiliateAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = batchSender.interface.encodeFunctionData("sendAndEmit", [
          nativeToken.address,
          accounts,
          amounts,
          affiliateRewardsTypeId,
        ]);
        calls.push({ to: batchSender.address, data: callData });
      }
    );

    await processBatch(
      [discountAccounts, discountAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = batchSender.interface.encodeFunctionData("sendAndEmit", [
          nativeToken.address,
          accounts,
          amounts,
          traderDiscountsTypeId,
        ]);
        calls.push({ to: batchSender.address, data: callData });
      }
    );
  }

  calls.push({
    to: esGmx.address,
    data: esGmx.interface.encodeFunctionData("approve", [batchSender.address, totalEsGmxAmount]),
  });

  await processBatch(
    [esGmxAccounts, esGmxAmounts],
    batchSize,
    async (currentBatch: [string, ethers.BigNumber][]) => {
      const accounts = currentBatch.map((item) => item[0]);
      const amounts = currentBatch.map((item) => item[1]);

      calls.push({
        to: batchSender.address,
        data: batchSender.interface.encodeFunctionData("sendAndEmit", [
          esGmx.address,
          accounts,
          amounts,
          affiliateRewardsTypeId,
        ]),
      });

      calls.push({
        to: timelock.address,
        data: timelock.interface.encodeFunctionData("batchIncreaseBonusRewards", [
          vester.address,
          accounts,
          amounts,
        ]),
      });
    }
  );

  return calls;
}