import "@nomiclabs/hardhat-ethers";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import {
  AutomateSDK,
  TriggerType,
  Web3Function,
} from "@gelatonetwork/automate-sdk";
import hre from "hardhat";
import { getAddress } from "../src/config/addresses";

const { ethers, w3f } = hre;

const main = async () => {
  const exampleFunctionW3f = w3f.get("example-function");

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const automate = new AutomateSDK(chainId, deployer);
  const web3Function = new Web3Function(chainId, deployer);

  // Deploy Web3Function on IPFS
  console.log("Deploying Web3Function on IPFS...");
  const cid = await exampleFunctionW3f.deploy();
  console.log(`Web3Function IPFS CID: ${cid}`);

  // Create task using automate sdk
  console.log("Creating automate task...");

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

  await tx.wait();
  console.log(`Task created, taskId: ${taskId} (tx hash: ${tx.hash})`);
  console.log(
    `> https://app.gelato.network/functions/task/${taskId}:${chainId}`
  );

  // Set task specific secrets
  const secrets = exampleFunctionW3f.getSecrets();
  if (Object.keys(secrets).length > 0) {
    await web3Function.secrets.set(secrets, taskId);
    console.log(`Secrets set`);
  }
};

main()
  .then(() => {
    process.exit();
  })
  .catch((err) => {
    if (err.response) {
      console.error("Error Response:", err.response.body);
    } else {
      console.error("Error:", err.message);
    }
    process.exit(1);
  });
