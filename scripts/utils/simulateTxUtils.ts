import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { Log } from "@ethersproject/providers";
import { Web3FunctionEventContext } from "@gelatonetwork/web3-functions-sdk/*";
import { ZERO } from "../../src/lib/number";
import { isSupportedChainId, SupportedChainId } from "../../src/config/chains";
import { getRpcProviderUrl } from "../../src/config/providers";
import { getContracts } from "../../src/lib/contracts";
import { Context, wrapContext } from "../../src/lib/gelato";
import { EVENT_LOG_TOPIC, EVENT_LOG1_TOPIC } from "../../src/lib/events";
import {
  FEE_DISTRIBUTION_EVENT_HASH,
  TOTAL_ES_GMX_REWARDS_INCREASED_HASH,
} from "../../src/domain/fee/feeDistributionUtils";

export type RevertOverride = {
  disableRevert: boolean;
};

const storagePath = path.resolve(
  __dirname,
  "../../src/web3-functions/feeDistribution/storage.json"
);

const fileStore: Record<string, string> = fs.existsSync(storagePath)
  ? JSON.parse(fs.readFileSync(storagePath, "utf8"))
  : {};

export const FEE_DISTRIBUTION_EVENT_TOPICS = [
  EVENT_LOG_TOPIC,
  FEE_DISTRIBUTION_EVENT_HASH,
];

export const TOTAL_ES_GMX_REWARDS_INCREASED_TOPICS = [
  EVENT_LOG1_TOPIC,
  TOTAL_ES_GMX_REWARDS_INCREASED_HASH,
];

export function createSecrets(seed: Record<string, string> = {}) {
  return {
    async get(key: string): Promise<string | undefined> {
      if (!key) {
        return undefined;
      }
      return seed[key];
    },
  };
}

export function createStorage() {
  return {
    async get(key: string) {
      return fileStore[key];
    },
    async set(key: string, val: string) {
      fileStore[key] = val;
    },
    async delete(key: string) {
      delete fileStore[key];
    },
    async getKeys() {
      return Object.keys(fileStore);
    },
    async getSize() {
      return Object.keys(fileStore).length;
    },
  };
}

export async function flushStorage() {
  fs.writeFileSync(storagePath, JSON.stringify(fileStore, null, 2));
}

export async function initSimulateTx() {
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  const { eventEmitter } = getContracts(chainId, provider);

  return { chainId, provider, eventEmitter };
}

export function createEventContext(
  log: Log,
  userArgs: any,
  chainId: SupportedChainId
): Context<Web3FunctionEventContext> {
  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  return wrapContext(false, {
    log,
    userArgs,
    gelatoArgs: {
      chainId,
      gasPrice: ZERO,
    },
    multiChainProvider: {
      default: () => provider,
    } as any,
    secrets: createSecrets(),
    storage: createStorage(),
  });
}
