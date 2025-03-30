import { BigNumber } from "ethers";
import { parseLogToEventData, parseLogToEventNameHash } from "../../lib/events";
import { Log } from "hardhat-deploy/dist/types";
import { EventEmitter } from "../../typechain";
import { ethers } from "ethers";

export type FeeDistributionDataReceivedEventData = {
  numberOfChainsReceivedData: BigNumber;
  feeAmountGmxCurrentChain: BigNumber;
  receivedData: string;
  isBridgingCompleted: boolean;
};

export type FeeDistributionCompletedEventData = {
  feesV1Usd: BigNumber;
  feesV2Usd: BigNumber;
  feeAmountGmxCurrentChain: BigNumber;
  totalFeeAmountGmx: BigNumber;
  totalGmxBridgedOut: BigNumber;
  wntForKeepers: BigNumber;
  wntForChainlink: BigNumber;
  wntForTreasury: BigNumber;
  wntForGlp: BigNumber;
  wntForReferralRewards: BigNumber;
  esGmxForReferralRewards: BigNumber;
};

export const getFeeDistributionDataReceivedEventData = (
  log: Log,
  eventEmitter: EventEmitter
): FeeDistributionDataReceivedEventData => {
  const event = eventEmitter.interface.parseLog(log);
  const eventData = parseLogToEventData(event);

  return {
    numberOfChainsReceivedData: eventData.getUint("numberOfChainsReceivedData"),
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
    feeAmountGmxCurrentChain: eventData.getUint("feeAmountGmxCurrentChain"),
    totalFeeAmountGmx: eventData.getUint("totalFeeAmountGmx"),
    totalGmxBridgedOut: eventData.getUint("totalGmxBridgedOut"),
    wntForKeepers: eventData.getUint("wntForKeepers"),
    wntForChainlink: eventData.getUint("wntForChainlink"),
    wntForTreasury: eventData.getUint("wntForTreasury"),
    wntForGlp: eventData.getUint("wntForGlp"),
    wntForReferralRewards: eventData.getUint("wntForReferralRewards"),
    esGmxForReferralRewards: eventData.getUint("esGmxForReferralRewards"),
  };
};

export const getFeeDistributorEventName = (
  log: Log,
  eventEmitter: EventEmitter
): string => {
  const event = eventEmitter.interface.parseLog(log);
  const eventNameHash = parseLogToEventNameHash(event);

  return ethers.utils.toUtf8String(eventNameHash);
};
