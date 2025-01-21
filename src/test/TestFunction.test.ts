import {
  Web3FunctionResultV2,
  Web3FunctionUserArgs,
} from "@gelatonetwork/web3-functions-sdk";
import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { before } from "mocha";
import DataStore from "../abi/DataStore.json";

const { deployments, w3f } = hre;

describe("OraclePriceUpdate Tests", function () {
  this.timeout(0);

  let owner: SignerWithAddress;

  let testW3f: Web3FunctionHardhat;
  let userArgs: Web3FunctionUserArgs;

  before(async function () {
    await deployments.fixture();

    [owner] = await hre.ethers.getSigners();

    testW3f = w3f.get("test-function");

    userArgs = {
      uintKey:
        "0x1234567890123456789012345678901234567890123456789012345678901234",
    };
  });

  it("canExec == true", async () => {
    let { result } = await testW3f.run("onRun", { userArgs });
    result = result as Web3FunctionResultV2;

    expect(result.canExec).to.equal(true);

    if (!result.canExec) throw new Error("canExec == false");

    const callData = result.callData[0];

    await owner.sendTransaction({
      to: callData.to,
      data: callData.data,
    });

    const dataStoreInterface = new hre.ethers.utils.Interface(DataStore.abi);
    const decodedData = dataStoreInterface.decodeFunctionData(
      "setUint",
      callData.data
    );
    expect(decodedData.key).to.equal(userArgs.uintKey);
    expect(decodedData.value.toString()).to.equal("381065622573740");
  });
});
