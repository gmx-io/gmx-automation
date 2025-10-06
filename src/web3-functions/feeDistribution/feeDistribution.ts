import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { SupportedChainId } from "../../config/chains";
import { Context } from "../../lib/gelato";
import { ZERO } from "../../lib/number";
import {
  getFeeDistributionDataReceivedEventData,
  getFeeDistributorEventDescription,
  DISTRIBUTION_DATA,
  RELATIVE_PERIOD_NAME,
  FEE_DISTRIBUTION_INITIATED,
  FEE_DISTRIBUTION_DATA_RECEIVED,
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED,
  FEE_DISTRIBUTION_COMPLETED,
} from "../../domain/fee/feeDistributionUtils";
import {
  OutputData,
  processPeriodV1,
  processPeriodV2,
  getDistributionData,
  referralRewardsCalls,
} from "../../domain/fee/feeDistributionService";
import { getPeriod } from "../../utils/date";

export const feeDistribution = async (
  context: Context<Web3FunctionEventContext>
): Promise<Web3FunctionResult> => {
  const { logger, log, userArgs, storage, contracts, gelatoArgs } = context;
  const eventDescription = getFeeDistributorEventDescription(
    log,
    contracts.eventEmitter
  );
  const chainId = gelatoArgs.chainId as SupportedChainId;
  const { wntPriceKey, gmxPriceKey, maxRewardsEsGmxAmountKey, distributionId } =
    userArgs;

  if (typeof wntPriceKey !== "string") {
    throw new Error("wntPriceKey must be a string");
  }

  if (typeof gmxPriceKey !== "string") {
    throw new Error("gmxPriceKey must be a string");
  }

  if (typeof maxRewardsEsGmxAmountKey !== "string") {
    throw new Error("maxRewardsEsGmxAmountKey must be a string");
  }

  if (typeof distributionId !== "string") {
    throw new Error("distributionId must be a string");
  }

  if (
    (eventDescription === FEE_DISTRIBUTION_DATA_RECEIVED &&
      getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
        .totalGmxBridgedOut > ZERO) ||
    eventDescription === FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED
  ) {
    const [gmxPrice, maxEsGmxRewards, feesV1Usd, feesV2Usd] = await Promise.all(
      [
        contracts.dataStore.getUint(gmxPriceKey),
        contracts.dataStore.getUint(maxRewardsEsGmxAmountKey),
        processPeriodV1(RELATIVE_PERIOD_NAME, chainId),
        processPeriodV2(RELATIVE_PERIOD_NAME, chainId),
      ]
    );

    const output = await getDistributionData(
      logger,
      chainId,
      RELATIVE_PERIOD_NAME,
      gmxPrice,
      maxEsGmxRewards
    );

    await storage.set(DISTRIBUTION_DATA, JSON.stringify(output, null, 4));

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
  } else if (eventDescription === FEE_DISTRIBUTION_COMPLETED) {
    const [wntPrice, dataStr] = await Promise.all([
      contracts.dataStore.getUint(wntPriceKey),
      storage.get(DISTRIBUTION_DATA),
    ]);

    if (!dataStr) {
      throw new Error("Distribution data is missing in storage");
    }

    const data = JSON.parse(dataStr) as OutputData;

    const [fromTimestamp, toTimestamp] = getPeriod(RELATIVE_PERIOD_NAME);

    if (
      fromTimestamp !== data.fromTimestamp ||
      toTimestamp !== data.toTimestamp
    ) {
      throw new Error(
        `Period in distribution data (${data.fromTimestamp} to ${data.toTimestamp}) does not match previous week (${fromTimestamp} to ${toTimestamp})`
      );
    }

    const referralRewardsRawCallData = await referralRewardsCalls({
      logger: logger,
      feeDistributorVault: contracts.feeDistributorVault.address,
      wntPrice: wntPrice,
      feeDistributor: contracts.feeDistributor,
      wnt: contracts.wnt,
      esGmx: contracts.esGmx,
      data: data,
      distributionId: distributionId,
      useBatchSize: false,
    });

    const referralRewardsCallData = referralRewardsRawCallData.map((c) => ({
      to: c.to,
      data: c.data,
    }));

    return {
      canExec: true,
      callData: referralRewardsCallData,
    };
  } else if (eventDescription === FEE_DISTRIBUTION_INITIATED) {
    return {
      canExec: false,
      message:
        "FeeDistributionInitiated seen; fee distribution initiated for the week",
    };
  } else if (eventDescription === FEE_DISTRIBUTION_DATA_RECEIVED) {
    return {
      canExec: false,
      message:
        "FeeDistributionDataReceived seen; waiting to receive bridged GMX",
    };
  } else {
    return {
      canExec: false,
      message: `No relevant event found: ${eventDescription}`,
    };
  }
};
