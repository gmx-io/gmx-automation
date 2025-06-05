import { BigNumber } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
import { SupportedChainId } from "../../config/chains";
import { Context } from "../../lib/gelato";
import { bigNumberify } from "../../lib/number";
import {
  processPeriodV1,
  processPeriodV2,
  getDistributionData,
  referralRewardsCalls,
  getFeeDistributionDataReceivedEventData,
  getFeeDistributorEventName,
} from "../../domain/fee/feeDistributionUtils";

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
  const chainId = gelatoArgs.chainId as SupportedChainId;
  const {
    initialFromTimestamp,
    wntPriceKey,
    gmxPriceKey,
    esGmxRewardsKey,
    shouldSendTxn,
  } = userArgs;

  if (typeof initialFromTimestamp !== "string") {
    throw new Error("initialFromTimestamp must be a string");
  }

  if (typeof wntPriceKey !== "string") {
    throw new Error("wntPriceKey must be a hex string");
  }

  if (typeof gmxPriceKey !== "string") {
    throw new Error("gmxPriceKey must be a hex string");
  }

  if (typeof esGmxRewardsKey !== "string") {
    throw new Error("esGmxRewardsKey must be a hex string");
  }

  if (typeof shouldSendTxn !== "boolean") {
    throw new Error("shouldSendTxn must be a hex string");
  }

  let wntPrice: BigNumber, gmxPrice: BigNumber;

  if (
    (eventName === "FeeDistributionDataReceived" &&
      getFeeDistributionDataReceivedEventData(log, contracts.eventEmitter)
        .isBridgingCompleted) ||
    eventName === "FeeDistributionBridgedGmxReceived"
  ) {
    await storage.delete("distributionData");
    await storage.delete("wntPrice");
    await storage.delete("gmxPrice");

    const rawFromTimestamp = await storage.get("fromTimestamp");

    const fromTimestamp =
      rawFromTimestamp && rawFromTimestamp.trim() !== ""
        ? Number(rawFromTimestamp) || Number(initialFromTimestamp)
        : Number(initialFromTimestamp);

    [wntPrice, gmxPrice] = await Promise.all([
      contracts.dataStore.getUint(wntPriceKey),
      contracts.dataStore.getUint(gmxPriceKey),
    ]);

    await storage.set("wntPrice", wntPrice.toString());
    await storage.set("gmxPrice", gmxPrice.toString());

    const [latestBlock, esGmxRewardsLimit, feesV1Usd, feesV2Usd] =
      await Promise.all([
        provider.getBlock("latest"),
        contracts.dataStore.getUint(esGmxRewardsKey),
        processPeriodV1("prev", chainId),
        processPeriodV2("prev", chainId).then((v) => v.mul(10).div(100)),
      ]);
    const toTimestamp = latestBlock.timestamp;

    const output = await getDistributionData(
      logger,
      chainId,
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
    if (!wntPriceStr) {
      throw new Error("wntPrice is missing in storage");
    }
    wntPrice = bigNumberify(wntPriceStr);
    const gmxPriceStr = await storage.get("gmxPrice");
    if (!gmxPriceStr) {
      throw new Error("gmxPrice is missing in storage");
    }
    gmxPrice = bigNumberify(gmxPriceStr);
    const dataStr = await storage.get("distributionData");
    if (!dataStr) {
      throw new Error("dataStr is missing in storage");
    }

    const referralRewardsRawCallData = await referralRewardsCalls({
      logger: logger,
      feeDistributorVault: contracts.feeDistributorVault.address,
      shouldSendTxn: shouldSendTxn,
      wntPrice: wntPrice,
      feeDistributor: contracts.feeDistributor,
      wnt: contracts.wnt,
      esGmx: contracts.esGmx,
      dataStr: dataStr,
    });

    const referralRewardsCallData = referralRewardsRawCallData.map((c) => ({
      to: c.to,
      data: c.data,
    }));

    if (shouldSendTxn) {
      return {
        canExec: true,
        callData: referralRewardsCallData,
      };
    }
    return {
      canExec: false,
      message: "Referral rewards not sent",
    };
  } else {
    return {
      canExec: false,
      message: `No relevant event found: ${eventName}`,
    };
  }
};
