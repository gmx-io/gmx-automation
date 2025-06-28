import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { TriggerType } from "@gelatonetwork/automate-sdk";
import hre from "hardhat";
import { initCreateTask, logTaskCreation, run } from "./utils/createTaskUtils";
import { getAddress } from "../src/config/addresses";

const { w3f } = hre;

const main = async () => {
  const { logger, chainId, automate, web3Function } = await initCreateTask();

  const exampleFunctionW3f = w3f.get("example-function");

  // Deploy Web3Function on IPFS
  logger.log("Deploying Web3Function on IPFS...");
  const cid = await exampleFunctionW3f.deploy();
  logger.log(`Web3Function IPFS CID: ${cid}`);

  // Create task using automate sdk
  logger.log("Creating automate task...");

  const { taskId, tx } = await automate.createBatchExecTask({
    name: "Example Function 1",
    web3FunctionHash: cid,
    web3FunctionArgs: {
      uintKey:
        "0xb090a2b4b1460d089313317d9c8dde87144d93e949a91730da157796e1a45cee",
    },
    trigger: {
      type: TriggerType.EVENT,
      filter: {
        address: getAddress(chainId, "eventEmitter"),
        topics: [
          [
            "0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160",
          ],
          [
            "0x41c7b30afab659d385f1996d0addfa6e647694862e72378d0b43773f556cbeb2",
          ],
        ],
      },
      blockConfirmations: 0,
    },
  });

  await logTaskCreation(tx, taskId, chainId);

  // Set task specific secrets
  const secrets = exampleFunctionW3f.getSecrets();
  if (Object.keys(secrets).length > 0) {
    await web3Function.secrets.set(secrets, taskId);
    logger.log(`Secrets set`);
  }
};

run(main);
