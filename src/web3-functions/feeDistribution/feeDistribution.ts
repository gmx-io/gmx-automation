import { ethers } from "ethers";
import {
  Web3FunctionEventContext,
  Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk/*";
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

    const rawFromTimestamp = await storage.get("fromTimestamp");

    const fromTimestamp =
      rawFromTimestamp && rawFromTimestamp.trim() !== ""
        ? Number(rawFromTimestamp) || userArgs.initialFromTimestamp
        : userArgs.initialFromTimestamp;

    [wntPrice, gmxPrice] = await Promise.all([
      contracts.dataStore.getUint(userArgs.wntPriceKey),
      contracts.dataStore.getUint(userArgs.gmxPriceKey),
    ]);

    await storage.set("wntPrice", wntPrice.toString());
    await storage.set("gmxPrice", gmxPrice.toString());

    const [latestBlock, esGmxRewardsLimit, feesV1Usd, feesV2Usd] =
      await Promise.all([
        provider.getBlock("latest"),
        contracts.dataStore.getUint(userArgs.esGmxRewardsKey),
        processPeriodV1("prev", gelatoArgs.chainId),
        processPeriodV2("prev", gelatoArgs.chainId).then((v) =>
          v.mul(10).div(100)
        ),
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
      feeDistributorVault: contracts.feeDistributorVault.address,
      shouldSendTxn: userArgs.shouldSendTxn,
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

    if (!userArgs.shouldSendTxn) {
      logger.log("Referral rewards not sent"); // potentially simulate calls here for testing
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
