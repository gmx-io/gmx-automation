import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  loadDistributionData,
  cleanupFiles,
  initExecute,
} from "./utils/callFunctionUtils";
import { WNT_PRICE_KEY } from "../src/lib/keys/keys";
import { DISTRIBUTION_ID } from "../src/domain/fee/feeDistributionUtils";
import { referralRewardsCalls } from "../src/domain/fee/feeDistributionService";
import { getLogger, Logger } from "../src/lib/logger";
import { getContracts } from "../src/lib/contracts";

const logger: Logger = getLogger(false);

async function executeTransaction(
  signer: SignerWithAddress,
  callData: { to: string; data: string },
  index: number,
  logger: Logger
) {
  const tx = await signer.sendTransaction({
    to: callData.to,
    data: callData.data,
  });

  logger.log(`Transaction hash: ${tx.hash}`);
  logger.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  logger.log(`Transaction confirmed in block ${receipt.blockNumber}`);
}

async function main() {
  logger.log("Running script to call FeeDistributor.depositReferralRewards()");

  try {
    const { signer, chainId, provider } = await initExecute();
    const { dataStore, feeDistributorVault, feeDistributor, wnt, esGmx } =
      getContracts(chainId, provider);

    const [wntPrice, distributionData] = await Promise.all([
      dataStore.getUint(WNT_PRICE_KEY),
      loadDistributionData(),
    ]);
    logger.log("Loaded saved data");

    if (chainId !== distributionData.chainId) {
      throw new Error(
        `Chosen network (${chainId}) does not match network in save data (${distributionData.chainId})`
      );
    }

    logger.log("Generating referral rewards calls...");
    const calls = await referralRewardsCalls({
      logger: logger,
      feeDistributorVault: feeDistributorVault.address,
      wntPrice: wntPrice,
      feeDistributor: feeDistributor,
      wnt: wnt,
      esGmx: esGmx,
      data: distributionData,
      distributionId: DISTRIBUTION_ID,
      useBatchSize: true,
    });

    const startIndex = Number(process.env.RESUME_INDEX) || 0;

    logger.log(`Total calls to execute: ${calls.length - startIndex}`);

    for (let i = startIndex; i < calls.length; i++) {
      try {
        const call = calls[i];
        if (!call) {
          throw new Error(`Call at index ${i} is undefined`);
        }
        logger.log(
          `Executing transaction ${i + 1} of ${calls.length} at index ${i}...`
        );
        await executeTransaction(signer, call, i, logger);
      } catch (error) {
        logger.log(
          `Error executing transaction ${i + 1} of ${
            calls.length
          } at index ${i}`,
          error
        );
        logger.log(
          "\n Check block explorer to confirm the transaction failed and in .env include the RESUME_INDEX environment variable with the index at which to resume, then rerun the script"
        );
        process.exit(1);
      }
    }

    logger.log("\nAll transactions completed successfully!");
    logger.log(`Total transactions executed: ${calls.length - startIndex}`);
    logger.log("\nCleaning up temporary files...");
    await cleanupFiles();
    logger.log("Fee distribution process completed!");
  } catch (error) {
    logger.log("Error during deposit referral rewards:", error);
    process.exit(1);
  }
}

main().catch(logger.error);
