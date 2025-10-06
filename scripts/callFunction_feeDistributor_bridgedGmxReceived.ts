import { initExecute } from "./utils/callFunctionUtils";
import { getLogger, Logger } from "../src/lib/logger";
import { getContracts } from "../src/lib/contracts";

const logger: Logger = getLogger(false);

async function main() {
  logger.log("Running script to call FeeDistributor.bridgedGmxReceived()");

  try {
    const { signer, chainId, provider } = await initExecute();
    const { feeDistributor } = getContracts(chainId, provider);

    logger.log("Executing bridgedGmxReceived transaction...");

    const tx = await feeDistributor.connect(signer).bridgedGmxReceived();

    logger.log(`Transaction hash: ${tx.hash}`);
    logger.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait();
    logger.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    logger.log("bridgedGmxReceived completed successfully!");
  } catch (error) {
    logger.log("Error during bridgedGmxReceived:", error);
    process.exit(1);
  }
}

main().catch(logger.error);
