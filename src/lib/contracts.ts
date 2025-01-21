import { Contract, ContractInterface, ethers } from "ethers";

import { StaticJsonRpcProvider } from "@ethersproject/providers";

import { getAddress } from "../config/addresses";
import { isSupportedChainId, SupportedChainId } from "../config/chains";
import {
  Config,
  ConfigSyncer,
  DataStore,
  EventEmitter,
  FeeHandler,
  GlvHandler,
  GlvReader,
  Multicall3,
  OrderHandler,
  Reader,
} from "../typechain";

// Add imports for all ABIs
import { abi as ConfigAbi } from "../abi/Config.json";
import { abi as ConfigSyncerAbi } from "../abi/ConfigSyncer.json";
import { abi as DataStoreAbi } from "../abi/DataStore.json";
import { abi as EventEmitterAbi } from "../abi/EventEmitter.json";
import { abi as FeeHandlerAbi } from "../abi/FeeHandler.json";
import { abi as GlvHandlerAbi } from "../abi/GlvHandler.json";
import { abi as GlvReaderAbi } from "../abi/GlvReader.json";
import { abi as Multicall3Abi } from "../abi/Multicall3.json";
import { abi as OrderHandlerAbi } from "../abi/OrderHandler.json";
import { abi as ReaderAbi } from "../abi/Reader.json";

function getContract<T = Contract>({
  chainId,
  name,
  abi,
  provider,
}: {
  chainId: SupportedChainId;
  name: string;
  abi: ContractInterface;
  provider: StaticJsonRpcProvider;
}): T {
  const address = getAddress(chainId, name);
  return new ethers.Contract(address, abi, provider) as unknown as T;
}

export function getContracts(chainId: number, provider: StaticJsonRpcProvider) {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }

  const reader = getContract<Reader>({
    chainId,
    name: "reader",
    provider,
    abi: ReaderAbi,
  });
  const glvReader = getContract<GlvReader>({
    chainId,
    name: "glvReader",
    provider,
    abi: GlvReaderAbi,
  });

  const eventEmitter = getContract<EventEmitter>({
    chainId,
    name: "eventEmitter",
    provider,
    abi: EventEmitterAbi,
  });

  const dataStore = getContract<DataStore>({
    chainId,
    name: "dataStore",
    provider,
    abi: DataStoreAbi,
  });

  const glvHandler = getContract<GlvHandler>({
    chainId,
    name: "glvHandler",
    provider,
    abi: GlvHandlerAbi,
  });

  const orderHandler = getContract<OrderHandler>({
    chainId,
    name: "orderHandler",
    provider,
    abi: OrderHandlerAbi,
  });

  const feeHandler = getContract<FeeHandler>({
    chainId,
    name: "feeHandler",
    provider,
    abi: FeeHandlerAbi,
  });

  const multicall3 = getContract<Multicall3>({
    chainId,
    name: "multicall3",
    provider,
    abi: Multicall3Abi,
  });

  const configSyncer = getContract<ConfigSyncer>({
    chainId,
    name: "configSyncer",
    provider,
    abi: ConfigSyncerAbi,
  });
  const config = getContract<Config>({
    chainId,
    name: "config",
    provider,
    abi: ConfigAbi,
  });
  const contracts = {
    dataStore,
    config,
    configSyncer,
    eventEmitter,
    feeHandler,
    glvHandler,
    glvReader,
    multicall3,
    orderHandler,
    reader,
  };

  return contracts;
}
