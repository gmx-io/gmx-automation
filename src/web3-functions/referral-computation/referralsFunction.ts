/* eslint-disable @typescript-eslint/naming-convention */

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

const SHARE_DIVISOR = BigNumber.from("1000000000"); // 1e9
const BONUS_TIER = 2; // for EsGMX distributions
const USD_DECIMALS = 30;
const GMX_DECIMALS = 18;
const REWARD_THRESHOLD = expandDecimals(1, 28); // 1 cent
const ESGMX_REWARDS_THRESHOLD = expandDecimals(1, 16); // 0.01 esGMX

export const referralsFunction = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const { userArgs, storage, multiChainProvider } = context;
  const provider = multiChainProvider.default();
  const network = userArgs.network;
  const distributeReferralRewards = false; // logic to parse log from event to be added
  if (!distributeReferralRewards) {
    const fromTimestamp = (await storage.get("fromTimestamp")) || userArgs.initialFromTimestamp;
    const toTimestamp = await provider.getBlock("latest").timestamp;
    const gmxPrice = "20"; //placeholder, will retrieve on-chain
    const esgmxRewards = "5000"; //perhaps retrieving from dataStore is more appropriate
    const totalRebateUsd = await getDistributionData(
      network,
      fromTimestamp,
      toTimestamp,
      gmxPrice,
      esgmxRewards
    );

    const nextFromTimestamp = toTimestamp + 1;
    await storage.set("fromTimestamp", nextFromTimestamp.toString());

    return {
      canExec: true,
      callData: [
        {
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.uintKey as string,
            totalRebateUsd,
          ]),
        },
        { //call to FeeDistributor.distribute() to be added below
          to: contracts.dataStore.address,
          data: contracts.dataStore.interface.encodeFunctionData("setUint", [
            userArgs.uintKey as string,
            totalRebateUsd,
          ]),
        },
      ],
    };
  }
  

  const referralDistributionCallData; //logic to be added

  return {
    canExec: true,
    callData: referralDistributionCallData,
  };
});

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
  gmxPrice?: string,
  esgmxRewards?: string
): Promise<void> {
  let _gmxPrice: ethers.BigNumber | undefined;
  let _esgmxRewards: ethers.BigNumber | undefined;

  if (gmxPrice) {
    _gmxPrice = parseUnits(gmxPrice, USD_DECIMALS);
  }
  if (esgmxRewards) {
    _esgmxRewards = parseUnits(esgmxRewards, GMX_DECIMALS);
  }
  let affiliateCondition = "";
  let referralCondition = "";
  if (account) {
    affiliateCondition = `,affiliate: "${account.toLowerCase()}"`;
    referralCondition = `,referral: "${account.toLowerCase()}"`;
  }

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

  if (_gmxPrice && _esgmxRewards) {
    const esgmxRewardsUsdLimit = _esgmxRewards
      .mul(_gmxPrice)
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
        .div(_gmxPrice)
        .div(expandDecimals(1, 12));
      esgmxRewardsUsdTotal = esgmxRewardsUsdTotal.add(data.esgmxRewardsUsd);
    });

    if (esgmxRewardsUsdTotal.gt(esgmxRewardsUsdLimit)) {
      const denominator = esgmxRewardsUsdTotal
        .mul(USD_DECIMALS)
        .div(esgmxRewardsUsdLimit);
      Object.values(affiliatesRebatesData).forEach((data) => {
        if (!data.esgmxRewardsUsd) return;
        data.esgmxRewardsUsd = data.esgmxRewardsUsd
          .mul(USD_DECIMALS)
          .div(denominator);
        data.esgmxRewards = data.esgmxRewardsUsd
          .mul(expandDecimals(1, USD_DECIMALS))
          .div(_gmxPrice)
          .div(expandDecimals(1, 12));
      });
    }
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
    gmxPrice: _gmxPrice,
    esgmxRewards: _esgmxRewards,
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

  return output.totalRebateUsd;
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
