import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import { OutputData } from "../../src/domain/fee/feeDistributionService";
import { isSupportedChainId } from "../../src/config/chains";
import { getLogger, Logger } from "../../src/lib/logger";
import { getRpcProviderUrl } from "../../src/config/providers";

const logger: Logger = getLogger(false);

const DATA_DIR = path.join(process.cwd(), "fee-distribution-data");
const DISTRIBUTION_DATA_FILE = path.join(DATA_DIR, "distribution-data.json");

export async function ensureDataDir(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function saveDistributionData(
  distributionData: OutputData
): Promise<void> {
  fs.writeFileSync(
    DISTRIBUTION_DATA_FILE,
    JSON.stringify(distributionData, null, 2)
  );
  logger.log(`Data saved to ${DISTRIBUTION_DATA_FILE}`);
}

export async function loadDistributionData(): Promise<OutputData> {
  if (!fs.existsSync(DISTRIBUTION_DATA_FILE)) {
    throw new Error(
      `Save data file not found: ${DISTRIBUTION_DATA_FILE}. Please run callFunction_feeDistributor_distribute.ts first.`
    );
  }

  const distributionData = JSON.parse(
    fs.readFileSync(DISTRIBUTION_DATA_FILE, "utf-8")
  );

  return distributionData;
}

export async function cleanupFiles(): Promise<void> {
  if (fs.existsSync(DISTRIBUTION_DATA_FILE)) {
    fs.unlinkSync(DISTRIBUTION_DATA_FILE);
    logger.log(`Deleted: ${DISTRIBUTION_DATA_FILE}`);
  }

  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR);
    if (files.length === 0) {
      fs.rmdirSync(DATA_DIR);
      logger.log(`Removed empty directory: ${DATA_DIR}`);
    }
  }
}

export async function initExecute() {
  if (!process.env.HARDHAT_NETWORK) {
    throw new Error(
      "No network chosen - use the --network flag when running the script to specify network"
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer found");
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Chosen network not supported (${chainId})`);
  }

  const provider = new ethers.providers.JsonRpcProvider(
    getRpcProviderUrl(chainId),
    chainId
  );

  return { signer, chainId, provider };
}
