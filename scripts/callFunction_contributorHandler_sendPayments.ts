import { initExecute } from "./utils/callFunctionUtils";
import { getLogger, Logger } from "../src/lib/logger";
import { getContracts } from "../src/lib/contracts";

const logger: Logger = getLogger(false);

async function main() {
  logger.log("Running script to call ContributorHandler.sendPayments()");

  try {
    const { signer, chainId, provider } = await initExecute();
    const { contributorHandler } = getContracts(chainId, provider);

    logger.log("Executing sendPayments transaction...");

    const tx = await contributorHandler.connect(signer).sendPayments();

    logger.log(`Transaction hash: ${tx.hash}`);
    logger.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait();
    logger.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    logger.log("sendPayments completed successfully!");
  } catch (error) {
    logger.log("Error during sendPayments:", error);
    process.exit(1);
  }
}

main().catch(logger.error);
