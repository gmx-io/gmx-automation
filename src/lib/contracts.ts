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
  GlvReader,
  Multicall3,
  OrderHandler,
  Reader,
  WNT,
  MintableToken,
  FeeDistributor,
  FeeDistributorVault,
  ContributorHandler,
  GMX_Adapter,
} from "../typechain";

import { abi as ConfigAbi } from "../abi/Config.json";
import { abi as ConfigSyncerAbi } from "../abi/ConfigSyncer.json";
import { abi as DataStoreAbi } from "../abi/DataStore.json";
import { abi as EventEmitterAbi } from "../abi/EventEmitter.json";
import { abi as FeeHandlerAbi } from "../abi/FeeHandler.json";
import { abi as GlvReaderAbi } from "../abi/GlvReader.json";
import { abi as Multicall3Abi } from "../abi/Multicall3.json";
import { abi as OrderHandlerAbi } from "../abi/OrderHandler.json";
import { abi as ReaderAbi } from "../abi/Reader.json";
import { abi as WntAbi } from "../abi/WNT.json";
import { abi as EsGmxAbi } from "../abi/EsGmx.json";
import { abi as FeeDistributorAbi } from "../abi/FeeDistributor.json";
import { abi as FeeDistributorVaultAbi } from "../abi/FeeDistributorVault.json";
import { abi as ContributorHandlerAbi } from "../abi/ContributorHandler.json";
import { abi as GMX_AdapterAbi } from "../abi/GMX_Adapter.json";

function getContract<T = Contract>({
  chainId,
  name,
  abi,
  provider,
}: {
  chainId: SupportedChainId;
  name: string;
  abi: ContractInterface;
  provider: StaticJsonRpcProvider | undefined;
}): T {
  const address = getAddress(chainId, name);
  return new ethers.Contract(address, abi, provider) as unknown as T;
}

export type Contracts = ReturnType<typeof getContracts>;

export function getContracts(
  chainId: number,
  provider?: StaticJsonRpcProvider
) {
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
  const wnt = getContract<WNT>({
    chainId,
    name: "wnt",
    provider,
    abi: WntAbi,
  });
  const esGmx = getContract<MintableToken>({
    chainId,
    name: "esGmx",
    provider,
    abi: EsGmxAbi,
  });
  const feeDistributor = getContract<FeeDistributor>({
    chainId,
    name: "feeDistributor",
    provider,
    abi: FeeDistributorAbi,
  });
  const feeDistributorVault = getContract<FeeDistributorVault>({
    chainId,
    name: "feeDistributorVault",
    provider,
    abi: FeeDistributorVaultAbi,
  });
  const contributorHandler = getContract<ContributorHandler>({
    chainId,
    name: "contributorHandler",
    provider,
    abi: ContributorHandlerAbi,
  });
  const gmx_Adapter = getContract<GMX_Adapter>({
    chainId,
    name: "gmx_Adapter",
    provider,
    abi: GMX_AdapterAbi,
  });
  const contracts = {
    dataStore,
    config,
    configSyncer,
    eventEmitter,
    feeHandler,
    glvReader,
    multicall3,
    orderHandler,
    reader,
    wnt,
    esGmx,
    feeDistributor,
    feeDistributorVault,
    contributorHandler,
    gmx_Adapter,
  };

  return contracts;
}
