import { ethers, BigNumber } from "ethers";
import { parseLogToEventData, parseLogToEventNameHash } from "../../lib/events";
import { Log } from "hardhat-deploy/dist/types";
import { EventEmitter } from "../../typechain";

type FeeDistributionDataReceivedEventData = {
  feeAmountGmxCurrentChain: BigNumber;
  receivedData: string;
  isBridgingCompleted: boolean;
};

type FeeDistributionCompletedEventData = {
  feesV1Usd: BigNumber;
  feesV2Usd: BigNumber;
  wntForKeepers: BigNumber;
  wntForChainlink: BigNumber;
  wntForTreasury: BigNumber;
  wntForReferralRewards: BigNumber;
  esGmxForReferralRewards: BigNumber;
};

type FeeDistributionTotalEsGmxRewardsIncreasedEventData = {
  account: string;
  amount: BigNumber;
  totalEsGmxRewards: BigNumber;
};

export const getFeeDistributionDataReceivedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionDataReceivedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    feeAmountGmxCurrentChain: eventData.getUint("feeAmountGmxCurrentChain"),
    receivedData: eventData.getBytes("receivedData"),
    isBridgingCompleted: eventData.getBool("isBridgingCompleted"),
  };
};

export const getFeeDistributionCompletedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionCompletedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    feesV1Usd: eventData.getUint("feesV1Usd"),
    feesV2Usd: eventData.getUint("feesV2Usd"),
    wntForKeepers: eventData.getUint("wntForKeepers"),
    wntForChainlink: eventData.getUint("wntForChainlink"),
    wntForTreasury: eventData.getUint("wntForTreasury"),
    wntForReferralRewards: eventData.getUint("wntForReferralRewards"),
    esGmxForReferralRewards: eventData.getUint("esGmxForReferralRewards"),
  };
};

export const getFeeDistributionTotalEsGmxRewardsIncreasedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionTotalEsGmxRewardsIncreasedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    account: eventData.getAddress("account"),
    amount: eventData.getUint("amount"),
    totalEsGmxRewards: eventData.getUint("totalEsGmxRewards"),
  };
};

export const getFeeDistributorEventName = (
  log: Log,
  eventEmitter: EventEmitter
): string => {
  const event = eventEmitter.interface.parseLog(log);
  const eventNameHash = parseLogToEventNameHash(event);

  return eventNameHash;
};

export const FEE_DISTRIBUTION_DATA_RECEIVED_HASH = ethers.utils.id(
  "FeeDistributionDataReceived"
);

export const FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED_HASH = ethers.utils.id(
  "FeeDistributionBridgedGmxReceived"
);

export const FEE_DISTRIBUTION_COMPLETED_HASH = ethers.utils.id(
  "FeeDistributionCompleted"
);

export const TOTAL_ES_GMX_REWARDS_INCREASED_HASH = ethers.utils.id(
  "TotalEsGmxRewardsIncreased"
);

export const DISTRIBUTION_ID = "1";