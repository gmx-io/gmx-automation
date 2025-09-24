import { BigNumber } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { SupportedChainId } from "../../config/chains";
import { Context } from "../../lib/gelato";
import { bigNumberify } from "../../lib/number";
import {
  getFeeDistributionDataReceivedEventData,
  getFeeDistributorEventName,
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
  const eventName = getFeeDistributorEventName(log, contracts.eventEmitter);
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
    (eventName === "FeeDistributionDataReceived" &&
      getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
        .isBridgingCompleted) ||
    eventName === "FeeDistributionBridgedGmxReceived"
  ) {
    await Promise.all([
      storage.delete("distributionData"),
      storage.delete("wntPrice"),
      storage.delete("gmxPrice"),
    ]);

    [wntPrice, gmxPrice] = await Promise.all([
      contracts.dataStore.getUint(wntPriceKey),
      contracts.dataStore.getUint(gmxPriceKey),
    ]);

    await Promise.all([
      storage.set("wntPrice", wntPrice.toString()),
      storage.set("gmxPrice", gmxPrice.toString()),
    ]);

    const relativePeriodName = "prev";
    const [maxEsGmxRewards, feesV1Usd, feesV2Usd] = await Promise.all([
      contracts.dataStore.getUint(maxRewardsEsGmxAmountKey),
      processPeriodV1(relativePeriodName, chainId),
      processPeriodV2(relativePeriodName, chainId),
    ]);

    const output = await getDistributionData(
      logger,
      chainId,
      relativePeriodName,
      gmxPrice,
      maxEsGmxRewards
    );

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
    const [wntPriceStr, gmxPriceStr, dataStr] = await Promise.all([
      storage.get("wntPrice"),
      storage.get("gmxPrice"),
      storage.get("distributionData"),
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
    });

    const referralRewardsCallData = referralRewardsRawCallData.map((c) => ({
      to: c.to,
      data: c.data,
    }));

    return {
      canExec: true,
      callData: referralRewardsCallData,
    };
  } else if (
    eventName === "FeeDistributionDataReceived" &&
    getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
      .isBridgingCompleted!
  ) {
    return {
      canExec: false,
      message:
        "FeeDistributionDataReceived seen; bridging not completed — waiting",
    };
  } else {
    return {
      canExec: false,
      message: `No relevant event found: ${eventName}`,
    };
  }
};
