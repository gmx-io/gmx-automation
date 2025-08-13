import { ethers, BigNumber } from "ethers";
import {
  formatAmount,
  bigNumberify,
  SHARE_DIVISOR,
  BONUS_TIER,
  USD_DECIMALS,
  GMX_DECIMALS,
  REWARD_THRESHOLD,
  ESGMX_REWARDS_THRESHOLD,
  ZERO,
} from "../../lib/number";
import { SubgraphService } from "../../domain/subgraphService";
import { dateToSeconds, getPeriod, RelativePeriodName } from "../../utils/date";
import { Logger } from "../../lib/logger";
import { SupportedChainId } from "../../config/chains";

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
  discountUsd: BigNumber;
  volume: BigNumber;
  allReferralsDiscountUsd?: BigNumber;
  account?: string;
  share?: BigNumber;
};

type AffiliateData = {
  rebateUsd: BigNumber;
  totalRebateUsd: BigNumber;
  volume: BigNumber;
  v2TotalRebateUsd: BigNumber;
  tradesCount: number;
  tierId: number;
  esGmxRewards?: BigNumber;
  esGmxRewardsUsd?: BigNumber;
  allAffiliatesRebateUsd?: BigNumber;
  account?: string;
  share?: BigNumber;
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
  feeDistributorVault: string;
  shouldSendTxn: boolean;
  wntPrice: BigNumber;
  feeDistributor: ethers.Contract;
  wnt: ethers.Contract;
  esGmx: ethers.Contract;
  dataStr: string;
  distributionId: string;
};

type OutputData = {
  fromTimestamp: number;
  toTimestamp: number;
  chainId: SupportedChainId;
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

// functions used to retrieve and calculate referral rewards

async function getAffiliatesTiers(
  chainId: SupportedChainId
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

export async function getDistributionData(
  logger: Logger,
  chainId: SupportedChainId,
  fromTimestamp: number,
  toTimestamp: number,
  gmxPrice: BigNumber,
  maxEsGmxRewards: BigNumber
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

  const chunkSize = 10_000;
  const chunksCount = 6;
  let query = "";

  for (let i = 0; i < chunksCount; i++) {
    query += `
    affiliateStats${i}: ${getAffiliateStatsQuery(i * chunkSize)}
    referralStats${i}: ${getReferralStatsQuery(i * chunkSize)}
    `;
  }

  query = `{
      ${query}
    }
    `;

  const subgraphService = new SubgraphService({ chainId });
  const [data, affiliatesTiers] = await Promise.all([
    subgraphService.querySubgraph("referrals", query),
    getAffiliatesTiers(chainId),
  ]);

  const affiliateStats: AffiliateStatsQueryResult[] = [];
  const referralStats: ReferralStatsQueryResult[] = [];

  for (let i = 0; i < chunksCount; i++) {
    affiliateStats.push(
      ...(data[`affiliateStats${i}`] as AffiliateStatsQueryResult[])
    );
    referralStats.push(
      ...(data[`referralStats${i}`] as ReferralStatsQueryResult[])
    );
  }

  if (referralStats.length >= chunkSize * chunksCount) {
    throw new Error("Referrals stats should be paginated");
  }

  if (affiliateStats.length >= chunkSize * chunksCount) {
    throw new Error("Affiliates stats should be paginated");
  }

  let allAffiliatesRebateUsd = ZERO;
  let totalReferralVolume = ZERO;
  let totalRebateUsd = ZERO;
  let totalEsGmxRewards = ZERO;

  const affiliatesRebatesData = affiliateStats.reduce(
    (memo: Record<string, AffiliateData>, item: AffiliateStatsQueryResult) => {
      const tierId = affiliatesTiers[item.affiliate] || 0;

      if (!memo[item.affiliate]) {
        memo[item.affiliate] = {
          rebateUsd: ZERO,
          totalRebateUsd: ZERO,
          volume: ZERO,
          v2TotalRebateUsd: ZERO,
          tradesCount: 0,
          tierId,
        };
      }

      const affiliateItem: AffiliateData = memo[item.affiliate]!;

      const affiliateRebatesUsd = bigNumberify(item.v1Data.totalRebateUsd).sub(
        item.v1Data.discountUsd
      );
      allAffiliatesRebateUsd = allAffiliatesRebateUsd.add(affiliateRebatesUsd);
      affiliateItem.rebateUsd =
        affiliateItem.rebateUsd.add(affiliateRebatesUsd);
      affiliateItem.totalRebateUsd = affiliateItem.totalRebateUsd.add(
        item.v1Data.totalRebateUsd
      );
      affiliateItem.volume = affiliateItem.volume.add(item.v1Data.volume);
      affiliateItem.v2TotalRebateUsd = affiliateItem.v2TotalRebateUsd.add(
        item.v2Data.totalRebateUsd
      );
      affiliateItem.tradesCount += Number(item.v1Data.trades);

      totalRebateUsd = totalRebateUsd.add(item.v1Data.totalRebateUsd);
      totalReferralVolume = totalReferralVolume.add(item.v1Data.volume);
      return memo;
    },
    {}
  );

  if (allAffiliatesRebateUsd.eq(0)) {
  logger.warn("No V1 rebates on %s; continuing to compute esGMX rewards (v1+v2)", chainId);
  }

  const hasV1Rebates = !allAffiliatesRebateUsd.eq(0);

  Object.entries(affiliatesRebatesData).forEach(([account, data]) => {
    data.allAffiliatesRebateUsd = allAffiliatesRebateUsd;
    data.account = account;
    data.share = hasV1Rebates
      ? data.rebateUsd.mul(SHARE_DIVISOR).div(allAffiliatesRebateUsd)
      : ZERO;
  });

  const maxEsGmxRewardsInUsd = maxEsGmxRewards.mul(gmxPrice);
  let totalEsGmxRewardsInUsd = ZERO;

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

    data.esGmxRewards = data.esGmxRewardsUsd.div(gmxPrice);

    totalEsGmxRewardsInUsd = totalEsGmxRewardsInUsd.add(data.esGmxRewardsUsd);
    totalEsGmxRewards = totalEsGmxRewards.add(data.esGmxRewards);
  });

  if (totalEsGmxRewardsInUsd.gt(maxEsGmxRewardsInUsd)) {
    const denominator = totalEsGmxRewardsInUsd
      .mul(USD_DECIMALS)
      .div(maxEsGmxRewardsInUsd);

    totalEsGmxRewards = ZERO;
    Object.values(affiliatesRebatesData).forEach((data) => {
      if (!data.esGmxRewardsUsd) {
        return;
      }
      data.esGmxRewardsUsd = data.esGmxRewardsUsd
        .mul(USD_DECIMALS)
        .div(denominator);
      data.esGmxRewards = data.esGmxRewardsUsd.div(gmxPrice);
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
      account: data.account!,
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

  let allReferralsDiscountUsd = ZERO;
  const referralDiscountData = referralStats.reduce(
    (
      memo: Record<string, ReferralDiscountAggregate>,
      item: ReferralStatsQueryResult
    ) => {
      if (!memo[item.referral]) {
        memo[item.referral] = {
          discountUsd: ZERO,
          volume: ZERO,
        };
      }

      const refItem = memo[item.referral]!;

      refItem.discountUsd = refItem.discountUsd.add(item.v1Data.discountUsd);
      refItem.volume = refItem.volume.add(item.v1Data.volume);
      allReferralsDiscountUsd = allReferralsDiscountUsd.add(
        item.v1Data.discountUsd
      );
      return memo;
    },
    {}
  );

  const hasV1ReferralDiscounts = !allReferralsDiscountUsd.eq(0);

  Object.entries(referralDiscountData).forEach(([account, data]) => {
    data.allReferralsDiscountUsd = allReferralsDiscountUsd;
    data.account = account;
    data.share = hasV1ReferralDiscounts
      ? data.discountUsd.mul(SHARE_DIVISOR).div(allReferralsDiscountUsd)
      : ZERO;
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
    if (data.share!.eq(0)) {
      continue;
    }
    const tooSmall = data.discountUsd.lt(REWARD_THRESHOLD);
    consoleData.push({
      referral: data.account,
      "share, %": formatAmount(data.share!, 7, 4),
      "volume, $": formatAmount(data.volume, USD_DECIMALS, 4),
      "discountUsd, $": formatAmount(data.discountUsd, USD_DECIMALS, 4),
      tooSmall,
    });
    if (tooSmall) {
      filteredTradersCount++;
      continue;
    }
    output.referrals.push({
      account: data.account!,
      share: data.share!.toString(),
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

// functions used to retrieve v1Fees and v2Fees

export async function processPeriodV1(
  relativePeriodName: RelativePeriodName,
  chainId: SupportedChainId
): Promise<BigNumber> {
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
  const data = await subgraphService.querySubgraph("statsV1", gql);

  const total: BigNumber = (data.feeStats as any[]).reduce<BigNumber>(
    (
      acc: BigNumber,
      stat: {
        marginAndLiquidation: string;
        swap: string;
        mint: string;
        burn: string;
      }
    ): BigNumber => {
      return acc
        .add(stat.marginAndLiquidation)
        .add(stat.swap)
        .add(stat.mint)
        .add(stat.burn);
    },
    ZERO
  );

  return total;
}

export async function processPeriodV2(
  relativePeriodName: RelativePeriodName,
  chainId: SupportedChainId
): Promise<BigNumber> {
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
  const data = await subgraphService.querySubgraph("statsV2", gql);

  const positionStats = data.position as PositionFeesInfoWithPeriods[];
  const swapStats = data.swap as SwapFeesInfoWithPeriods[];

  const positionFees = positionStats.reduce((acc, stat) => {
    return acc.add(stat.totalBorrowingFeeUsd).add(stat.totalPositionFeeUsd);
  }, ZERO);

  const swapFees = swapStats.reduce((acc, stat) => {
    return acc.add(stat.totalFeeReceiverUsd).add(stat.totalFeeUsdForPool);
  }, ZERO);

  return positionFees.add(swapFees);
}

// functions used to send out referral rewards

async function processBatch(
  logger: Logger,
  accounts: string[],
  amounts: BigNumber[],
  batchSize: number,
  handler: (batch: [string, BigNumber][]) => Promise<void>
): Promise<void> {
  if (accounts.length !== amounts.length) {
    throw new Error(
      `accounts (${accounts.length}) and amounts (${amounts.length}) lengths differ`
    );
  }
  if (accounts.length === 0) {
    throw new Error("at least one entry is required");
  }

  let currentBatch: [string, BigNumber][] = [];

  for (let i = 0; i < accounts.length; i++) {
    currentBatch.push([accounts[i]!, amounts[i]!]);

    if (currentBatch.length === batchSize) {
      logger.log(
        "handling current batch",
        i,
        currentBatch.length,
        accounts.length
      );
      await handler(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length) {
    logger.log("handling final batch", currentBatch.length, accounts.length);
    await handler(currentBatch);
  }
}

export async function referralRewardsCalls({
  logger,
  feeDistributorVault,
  shouldSendTxn,
  wntPrice,
  feeDistributor,
  wnt,
  esGmx,
  dataStr,
  distributionId,
}: ReferralRewardsCallsParams): Promise<{ to: string; data: string }[]> {
  const calls: Array<{ to: string; data: string }> = [];

  if (!dataStr) {
    throw new Error("dataStr is required");
  }
  const data: OutputData = JSON.parse(dataStr) as OutputData;
  const affiliatesData = data.affiliates as AffiliateOutput[];
  const discountsData = data.referrals as ReferralOutput[];

  let totalAffiliateAmount = ZERO;
  let totalAffiliateUsd = ZERO;
  let allAffiliateUsd = ZERO;
  let totalDiscountAmount = ZERO;
  let totalDiscountUsd = ZERO;
  let allDiscountUsd = ZERO;
  let totalEsGmxAmount = ZERO;
  const affiliateAccounts: string[] = [];
  const affiliateAmounts: BigNumber[] = [];
  const discountAccounts: string[] = [];
  const discountAmounts: BigNumber[] = [];
  const esGmxAccounts: string[] = [];
  const esGmxAmounts: BigNumber[] = [];

  for (const item of affiliatesData) {
    const { account, rebateUsd, esGmxRewards } = item;
    const rebateUsdBn = bigNumberify(rebateUsd);
    const esGmxRewardsBn = esGmxRewards ? bigNumberify(esGmxRewards) : ZERO;

    allAffiliateUsd = allAffiliateUsd.add(rebateUsdBn);

    if (account === ethers.constants.AddressZero) {
      continue;
    }

    if (rebateUsdBn.gt(0)) {
      const amount = rebateUsdBn.div(wntPrice);
      affiliateAccounts.push(account);
      affiliateAmounts.push(amount);
      totalAffiliateAmount = totalAffiliateAmount.add(amount);
      totalAffiliateUsd = totalAffiliateUsd.add(rebateUsdBn);
    }

    if (esGmxRewardsBn.gt(0)) {
      esGmxAccounts.push(account);
      esGmxAmounts.push(esGmxRewardsBn);
      totalEsGmxAmount = totalEsGmxAmount.add(esGmxRewardsBn);
    }
  }

  for (const item of discountsData) {
    const { account, discountUsd } = item;
    const discountUsdBn = bigNumberify(discountUsd);

    allDiscountUsd = allDiscountUsd.add(discountUsdBn);
    if (account === ethers.constants.AddressZero) {
      continue;
    }

    if (discountUsdBn.gt(0)) {
      const amount = discountUsdBn.div(wntPrice);
      discountAccounts.push(account);
      discountAmounts.push(amount);
      totalDiscountAmount = totalDiscountAmount.add(amount);
      totalDiscountUsd = totalDiscountUsd.add(discountUsdBn);
    }
  }

  const totalNativeAmount = totalAffiliateAmount.add(totalDiscountAmount);

  const batchSize = 150;

  const balance = await wnt.balanceOf(feeDistributorVault);
  if (balance.lt(totalNativeAmount)) {
    throw new Error(
      `Insufficient balance, required: ${totalNativeAmount.toString()}, available: ${balance.toString()}`
    );
  }

  if (!shouldSendTxn) {
    return calls;
  }

  if (affiliateAccounts.length === 0) {
    logger.log(
      "affiliateAccounts length = 0, no affiliate referral rewards sent"
    );
  } else {
    await processBatch(
      logger,
      affiliateAccounts,
      affiliateAmounts,
      batchSize,
      async (currentBatch: [string, BigNumber][]) => {
        const params = currentBatch.map(([account, amount]) => ({ account, amount }));

        const callData = feeDistributor.interface.encodeFunctionData(
          "depositReferralRewards",
          [wnt.address, distributionId, params]
        );
        calls.push({ to: feeDistributor.address, data: callData });
      }
    );
  }

  if (discountAccounts.length === 0) {
    logger.log(
      "discountAccounts length = 0, no discount referral rewards sent"
    );
  } else {
    await processBatch(
      logger,
      discountAccounts,
      discountAmounts,
      batchSize,
      async (currentBatch: [string, BigNumber][]) => {
        const params = currentBatch.map(([account, amount]) => ({ account, amount }));

        const callData = feeDistributor.interface.encodeFunctionData(
          "depositReferralRewards",
          [wnt.address, distributionId, params]
        );
        calls.push({ to: feeDistributor.address, data: callData });
      }
    );
  }

  if (esGmxAccounts.length === 0) {
    logger.log("esGmxAccounts length = 0, no esGMX referral rewards sent");
  } else {
    await processBatch(
      logger,
      esGmxAccounts,
      esGmxAmounts,
      batchSize,
      async (currentBatch: [string, BigNumber][]) => {
        const params = currentBatch.map(([account, amount]) => ({ account, amount }));

        calls.push({
          to: feeDistributor.address,
          data: feeDistributor.interface.encodeFunctionData(
            "depositReferralRewards",
            [esGmx.address, distributionId, params]
          ),
        });
      }
    );
  }

  return calls;
}
