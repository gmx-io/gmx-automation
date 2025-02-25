import { ethers } from "ethers";
import {
  ARBITRUM,
  AVALANCHE,
  AVALANCHE_FUJI,
  HARDHAT,
  isSupportedChainId,
  SupportedChainId,
} from "./chains";

export type SupportedContractName =
  | "dataStore"
  | "config"
  | "configSyncer"
  | "eventEmitter"
  | "feeHandler"
  | "glvHandler"
  | "glvReader"
  | "multicall3"
  | "orderHandler"
  | "reader"
  | "wnt"
  | "esGmx"
  | "vault"
  | "uniswapGmxWethPool"
  | "feeDistributor"
  | "feeDistributorVault";

export const isSupportedContractName = (
  contractName: string
): contractName is SupportedContractName => {
  return [
    "dataStore",
    "config",
    "configSyncer",
    "eventEmitter",
    "feeHandler",
    "glvHandler",
    "glvReader",
    "multicall3",
    "orderHandler",
    "reader",
    "wnt",
    "esGmx",
    "vault",
    "uniswapGmxWethPool",
    "feeDistributor",
    "feeDistributorVault",
  ].includes(contractName);
};

const addresses: Record<
  SupportedChainId,
  Record<SupportedContractName, string>
> = {
  [HARDHAT]: {
    dataStore: "0x0000000000000000000000000000000000000000",
    config: "0x0000000000000000000000000000000000000000",
    configSyncer: "0x0000000000000000000000000000000000000000",
    eventEmitter: "0x0000000000000000000000000000000000000000",
    feeHandler: "0x0000000000000000000000000000000000000000",
    glvHandler: "0x0000000000000000000000000000000000000000",
    glvReader: "0x0000000000000000000000000000000000000000",
    multicall3: "0x0000000000000000000000000000000000000000",
    orderHandler: "0x0000000000000000000000000000000000000000",
    reader: "0x0000000000000000000000000000000000000000",
    wnt: "0x0000000000000000000000000000000000000000",
    esGmx: "0x0000000000000000000000000000000000000000",
    vault: "0x0000000000000000000000000000000000000000",
    uniswapGmxWethPool: "0x0000000000000000000000000000000000000000",
    feeDistributor: "0x0000000000000000000000000000000000000000",
    feeDistributorVault: "0x0000000000000000000000000000000000000000",
  },
  [ARBITRUM]: {
    config: "0xD1781719eDbED8940534511ac671027989e724b9",
    configSyncer: "0xb6d37DFCdA9c237ca98215f9154Dc414EFe0aC1b",
    dataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
    eventEmitter: "0xC8ee91A54287DB53897056e12D9819156D3822Fb",
    feeHandler: "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3",
    glvHandler: "0x3f6dF0c3A7221BA1375E87e7097885a601B41Afc",
    glvReader: "0x6a9505D0B44cFA863d9281EA5B0b34cB36243b45",
    multicall3: "0xe79118d6D92a4b23369ba356C90b9A7ABf1CB961",
    orderHandler: "0xe68CAAACdf6439628DFD2fe624847602991A31eB",
    reader: "0x0537C767cDAC0726c76Bb89e92904fe28fd02fE1",
    wnt: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    esGmx: "0xf42ae1d54fd613c9bb14810b0588faaa09a426ca",
    vault: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
    uniswapGmxWethPool: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",
    feeDistributor: "0x0000000000000000000000000000000000000000",
    feeDistributorVault: "0x0000000000000000000000000000000000000000",
  },
  [AVALANCHE]: {
    config: "0xEb376626D44c638Fd0C41170a40fd23a1A0622b7",
    configSyncer: "0x7dCec0356434d03a6071C96347516df3eF4471bB",
    dataStore: "0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6",
    eventEmitter: "0xDb17B211c34240B014ab6d61d4A31FA0C0e20c26",
    feeHandler: "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490",
    glvHandler: "0x48486CaF8851ed0085432789D28A8820bEcbfd45",
    glvReader: "0xae9596a1C438675AcC75f69d32E21Ac9c8fF99bD",
    multicall3: "0x50474CAe810B316c294111807F94F9f48527e7F8",
    orderHandler: "0x088711C3d2FA992188125e009E65c726bA090AD6",
    reader: "0x618fCEe30D9A26e8533C3B244CAd2D6486AFf655",
    wnt: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    esGmx: "0xff1489227bbaac61a9209a08929e4c2a526ddd17",
    vault: "0x9ab2De34A33fB459b538c43f251eB825645e8595",
    uniswapGmxWethPool: "0x0000000000000000000000000000000000000000",
    feeDistributor: "0x0000000000000000000000000000000000000000",
    feeDistributorVault: "0x0000000000000000000000000000000000000000",
  },
  [AVALANCHE_FUJI]: {
    config: "0x1518ab348e7187d9CDCAB6Ba4ea3e37E187eB8D7",
    configSyncer: "0xc1Af3b20EDA9fA05702ef9fc6AC16D03f302E7E5",
    dataStore: "0xEA1BFb4Ea9A412dCCd63454AbC127431eBB0F0d4",
    eventEmitter: "0xc67D98AC5803aFD776958622CeEE332A0B2CabB9",
    multicall3: "0x966D1F5c54a714C6443205F0Ec49eEF81F10fdfD",
    orderHandler: "0x109fd3cd6e6b3711f70EA9d7C4fD8055CEc175e5",
    reader: "0xA71e8b30c9414852F065e4cE12bbCC05cF50937A",
    glvReader: "0x0D4231689B92E6978E5A0439B156bFBe35592C6d",
    glvHandler: "0x0ce2C878c02ddA303DE5ba5776FcDF055bC52237",
    wnt: "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
    feeHandler: "0x0000000000000000000000000000000000000000",
    esGmx: "0x0000000000000000000000000000000000000000",
    vault: "0x0000000000000000000000000000000000000000",
    uniswapGmxWethPool: "0x0000000000000000000000000000000000000000",
    feeDistributor: "0x0000000000000000000000000000000000000000",
    feeDistributorVault: "0x0000000000000000000000000000000000000000",
  },
};

export function getAddress(chainId: number, key: string): string {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Can not get address for unsupported chain id ${chainId}`);
  }

  if (!isSupportedContractName(key)) {
    throw new Error(`Can not get address for unsupported contract name ${key}`);
  }

  if (!addresses[chainId]) {
    throw new Error(`Can not get address for unsupported chain id ${chainId}`);
  }
  if (!addresses[chainId][key]) {
    throw new Error(`Can not get address for ${key} chain id ${chainId}`);
  }
  return addresses[chainId][key];
}
