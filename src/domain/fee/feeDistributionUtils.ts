import { ethers, BigNumber } from "ethers";
import {
  parseLogToEventNameHash,
  parseLogToEventData,
  parseLogToTopic2,
} from "../../lib/events";
import { bigNumberify } from "../../lib/number";
import { Log } from "hardhat-deploy/dist/types";
import { EventEmitter } from "../../typechain";

type FeeDistributionDataReceivedEventData = {
  eventDescription: string;
  distributionState: BigNumber;
  feeAmountGmxCurrentChain: BigNumber;
  totalGmxBridgedOut: BigNumber;
  receivedData: string;
};

type FeeDistributionCompletedEventData = {
  eventDescription: string;
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

export enum DistributionState {
  None,
  Initiated,
  ReadDataReceived,
  BridgingCompleted,
}

export const getFeeDistributionDataReceivedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionDataReceivedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    eventDescription: eventData.getString("eventDescription"),
    distributionState: eventData.getUint("distributionState"),
    feeAmountGmxCurrentChain: eventData.getUint("feeAmountGmxCurrentChain"),
    totalGmxBridgedOut: eventData.getUint("totalGmxBridgedOut"),
    receivedData: eventData.getBytes("receivedData"),
  };
};

export const getFeeDistributionCompletedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionCompletedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    eventDescription: eventData.getString("eventDescription"),
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
    account: ethers.utils.defaultAbiCoder.decode(
      ["address"],
      parseLogToTopic2(event)
    )[0],
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

export const getFeeDistributorEventDescription = (
  log: Log,
  eventEmitter: EventEmitter
): string => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return eventData.getString("eventDescription");
};

export const DISTRIBUTION_DATA = "distributionData";

export const RELATIVE_PERIOD_NAME = "prev";

export const FEE_DISTRIBUTION_INITIATED = "FeeDistributionInitiated";

export const FEE_DISTRIBUTION_DATA_RECEIVED = "FeeDistributionDataReceived";

export const FEE_DISTRIBUTION_BRIDGED_GMX_RECEIVED =
  "FeeDistributionBridgedGmxReceived";

export const FEE_DISTRIBUTION_COMPLETED = "FeeDistributionCompleted";

export const FEE_DISTRIBUTION_EVENT_HASH = ethers.utils.id(
  "FeeDistributionEvent"
);

export const TOTAL_ES_GMX_REWARDS_INCREASED_HASH = ethers.utils.id(
  "TotalEsGmxRewardsIncreased"
);

export const DISTRIBUTION_ID = bigNumberify(
  ethers.utils.id("FEE_DISTRIBUTION")
).toString();
