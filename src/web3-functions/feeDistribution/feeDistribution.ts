import { BigNumber } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { SupportedChainId } from "../../config/chains";
import { Context } from "../../lib/gelato";
import { ZERO, bigNumberify } from "../../lib/number";
import {
  getFeeDistributionDataReceivedEventData,
  getFeeDistributorEventDescription,
  DISTRIBUTION_DATA,
  WNT_PRICE,
  GMX_PRICE,
  RELATIVE_PERIOD_NAME,
  FEE_DISTRIBUTION_INITIATED,
  FEE_DISTRIBUTION_DATA_RECEIVED,
  FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED,
  FEE_DISTRIBUTION_COMPLETED,
} from "../../domain/fee/feeDistributionUtils";
import {
  processPeriodV1,
  processPeriodV2,
  getDistributionData,
  referralRewardsCalls,
} from "../../domain/fee/feeDistributionService";

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
    throw new Error("wntPriceKey must be a hex string");
  }

  if (typeof gmxPriceKey !== "string") {
    throw new Error("gmxPriceKey must be a hex string");
  }

  if (typeof maxRewardsEsGmxAmountKey !== "string") {
    throw new Error("maxRewardsEsGmxAmountKey must be a hex string");
  }

  if (typeof distributionId !== "string") {
    throw new Error("distributionId must be a string");
  }

  let wntPrice: BigNumber, gmxPrice: BigNumber;

  if (
    (eventDescription === FEE_DISTRIBUTION_DATA_RECEIVED &&
      getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
        .totalGmxBridgedOut > ZERO) ||
    eventDescription === FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED
  ) {
    await Promise.all([
      storage.delete(DISTRIBUTION_DATA),
      storage.delete(WNT_PRICE),
      storage.delete(GMX_PRICE),
    ]);

    [wntPrice, gmxPrice] = await Promise.all([
      contracts.dataStore.getUint(wntPriceKey),
      contracts.dataStore.getUint(gmxPriceKey),
    ]);

    await Promise.all([
      storage.set(WNT_PRICE, wntPrice.toString()),
      storage.set(GMX_PRICE, gmxPrice.toString()),
    ]);

    const [maxEsGmxRewards, feesV1Usd, feesV2Usd] = await Promise.all([
      contracts.dataStore.getUint(maxRewardsEsGmxAmountKey),
      processPeriodV1(RELATIVE_PERIOD_NAME, chainId),
      processPeriodV2(RELATIVE_PERIOD_NAME, chainId),
    ]);

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
    const [wntPriceStr, gmxPriceStr, dataStr] = await Promise.all([
      storage.get(WNT_PRICE),
      storage.get(GMX_PRICE),
      storage.get(DISTRIBUTION_DATA),
    ]);

    if (!wntPriceStr) {
      throw new Error("wntPrice is missing in storage");
    }
    if (!gmxPriceStr) {
      throw new Error("gmxPrice is missing in storage");
    }
    if (!dataStr) {
      throw new Error("dataStr is missing in storage");
    }

    wntPrice = bigNumberify(wntPriceStr);
    gmxPrice = bigNumberify(gmxPriceStr);

    const referralRewardsRawCallData = await referralRewardsCalls({
      logger: logger,
      feeDistributorVault: contracts.feeDistributorVault.address,
      wntPrice: wntPrice,
      feeDistributor: contracts.feeDistributor,
      wnt: contracts.wnt,
      esGmx: contracts.esGmx,
      dataStr: dataStr,
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
