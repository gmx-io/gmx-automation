import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { exampleFunction } from "./exampleFunction";
import { wrapContext } from "../../lib/gelato";

Web3Function.onRun((gelatoContext: Web3FunctionEventContext) => {
  return exampleFunction(wrapContext(true, gelatoContext));
});
