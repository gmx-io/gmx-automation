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
  private responses: { [key: string]: any } = {};
  async send(method: string, params: Array<any>): Promise<any> {
    if (this.responses[method]) {
      return this.responses[method];
    }

    if (method === "eth_chainId") {
      return HARDHAT;
    }

    throw new Error(`Method ${method} not mocked`);
  }

  estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    console.log("estimateGas:", { transaction });
    return Promise.resolve(BigNumber.from(0));
  }

  getBlockNumber(): Promise<number> {
    console.log("getBlockNumber called");
    return Promise.resolve(0);
  }

  getBlock(blockHashOrBlockNumber: BlockTag): Promise<Block> {
    console.log("getBlock:", { blockHashOrBlockNumber });
    return Promise.resolve({} as Block);
  }

  getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt> {
    console.log("getTransactionReceipt:", { transactionHash });
    return Promise.resolve({} as TransactionReceipt);
  }

  getTransaction(transactionHash: string): Promise<TransactionResponse> {
    console.log("getTransaction:", { transactionHash });
    return Promise.resolve({} as TransactionResponse);
  }

  getTransactionCount(address: string, blockTag?: BlockTag): Promise<number> {
    console.log("getTransactionCount:", { address, blockTag });
    return Promise.resolve(0);
  }

  getBalance(address: string, blockTag?: BlockTag): Promise<BigNumber> {
    console.log("getBalance:", { address, blockTag });
    return Promise.resolve(BigNumber.from(0));
  }

  mockResponse(method: string, response: any) {
    this.responses[method] = response;
  }
}
