import { BlockTag } from "@ethersproject/abstract-provider";
import {
  JsonRpcProvider,
  TransactionRequest,
  Block,
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";
import { BigNumber } from "ethers";
import { Deferrable } from "ethers/lib/utils";
import { HARDHAT } from "../config/chains";

export class MockedJsonRpcProvider extends JsonRpcProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getBlockNumber(): Promise<number> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getBlock(blockHashOrBlockNumber: BlockTag): Promise<Block> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getTransaction(transactionHash: string): Promise<TransactionResponse> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getTransactionCount(address: string, blockTag?: BlockTag): Promise<number> {
    throw new Error("JsonRpcRpcProvider has been called");
  }

  getBalance(address: string, blockTag?: BlockTag): Promise<BigNumber> {
    throw new Error("JsonRpcRpcProvider has been called");
  }
}
