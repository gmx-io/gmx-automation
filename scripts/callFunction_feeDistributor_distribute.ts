import {
  ensureDataDir,
  saveDistributionData,
  initExecute,
} from "./utils/callFunctionUtils";
import {
  GMX_PRICE_KEY,
  MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY,
} from "../src/lib/keys/keys";
import { RELATIVE_PERIOD_NAME } from "../src/domain/fee/feeDistributionUtils";
import {
  processPeriodV1,
  processPeriodV2,
  getDistributionData,
} from "../src/domain/fee/feeDistributionService";
import { getLogger, Logger } from "../src/lib/logger";
import { getContracts } from "../src/lib/contracts";
import {
  formatAmount,
  USD_DECIMALS,
  GMX_DECIMALS,
  PRICE_DECIMALS,
} from "../src/lib/number";

const logger: Logger = getLogger(false);

async function main() {
  logger.log(
    "Running script to retrieve fee and referral reward data and call FeeDistributor.distribute()"
  );

  try {
    await ensureDataDir();

    if (process.env.RESUME_INDEX) {
      throw new Error(
        "Remove RESUME_INDEX environment variable from .env and try again"
      );
    }
    const sendTransactionStr = process.env.SEND_TRANSACTION;
    if (!sendTransactionStr) {
      throw new Error("SEND_TRANSACTION environment variable not provided");
    }
    if (sendTransactionStr !== "true" && sendTransactionStr !== "false") {
      throw new Error(
        'SEND_TRANSACTION environment must equal "true" or "false"'
      );
    }
    const sendTransaction = sendTransactionStr === "true";

    const { signer, chainId, provider } = await initExecute();
    const { dataStore, feeDistributor } = getContracts(chainId, provider);

    logger.log("Fetching prices from DataStore...");
    const [gmxPrice, maxEsGmxRewards] = await Promise.all([
      dataStore.getUint(GMX_PRICE_KEY),
      dataStore.getUint(MAX_REFERRAL_REWARDS_ESGMX_AMOUNT_KEY),
    ]);

    logger.log(`GMX Price: ${formatAmount(gmxPrice, PRICE_DECIMALS, 2)}`);
    logger.log(
      `Max esGMX Rewards: ${formatAmount(maxEsGmxRewards, GMX_DECIMALS, 2)}`
    );

    logger.log("Processing V1 and V2 fees...");
    const [feesV1Usd, feesV2Usd] = await Promise.all([
      processPeriodV1(RELATIVE_PERIOD_NAME, chainId),
      processPeriodV2(RELATIVE_PERIOD_NAME, chainId),
    ]);

    logger.log(`V1 Fees: ${formatAmount(feesV1Usd, USD_DECIMALS, 2)}`);
    logger.log(`V2 Fees: ${formatAmount(feesV2Usd, USD_DECIMALS, 2)}`);

    logger.log("Calculating distribution data...");
    const distributionData = await getDistributionData(
      logger,
      chainId,
      RELATIVE_PERIOD_NAME,
      gmxPrice,
      maxEsGmxRewards
    );

    await saveDistributionData(distributionData);

    if (sendTransaction) {
      logger.log("Executing distribute transaction...");

      const tx = await feeDistributor
        .connect(signer)
        .distribute(
          distributionData.totalRebateUsd,
          distributionData.totalEsGmxRewards,
          feesV1Usd,
          feesV2Usd
        );

      logger.log(`Transaction hash: ${tx.hash}`);
      logger.log("Waiting for transaction confirmation...");

      const receipt = await tx.wait();
      logger.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      logger.log("Distribution completed successfully!");
    } else {
      logger.log("SEND_TRANSACTION is false - skipping transaction execution");
      logger.log("Distribution data has been saved for later processing");
    }

    logger.log("\nSummary");
    logger.log(
      `Total Referral Volume: ${distributionData.totalReferralVolume}`
    );
    logger.log(
      `Total Rebate USD: ${formatAmount(
        distributionData.totalRebateUsd,
        USD_DECIMALS,
        2
      )}`
    );
    logger.log(
      `Total esGMX Rewards: ${formatAmount(
        distributionData.totalEsGmxRewards,
        GMX_DECIMALS,
        2
      )}`
    );
    logger.log(`Affiliates Count: ${distributionData.affiliates.length}`);
    logger.log(`Referrals Count: ${distributionData.referrals.length}`);
  } catch (error) {
    logger.log("Error during distribution:", error);
    process.exit(1);
  }
}

main().catch(logger.error);
