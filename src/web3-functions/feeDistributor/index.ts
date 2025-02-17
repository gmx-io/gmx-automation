import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { feeDistributor } from "./feeDistributor";
import { wrapContext } from "../../lib/gelato";

Web3Function.onRun((gelatoContext: Web3FunctionEventContext) => {
  return feeDistributor(wrapContext(gelatoContext));
});
