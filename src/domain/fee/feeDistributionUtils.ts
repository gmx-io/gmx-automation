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
  wntForGlp: BigNumber;
  wntForReferralRewards: BigNumber;
  esGmxForReferralRewards: BigNumber;
};

type FeeDistributionEsGmxReferralRewardsSentEventData = {
  esGmxAmount: BigNumber;
  updatedBonusRewards: BigNumber;
};

type FeeDistributionWntReferralRewardsSentEventData = {
  wntAmount: BigNumber;
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
    wntForGlp: eventData.getUint("wntForGlp"),
    wntForReferralRewards: eventData.getUint("wntForReferralRewards"),
    esGmxForReferralRewards: eventData.getUint("esGmxForReferralRewards"),
  };
};

export const getFeeDistributionEsGmxReferralRewardsSentEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionEsGmxReferralRewardsSentEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    esGmxAmount: eventData.getUint("esGmxAmount"),
    updatedBonusRewards: eventData.getUint("updatedBonusRewards"),
  };
};

export const getFeeDistributionWntReferralRewardsSentEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionWntReferralRewardsSentEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    wntAmount: eventData.getUint("wntAmount"),
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

export const ES_GMX_REFERRAL_REWARDS_SENT_HASH = ethers.utils.id(
  "EsGmxReferralRewardsSent"
);

export const WNT_REFERRAL_REWARDS_SENT_HASH = ethers.utils.id(
  "WntReferralRewardsSent"
);
