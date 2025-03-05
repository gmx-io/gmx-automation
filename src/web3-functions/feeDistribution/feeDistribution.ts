/* eslint-disable @typescript-eslint/naming-convention */

import { ethers } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { Context } from "../../lib/gelato";
import { getContracts } from "../../lib/contracts";
import { 
  formatAmount,
  stringToFixed, 
  bigNumberify, 
  expandDecimals, 
  SHARE_DIVISOR, 
  BONUS_TIER, 
  USD_DECIMALS, 
  GMX_DECIMALS, 
  REWARD_THRESHOLD, 
  ESGMX_REWARDS_THRESHOLD 
} from "../../lib/number";
import { SubgraphService } from "../../domain/subgraphService";
import { 
  ARBITRUM, 
  AVALANCHE 
} from "../../config/chains";
import { 
  dateToSeconds, 
  getPeriod, 
  getRecentWednesdayStartOfDay 
} from "../../utils/date";
import { getAddress } from "../../config/addresses";

type AffiliateData {
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

type EsGMXReferralRewardsDataParams {
  chainId: number;
  from: number;
  to: number;
  account?: string;
}

type ReferralRewardsCallsParams {
  skipSendNativeToken: boolean;
  readOnlyProvider: ethers.providers.Provider;
  feeDistributorVault: string;
  shouldSendTxn: boolean;
  wntPrice: ethers.BigNumber;
  gmxPrice: ethers.BigNumber;
  values: any;
  chainId: number;
}

type OutputData {
  fromTimestamp: number;
  toTimestamp: number;
  chainId: number;
  totalReferralVolume: string;
  totalRebateUsd: string;
  shareDivisor: string;
  affiliates: any;
  referrals: any;
  gmxPrice: ethers.BigNumber;
  esgmxRewards: ethers.BigNumber;
}

const { AddressZero } = ethers.constants;

export const feeDistribution = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const { log, userArgs, storage, services, contracts, multiChainProvider, gelatoArgs } = context;
  const provider = multiChainProvider.default();

  const eventName = getFeeDistributorEventName(
    log,
    contracts.eventEmitter
  );

  let wntPrice: ethers.BigNumber, gmxPrice: ethers.BigNumber;
  if (eventName === "FeeDistributionDataReceived") {
    await storage.delete("distributionData");
    await storage.delete("wntPrice");
    await storage.delete("gmxPrice");

    const feeDistributionDataReceivedEventData = getFeeDistributionDataReceivedEventData(
        log,
        contracts.eventEmitter
    );
    wntPrice = feeDistributionDataReceivedEventData.wntPrice;
    await storage.set("wntPrice", wntPrice.toString());

    const arbitrumProvider = multiChainProvider.chainId(ARBITRUM);
    const arbContracts = getContracts(ARBITRUM, arbitrumProvider);
    gmxPrice = getGmxPrice(arbContracts.vault, arbContracts.uniswapGmxWethPool, getAddress(ARBITRUM, "wnt")),
    await storage.set("gmxPrice", gmxPrice.toString());

    const fromTimestamp = Number(
      (await storage.get("fromTimestamp")) ?? userArgs.initialFromTimestamp
    );

    const [latestBlock, esGmxRewards, feesV1Usd, feesV2Usd] = await Promise.all([
      provider.getBlock("latest"),
      contracts.dataStore.getUint(userArgs.esGmxRewardsKey),
      processPeriodV1('prev', gelatoArgs.chainId),
      processPeriodV2('prev', gelatoArgs.chainId).mul(10).div(100)
    ])
    const toTimestamp = latestBlock.timestamp;
    
    const [totalRebateUsd, esgmxRewardsTotal] = await getDistributionData(
      gelatoArgs.chainId,
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
          to: contracts.feeDistributor.address,
          data: contracts.feeDistributor.interface.encodeFunctionData("distribute", [
            totalRebateUsd,
            esgmxRewardsTotal,
            feesV1Usd,
            feesV2Usd,
          ]),
        },
      ],
    };
  } else if (eventName === "FeeDistributionCompleted") {
  
    const wntPriceStr = await storage.get("wntPrice");
    wntPrice = bigNumberify(wntPriceStr);
    const gmxPriceStr = await storage.get("gmxPrice");
    gmxPrice = bigNumberify(gmxPriceStr);
    let referralValues;
    if (gelatoArgs.chainId === ARBITRUM) {
      referralValues = await getArbValues(provider);
    } else if (gelatoArgs.chainId === AVALANCHE) {
      referralValues = await getAvaxValues(provider);
    } else {
      throw new Error(`Unsupported network: ${gelatoArgs.chainId}`);
    }

    const shouldSendTxn = userArgs.shouldSendTxn;

    const referralRewardsCalls = await referralRewardsCalls({
      skipSendNativeToken: userArgs.skipSendNativeToken,
      provider,
      getAddress(gelatoArgs.chainId, "feeDistributorVault"),
      shouldSendTxn,
      wntPrice,
      gmxPrice,
      referralValues,
      gelatoArgs.chainId,
    });

    const referralDistributionCallData = referralRewardsCalls.map((c) => ({
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
  }
};

async function getGmxPrice(
  vault: ethers.Contract,
  uniswapPool: ethers.Contract,
  WETH_ADDRESS: string
) {
  const [sqrtPriceX96] = await uniswapPool.slot0();
  const SCALE_1e30 = bigNumberify(10).pow(30);
  const ratioSq = sqrtPriceX96.mul(sqrtPriceX96);
  const ratioScaled = ratioSq.mul(SCALE_1e30).div(bigNumberify(2).pow(192));

  const ethPrice = await vault.getMaxPrice(WETH_ADDRESS);
  const gmxPrice = ethPrice.mul(ratioScaled).div(SCALE_1e30);
  return gmxPrice;
}

// functions used to retrieve and calculate referral rewards

async function getAffiliatesTiers(chainId: number): Promise<Record<string, number>> {
  const subgraphService = new SubgraphService({ chainId });
  
  const query = `{
      affiliates(first: 1000, where: { tierId_in: ["2", "1"]}) {
        id,
        tierId
      }
    }`;
  
  const data = await subgraphService.querySubgraph("referrals", query);
  
  if (data.affiliates.length === 1000) {
    throw new Error("Affiliates should be paginated");
  }
  
  return data.affiliates.reduce((memo: Record<string, number>, item: { id: string; tierId: string }) => {
    memo[item.id] = parseInt(item.tierId);
    return memo;
  }, {} as Record<string, number>);
}

async function getDistributionData(
  chainId: number,
  fromTimestamp: number,
  toTimestamp: number,
  gmxPrice: ethers.BigNumber,
  esgmxRewards: ethers.BigNumber
): Promise<[ethers.BigNumber, ethers.BigNumber]> {
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

  const subgraphService = new SubgraphService({ chainId });
  const [data, affiliatesTiers] = await Promise.all([
    subgraphService.querySubgraph("referrals", query),
    getAffiliatesTiers(chainId),
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

  let allAffiliatesRebateUsd = bigNumberify(0);
  let totalReferralVolume = bigNumberify(0);
  let totalRebateUsd = bigNumberify(0);
  let esgmxRewardsTotal = bigNumberify(0);

  const affiliatesRebatesData = affiliateStats.reduce(
    (memo: Record<string, AffiliateData>, item: any) => {
      const affiliateItem = memo[item.affiliate]
      const tierId = affiliatesTiers[item.affiliate] || 0;
      if (!affiliateItem) {
        affiliateItem = {
          rebateUsd: bigNumberify(0),
          totalRebateUsd: bigNumberify(0),
          volume: bigNumberify(0),
          v2TotalRebateUsd: bigNumberify(0),
          tradesCount: 0,
          tierId,
        };
      }

      const affiliateRebatesUsd = bigNumberify(item.v1Data.totalRebateUsd).sub(bigNumberify(item.v1Data.discountUsd));
      allAffiliatesRebateUsd = allAffiliatesRebateUsd.add(affiliateRebatesUsd);
      affiliateItem.rebateUsd =
      affiliateItem.rebateUsd.add(affiliateRebatesUsd);
      affiliateItem.totalRebateUsd = affiliateItem.totalRebateUsd.add(bigNumberify(item.v1Data.totalRebateUsd));
      affiliateItem.volume = affiliateItem.volume.add(bigNumberify(item.v1Data.volume));
      affiliateItem.v2TotalRebateUsd = affiliateItem.v2TotalRebateUsd.add(bigNumberify(item.v2Data.totalRebateUsd));
      affiliateItem.tradesCount += Number(item.v1Data.trades);

      totalRebateUsd = totalRebateUsd.add(bigNumberify(item.v1Data.totalRebateUsd));
      totalReferralVolume = totalReferralVolume.add(bigNumberify(item.v1Data.volume));
      return memo;
    },
    {}
  );

  if (allAffiliatesRebateUsd.eq(0)) {
    console.warn("No rebates on %s", chainId);
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
  let esgmxRewardsTotalUsd = bigNumberify(0);

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
    
    esgmxRewardsTotalUsd = esgmxRewardsTotalUsd.add(data.esgmxRewardsUsd);
    esgmxRewardsTotal = esgmxRewardsTotal.add(data.esgmxRewards);
  });

  if (esgmxRewardsTotalUsd.gt(esgmxRewardsUsdLimit)) {
    const denominator = esgmxRewardsTotalUsd
      .mul(USD_DECIMALS)
      .div(esgmxRewardsUsdLimit);
    
    esgmxRewardsTotal = bigNumberify(0);
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

  const output: OutputData = {
    fromTimestamp,
    toTimestamp,
    chainId,
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
    formatAmount(totalReferralVolume, USD_DECIMALS, 4)
  );
  console.log(
    "Total fees collected from referral traders: %s ($%s)",
    totalReferralVolume.div(1000).toString(),
    formatAmount(totalReferralVolume.div(1000), USD_DECIMALS, 4)
  );
  console.log(
    "Total rebates (for Affiliates + Traders): %s ($%s)",
    totalRebateUsd.toString(),
    formatAmount(totalRebateUsd, USD_DECIMALS, 4)
  );

  console.log("\nAffiliates (Affiliates):");
  console.log(
    "Rebates sum: %s ($%s)",
    allAffiliatesRebateUsd.toString(),
    formatAmount(allAffiliatesRebateUsd, USD_DECIMALS, 4)
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
      "share, %": formatAmount(data.share || 0, 7, 4),
      "volume, $": formatAmount(data.volume, USD_DECIMALS, 4),
      "rebateUsd, $": formatAmount(data.rebateUsd, USD_DECIMALS, 4),
      trades: data.tradesCount,
      tierId: data.tierId,
      "esgmxRewards, $": data.esgmxRewardsUsd
        ? formatAmount(data.esgmxRewardsUsd, USD_DECIMALS, USD_DECIMALS)
        : null,
      esgmxRewards: data.esgmxRewards
        ? formatAmount(data.esgmxRewards, GMX_DECIMALS, GMX_DECIMALS)
        : null,
      tooSmall,
    });

    if (tooSmall) {
      filteredAffiliatesCount++;
      console.log(
        "skip affiliate %s small rewards %s and esGMX %s",
        data.account,
        formatAmount(data.rebateUsd, USD_DECIMALS, 2),
        formatAmount(data.esgmxRewards || 0, 18, 2)
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
    formatAmount(REWARD_THRESHOLD, USD_DECIMALS, USD_DECIMALS)
  );
  console.table(consoleData);

  let allReferralsDiscountUsd = bigNumberify(0);
  const referralDiscountData = referralStats.reduce(
    (memo: Record<string, any>, item: any) => {
      if (!memo[item.referral]) {
        memo[item.referral] = {
          discountUsd: bigNumberify(0),
          volume: bigNumberify(0),
        };
      }
      memo[item.referral].discountUsd = memo[item.referral].discountUsd.add(bigNumberify(item.v1Data.discountUsd));
      memo[item.referral].volume = memo[item.referral].volume.add(bigNumberify(item.v1Data.volume));
      allReferralsDiscountUsd = allReferralsDiscountUsd.add(bigNumberify(item.v1Data.discountUsd));
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
    formatAmount(allReferralsDiscountUsd, USD_DECIMALS, 4)
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
      "share, %": formatAmount(data.share, 7, 4),
      "volume, $": formatAmount(data.volume, USD_DECIMALS, 4),
      "discountUsd, $": formatAmount(data.discountUsd, USD_DECIMALS, 4),
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
    formatAmount(REWARD_THRESHOLD, USD_DECIMALS, USD_DECIMALS)
  );
  console.table(consoleData);

  await storage.set("distributionData", JSON.stringify(output, null, 4));

  return [output.totalRebateUsd, esgmxRewardsTotal];
}

export async function getEsGMXReferralRewardsData({
  chainId,
  from,
  to,
  account,
}: EsGMXReferralRewardsDataParams): Promise<
  Array<{ account: string; amount: string }>
> {
  const esGmxTokenAddress = getAddress(chainId, esGmx);

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

  const subgraphService = new SubgraphService({ chainId });
  const data = await subgraphService.querySubgraph("referrals", query);

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

async function processPeriodV1(
  relativePeriodName: RelativePeriodName,
  chainId: number
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

  const subgraphService = new SubgraphService({ chainId });
  const data = await subgraphService.querySubgraph("stats", gql);
  const stats = data.feeStats;

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
  chainId: number
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

  const subgraphService = new SubgraphService({ chainId });
  const data = await subgraphService.querySubgraph("stats", gql);

  const positionStats = data.position;
  const swapStats = data.swap;

  const positionFees = positionStats.reduce((acc, stat) => {
    return acc + BigInt(stat.totalBorrowingFeeUsd) + BigInt(stat.totalPositionFeeUsd);
  }, 0n);

  const swapFees = swapStats.reduce((acc, stat) => {
    return acc + BigInt(stat.totalFeeReceiverUsd) + BigInt(stat.totalFeeUsdForPool);
  }, 0n);

  return bigNumberify(positionFees + swapFees);
}

// send referral rewards function and related helper functions

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

async function getArbValues(provider: ethers.providers.Provider): Promise<any> {
  const contracts = getContracts(ARBITRUM, provider);
  
  const feeDistributor = contracts.feeDistributor;
  const wnt = contracts.wnt;
  const esGmx = contracts.esGmx;
  const data = await storage.get("distributionData");

  return { feeDistributor, wnt, esGmx, data };
}

async function getAvaxValues(provider: ethers.providers.Provider): Promise<any> {
  const contracts = getContracts(AVALANCHE, provider);
  
  const feeDistributor = contracts.feeDistributor;
  const wnt = contracts.wnt;
  const esGmx = contracts.esGmx;
  const data = await storage.get("distributionData");

  return { feeDistributor, wnt, esGmx, data };
}

async function referralRewardsCalls({
  skipSendNativeToken,
  readOnlyProvider,
  feeDistributorVault,
  shouldSendTxn,
  wntPrice,
  gmxPrice,
  values,
  chainId,
}: ReferralRewardsCallsParams): Promise<{ to: string; data: string }[]> {
  const calls: Array<{ to: string; data: string }> = [];

  const { wnt, feeDistributor, esGmx, data } = values;

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
  const affiliateAmounts: ethers.BigNumber[] = [];
  const discountAccounts: string[] = [];
  const discountAmounts: ethers.BigNumber[] = [];
  const esGmxAccounts: string[] = [];
  const esGmxAmounts: ethers.BigNumber[] = [];

  for (let i = 0; i < affiliatesData.length; i++) {
    const { account, rebateUsd, esgmxRewardsUsd } = affiliatesData[i];
    allAffiliateUsd = allAffiliateUsd.add(rebateUsd);

    if (account === AddressZero) {
      continue;
    }

    const amount = bigNumberify(rebateUsd)
      .mul(expandDecimals(1, 18))
      .div(wntPrice);
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
      .div(wntPrice);
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

  const balance = await wnt.balanceOf(feeDistributorVault);
  if (!skipSendNativeToken) {
    if (balance.lt(totalNativeAmount)) {
      throw new Error(
        `Insufficient balance, required: ${totalNativeAmount.toString()}, available: ${balance.toString()}`
      );
    }
  }
  const esGmxBalance = await esGmx.balanceOf(feeDistributorVault);
  if (esGmxBalance.lt(totalEsGmxAmount)) {
    throw new Error(
      `Insufficient esGmx balance, required: ${totalEsGmxAmount.toString()}, available: ${esGmxBalance.toString()}`
    );
  }

  if (!shouldSendTxn) {
    return calls;
  }

  if (!skipSendNativeToken) {
    await processBatch(
      [affiliateAccounts, affiliateAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = feeDistributor.interface.encodeFunctionData("sendWnt", [
          accounts,
          amounts,
          batchSize,
        ]);
        calls.push({ to: feeDistributor.address, data: callData });
      }
    );

    await processBatch(
      [discountAccounts, discountAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = feeDistributor.interface.encodeFunctionData("sendWnt", [
          accounts,
          amounts,
          batchSize,
        ]);
        calls.push({ to: feeDistributor.address, data: callData });
      }
    );
  }

  await processBatch(
    [esGmxAccounts, esGmxAmounts],
    batchSize,
    async (currentBatch: [string, ethers.BigNumber][]) => {
      const accounts = currentBatch.map((item) => item[0]);
      const amounts = currentBatch.map((item) => item[1]);

      calls.push({
        to: feeDistributor.address,
        data: feeDistributor.interface.encodeFunctionData("sendEsGmxAndIncreaseBonusRewards", [
          accounts,
          amounts,
          batchSize,
        ]),
      });
    }
  );

  return calls;
}