import { ethers } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
  Logger,
} from "@gelatonetwork/web3-functions-sdk/*";
import { Context } from "../../lib/gelato";
import {
  formatAmount,
  bigNumberify,
  expandDecimals,
  SHARE_DIVISOR,
  BONUS_TIER,
  USD_DECIMALS,
  GMX_DECIMALS,
  REWARD_THRESHOLD,
  ESGMX_REWARDS_THRESHOLD,
} from "../../lib/number";
import { SubgraphService } from "../../domain/subgraphService";
import {
  getFeeDistributionDataReceivedEventData,
  getFeeDistributorEventName,
} from "../../domain/fee/feeDistributionUtils";
import { dateToSeconds, getPeriod, RelativePeriodName } from "../../utils/date";

type AffiliateStatsQueryResult = {
  affiliate: string;
  timestamp: string;
  v1Data: {
    totalRebateUsd: string;
    discountUsd: string;
    volume: string;
    trades: string;
  };
  v2Data: {
    totalRebateUsd: string;
  };
};

type ReferralStatsQueryResult = {
  referral: string;
  timestamp: string;
  v1Data: {
    discountUsd: string;
    volume: string;
  };
};

type ReferralDiscountAggregate = {
  discountUsd: ethers.BigNumber;
  volume: ethers.BigNumber;
  allReferralsDiscountUsd?: ethers.BigNumber;
  account?: string;
  share?: ethers.BigNumber;
};

type AffiliateData = {
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
};

type AffiliateOutput = {
  account: string;
  share?: string;
  volume: string;
  tradesCount: number;
  rebateUsd: string;
  totalRebateUsd: string;
  tierId: number;
  esGmxRewards?: string | null;
  esGmxRewardsUsd?: string | null;
};

type ReferralOutput = {
  account: string;
  share: string;
  discountUsd: string;
  volume: string;
};

type ReferralRewardsCallsParams = {
  logger: Logger;
  skipSendNativeToken: boolean;
  feeDistributorVault: string;
  shouldSendTxn: boolean;
  wntPrice: ethers.BigNumber;
  gmxPrice: ethers.BigNumber;
  feeDistributor: ethers.Contract;
  wnt: ethers.Contract;
  esGmx: ethers.Contract;
  dataStr: string;
};

type OutputData = {
  fromTimestamp: number;
  toTimestamp: number;
  chainId: number;
  totalReferralVolume: string;
  totalRebateUsd: string;
  shareDivisor: string;
  affiliates: AffiliateOutput[];
  referrals: ReferralOutput[];
  gmxPrice: string;
  totalEsGmxRewards: string;
};

type PositionFeesInfoWithPeriods = {
  totalBorrowingFeeUsd: string;
  totalPositionFeeUsd: string;
};

type SwapFeesInfoWithPeriods = {
  totalFeeReceiverUsd: string;
  totalFeeUsdForPool: string;
};

const { AddressZero } = ethers.constants;

export const feeDistribution = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const {
    logger,
    log,
    userArgs,
    storage,
    contracts,
    multiChainProvider,
    gelatoArgs,
  } = context;
  const provider = multiChainProvider.default();

  const eventName = getFeeDistributorEventName(log, contracts.eventEmitter);

  let wntPrice: ethers.BigNumber, gmxPrice: ethers.BigNumber;

  if (
    (eventName === "FeeDistributionDataReceived" &&
      getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
        .isBridgingCompleted) ||
    eventName === "FeeDistributionBridgedGmxReceived"
  ) {
    await storage.delete("distributionData");
    await storage.delete("wntPrice");
    await storage.delete("gmxPrice");

    const fromTimestamp = Number(
      (await storage.get("fromTimestamp")) ?? userArgs.initialFromTimestamp
    );

    [wntPrice, gmxPrice] = await Promise.all([
      contracts.dateStore.getUint(userArgs.wntPriceKey),
      contracts.dateStore.getUint(userArgs.gmxPriceKey),
    ]);

    await storage.set("wntPrice", wntPrice.toString());
    await storage.set("gmxPrice", gmxPrice.toString());

    const [latestBlock, esGmxRewardsLimit, feesV1Usd, feesV2Usd] =
      await Promise.all([
        provider.getBlock("latest"),
        contracts.dataStore.getUint(userArgs.esGmxRewardsKey),
        processPeriodV1("prev", gelatoArgs.chainId),
        processPeriodV2("prev", gelatoArgs.chainId).mul(10).div(100),
      ]);
    const toTimestamp = latestBlock.timestamp;

    const output = await getDistributionData(
      logger,
      gelatoArgs.chainId,
      fromTimestamp,
      toTimestamp,
      gmxPrice,
      esGmxRewardsLimit
    );

    const nextFromTimestamp = toTimestamp + 1;
    await storage.set("fromTimestamp", nextFromTimestamp.toString());
    await storage.set("distributionData", JSON.stringify(output, null, 4));

    return {
      canExec: true,
      callData: [
        {
          to: contracts.feeDistributor.address,
          data: contracts.feeDistributor.interface.encodeFunctionData(
            "distribute",
            [
              output.totalRebateUsd,
              output.totalEsGmxRewards,
              feesV1Usd,
              feesV2Usd,
            ]
          ),
        },
      ],
    };
  } else if (eventName === "FeeDistributionCompleted") {
    const wntPriceStr = await storage.get("wntPrice");
    wntPrice = bigNumberify(wntPriceStr);
    const gmxPriceStr = await storage.get("gmxPrice");
    gmxPrice = bigNumberify(gmxPriceStr);
    const dataStr = await storage.get("distributionData");

    const referralRewardsRawCallData = await referralRewardsCalls({
      logger: logger,
      skipSendNativeToken: userArgs.skipSendNativeToken,
      feeDistributorVault: contracts.feeDistributorVault.address,
      shouldSendTxn: userArgs.shouldSendTxn,
      wntPrice: wntPrice,
      gmxPrice: gmxPrice,
      feeDistributor: contracts.feeDistributor,
      wnt: contracts.wnt,
      esGmx: contracts.esGmx,
      dataStr: dataStr,
    });

    const referralRewardsCallData = referralRewardsRawCallData.map((c) => ({
      to: c.to,
      data: c.data,
    }));

    if (!userArgs.shouldSendTxn) {
      logger.log("Referral Rewards Not sent"); // potentially simulate calls here for testing
    }

    return {
      canExec: userArgs.shouldSendTxn,
      callData: referralRewardsCallData,
    };
  } else {
    return {
      canExec: false,
      message: `No relevant event found: ${eventName}`,
    };
  }
};

// functions used to retrieve and calculate referral rewards

async function getAffiliatesTiers(
  chainId: number
): Promise<Record<string, number>> {
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

  return data.affiliates.reduce(
    (memo: Record<string, number>, item: { id: string; tierId: string }) => {
      memo[item.id] = parseInt(item.tierId, 10);
      return memo;
    },
    {} as Record<string, number>
  );
}

async function getDistributionData(
  logger: Logger,
  chainId: number,
  fromTimestamp: number,
  toTimestamp: number,
  gmxPrice: ethers.BigNumber,
  esGmxRewardsLimit: ethers.BigNumber
): Promise<OutputData> {
  const affiliateCondition = "";
  const referralCondition = "";

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

  const affiliateStats: AffiliateStatsQueryResult[] = [
    ...(data.affiliateStats0 as AffiliateStatsQueryResult[]),
    ...(data.affiliateStats1 as AffiliateStatsQueryResult[]),
    ...(data.affiliateStats2 as AffiliateStatsQueryResult[]),
    ...(data.affiliateStats3 as AffiliateStatsQueryResult[]),
    ...(data.affiliateStats4 as AffiliateStatsQueryResult[]),
    ...(data.affiliateStats5 as AffiliateStatsQueryResult[]),
  ];

  const referralStats: ReferralStatsQueryResult[] = [
    ...(data.referralStats0 as ReferralStatsQueryResult[]),
    ...(data.referralStats1 as ReferralStatsQueryResult[]),
    ...(data.referralStats2 as ReferralStatsQueryResult[]),
    ...(data.referralStats3 as ReferralStatsQueryResult[]),
    ...(data.referralStats4 as ReferralStatsQueryResult[]),
    ...(data.referralStats5 as ReferralStatsQueryResult[]),
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
  let totalEsGmxRewards = bigNumberify(0);

  const affiliatesRebatesData = affiliateStats.reduce(
    (memo: Record<string, AffiliateData>, item: AffiliateStatsQueryResult) => {
      const tierId = affiliatesTiers[item.affiliate] || 0;
      if (!memo[item.affiliate]) {
        memo[item.affiliate] = {
          rebateUsd: bigNumberify(0),
          totalRebateUsd: bigNumberify(0),
          volume: bigNumberify(0),
          v2TotalRebateUsd: bigNumberify(0),
          tradesCount: 0,
          tierId,
        };
      }

      const affiliateItem = memo[item.affiliate];

      const affiliateRebatesUsd = bigNumberify(item.v1Data.totalRebateUsd).sub(
        bigNumberify(item.v1Data.discountUsd)
      );
      allAffiliatesRebateUsd = allAffiliatesRebateUsd.add(affiliateRebatesUsd);
      affiliateItem.rebateUsd =
        affiliateItem.rebateUsd.add(affiliateRebatesUsd);
      affiliateItem.totalRebateUsd = affiliateItem.totalRebateUsd.add(
        bigNumberify(item.v1Data.totalRebateUsd)
      );
      affiliateItem.volume = affiliateItem.volume.add(
        bigNumberify(item.v1Data.volume)
      );
      affiliateItem.v2TotalRebateUsd = affiliateItem.v2TotalRebateUsd.add(
        bigNumberify(item.v2Data.totalRebateUsd)
      );
      affiliateItem.tradesCount += Number(item.v1Data.trades);

      totalRebateUsd = totalRebateUsd.add(
        bigNumberify(item.v1Data.totalRebateUsd)
      );
      totalReferralVolume = totalReferralVolume.add(
        bigNumberify(item.v1Data.volume)
      );
      return memo;
    },
    {}
  );

  if (allAffiliatesRebateUsd.eq(0)) {
    logger.warn("No rebates on %s", chainId);
    return {
      fromTimestamp,
      toTimestamp,
      chainId,
      totalReferralVolume: "0",
      totalRebateUsd: "0",
      shareDivisor: SHARE_DIVISOR.toString(),
      affiliates: [],
      referrals: [],
      gmxPrice: gmxPrice.toString(),
      totalEsGmxRewards: "0",
    };
  }

  Object.entries(affiliatesRebatesData).forEach(([account, data]) => {
    data.allAffiliatesRebateUsd = allAffiliatesRebateUsd;
    data.account = account;
    data.share = data.rebateUsd.mul(SHARE_DIVISOR).div(allAffiliatesRebateUsd);
  });

  const esGmxRewardsUsdLimit = esGmxRewardsLimit
    .mul(gmxPrice)
    .div(expandDecimals(1, GMX_DECIMALS));
  let totalEsGmxRewardsUsd = bigNumberify(0);

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
    data.esGmxRewardsUsd = data.totalRebateUsd
      .add(data.v2TotalRebateUsd)
      .div(5);

    data.esGmxRewards = data.esGmxRewardsUsd
      .mul(expandDecimals(1, USD_DECIMALS))
      .div(gmxPrice)
      .div(expandDecimals(1, 12));

    totalEsGmxRewardsUsd = totalEsGmxRewardsUsd.add(data.esGmxRewardsUsd);
    totalEsGmxRewards = totalEsGmxRewards.add(data.esGmxRewards);
  });

  if (totalEsGmxRewardsUsd.gt(esGmxRewardsUsdLimit)) {
    const denominator = totalEsGmxRewardsUsd
      .mul(USD_DECIMALS)
      .div(esGmxRewardsUsdLimit);

    totalEsGmxRewards = bigNumberify(0);
    Object.values(affiliatesRebatesData).forEach((data) => {
      if (!data.esGmxRewardsUsd) {
        return;
      }
      data.esGmxRewardsUsd = data.esGmxRewardsUsd
        .mul(USD_DECIMALS)
        .div(denominator);
      data.esGmxRewards = data.esGmxRewardsUsd
        .mul(expandDecimals(1, USD_DECIMALS))
        .div(gmxPrice)
        .div(expandDecimals(1, 12));
      totalEsGmxRewards = totalEsGmxRewards.add(data.esGmxRewards);
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
    gmxPrice: gmxPrice.toString(),
    totalEsGmxRewards: totalEsGmxRewards.toString(),
  };

  logger.log(
    "\nTotal referral volume: %s ($%s)",
    totalReferralVolume.toString(),
    formatAmount(totalReferralVolume, USD_DECIMALS, 4)
  );
  logger.log(
    "Total fees collected from referral traders: %s ($%s)",
    totalReferralVolume.div(1000).toString(),
    formatAmount(totalReferralVolume.div(1000), USD_DECIMALS, 4)
  );
  logger.log(
    "Total rebates (for Affiliates + Traders): %s ($%s)",
    totalRebateUsd.toString(),
    formatAmount(totalRebateUsd, USD_DECIMALS, 4)
  );

  logger.log("\nAffiliates (Affiliates):");
  logger.log(
    "Rebates sum: %s ($%s)",
    allAffiliatesRebateUsd.toString(),
    formatAmount(allAffiliatesRebateUsd, USD_DECIMALS, 4)
  );

  let consoleData: any[] = [];
  let filteredAffiliatesCount = 0;

  for (const data of Object.values(affiliatesRebatesData)) {
    const tooSmallEsGmx =
      !data.esGmxRewards || data.esGmxRewards.lt(ESGMX_REWARDS_THRESHOLD);
    const tooSmallReward = data.rebateUsd.lt(REWARD_THRESHOLD);
    const tooSmall = tooSmallReward && tooSmallEsGmx;

    consoleData.push({
      affiliate: data.account,
      "share, %": formatAmount(data.share || 0, 7, 4),
      "volume, $": formatAmount(data.volume, USD_DECIMALS, 4),
      "rebateUsd, $": formatAmount(data.rebateUsd, USD_DECIMALS, 4),
      trades: data.tradesCount,
      tierId: data.tierId,
      "esGmxRewards, $": data.esGmxRewardsUsd
        ? formatAmount(data.esGmxRewardsUsd, USD_DECIMALS, USD_DECIMALS)
        : null,
      esGmxRewards: data.esGmxRewards
        ? formatAmount(data.esGmxRewards, GMX_DECIMALS, GMX_DECIMALS)
        : null,
      tooSmall,
    });

    if (tooSmall) {
      filteredAffiliatesCount++;
      logger.log(
        "skip affiliate %s small rewards %s and esGMX %s",
        data.account,
        formatAmount(data.rebateUsd, USD_DECIMALS, 2),
        formatAmount(data.esGmxRewards || 0, 18, 2)
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
      esGmxRewards: data.esGmxRewards ? data.esGmxRewards.toString() : null,
      esGmxRewardsUsd: data.esGmxRewardsUsd
        ? data.esGmxRewardsUsd.toString()
        : null,
    });
  }

  logger.log(
    "Filter %s of %s affiliates with rebate < $%s",
    filteredAffiliatesCount,
    output.affiliates.length + filteredAffiliatesCount,
    formatAmount(REWARD_THRESHOLD, USD_DECIMALS, USD_DECIMALS)
  );
  logger.table(consoleData);

  let allReferralsDiscountUsd = bigNumberify(0);
  const referralDiscountData = referralStats.reduce(
    (
      memo: Record<string, ReferralDiscountAggregate>,
      item: ReferralStatsQueryResult
    ) => {
      if (!memo[item.referral]) {
        memo[item.referral] = {
          discountUsd: bigNumberify(0),
          volume: bigNumberify(0),
        };
      }

      const refItem = memo[item.referral];

      refItem.discountUsd = refItem.discountUsd.add(
        bigNumberify(item.v1Data.discountUsd)
      );
      refItem.volume = refItem.volume.add(bigNumberify(item.v1Data.volume));
      allReferralsDiscountUsd = allReferralsDiscountUsd.add(
        bigNumberify(item.v1Data.discountUsd)
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

  logger.log("Referrals (Traders):");
  logger.log(
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

  logger.log(
    "Filter %s of %s with discount < $%s",
    filteredTradersCount,
    filteredTradersCount + output.referrals.length,
    formatAmount(REWARD_THRESHOLD, USD_DECIMALS, USD_DECIMALS)
  );
  logger.table(consoleData);

  return output;
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

  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(
    end
  )}, period: daily`;
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

  const total = stats.reduce(
    (acc, { marginAndLiquidation, swap, mint, burn }) => {
      return (
        acc +
        BigInt(marginAndLiquidation) +
        BigInt(swap) +
        BigInt(mint) +
        BigInt(burn)
      );
    },
    0n
  );

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

  const where = `id_gte: ${dateToSeconds(start)}, id_lt: ${dateToSeconds(
    end
  )},  period: "1d"`;
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

  const positionStats = data.position as PositionFeesInfoWithPeriods[];
  const swapStats = data.swap as SwapFeesInfoWithPeriods[];

  const positionFees = positionStats.reduce((acc, stat) => {
    return (
      acc + BigInt(stat.totalBorrowingFeeUsd) + BigInt(stat.totalPositionFeeUsd)
    );
  }, 0n);

  const swapFees = swapStats.reduce((acc, stat) => {
    return (
      acc + BigInt(stat.totalFeeReceiverUsd) + BigInt(stat.totalFeeUsdForPool)
    );
  }, 0n);

  return bigNumberify(positionFees + swapFees);
}

// send referral rewards function and related helper functions

async function processBatch<T>(
  logger: Logger,
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
      logger.log(
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
    logger.log(
      "handling final batch",
      currentBatch.length,
      referenceList.length
    );
    await handler(currentBatch);
  }
}

async function referralRewardsCalls({
  logger,
  skipSendNativeToken,
  feeDistributorVault,
  shouldSendTxn,
  wntPrice,
  gmxPrice,
  feeDistributor,
  wnt,
  esGmx,
  dataStr,
}: ReferralRewardsCallsParams): Promise<{ to: string; data: string }[]> {
  const calls: Array<{ to: string; data: string }> = [];

  const data: OutputData = dataStr ? (JSON.parse(dataStr) as OutputData) : {};
  const affiliatesData = data.affiliates as AffiliateOutput[];
  const discountsData = data.referrals as ReferralOutput[];

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

  for (const item of affiliatesData) {
    const { account, rebateUsd, esGmxRewardsUsd } = item;
    const rebateUsdBn = bigNumberify(rebateUsd);

    allAffiliateUsd = allAffiliateUsd.add(rebateUsdBn);

    if (account === AddressZero) {
      continue;
    }

    const amount = rebateUsdBn.div(wntPrice);
    affiliateAccounts.push(account);
    affiliateAmounts.push(amount);
    totalAffiliateAmount = totalAffiliateAmount.add(amount);
    totalAffiliateUsd = totalAffiliateUsd.add(rebateUsdBn);

    if (esGmxRewardsUsd) {
      const esGmxAmount = bigNumberify(esGmxRewardsUsd).div(gmxPrice);
      esGmxAccounts.push(account);
      esGmxAmounts.push(esGmxAmount);
      totalEsGmxAmount = totalEsGmxAmount.add(esGmxAmount);
    }
  }

  for (const item of discountsData) {
    const { account, discountUsd } = item;
    const discountUsdBn = bigNumberify(discountUsd);

    allDiscountUsd = allDiscountUsd.add(discountUsdBn);
    if (account === AddressZero) {
      continue;
    }

    const amount = discountUsdBn.div(wntPrice);
    discountAccounts.push(account);
    discountAmounts.push(amount);
    totalDiscountAmount = totalDiscountAmount.add(amount);
    totalDiscountUsd = totalDiscountUsd.add(discountUsdBn);
  }

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
      logger,
      [affiliateAccounts, affiliateAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = feeDistributor.interface.encodeFunctionData(
          "sendReferralRewards",
          [wnt.address, batchSize, accounts, amounts]
        );
        calls.push({ to: feeDistributor.address, data: callData });
      }
    );

    await processBatch(
      [discountAccounts, discountAmounts],
      batchSize,
      async (currentBatch: [string, ethers.BigNumber][]) => {
        const accounts = currentBatch.map((item) => item[0]);
        const amounts = currentBatch.map((item) => item[1]);

        const callData = feeDistributor.interface.encodeFunctionData(
          "sendReferralRewards",
          [wnt.address, batchSize, accounts, amounts]
        );
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
        data: feeDistributor.interface.encodeFunctionData(
          "sendReferralRewards",
          [esGmx.address, batchSize, accounts, amounts]
        ),
      });
    }
  );

  return calls;
}
