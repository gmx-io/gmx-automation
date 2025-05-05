import {
  ARBITRUM,
  AVALANCHE,
  AVALANCHE_FUJI,
  LOCALHOST,
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
    "feeDistributor",
    "feeDistributorVault",
  ].includes(contractName);
};

const addresses: Record<
  SupportedChainId,
  Record<SupportedContractName, string>
> = {
  [LOCALHOST]: {
    dataStore: "0x4A679253410272dd5232B3Ff7cF5dbB88f295319",
    config: "0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00",
    configSyncer: "0x96F3Ce39Ad2BfDCf92C0F6E2C2CAbF83874660Fc",
    eventEmitter: "0x8f86403A4DE0BB5791fa46B8e795C547942fE4Cf",
    feeHandler: "0xf090f16dEc8b6D24082Edd25B1C8D26f2bC86128",
    glvHandler: "0x87006e75a5B6bE9D1bbF61AC8Cd84f05D9140589",
    glvReader: "0x8fC8CFB7f7362E44E472c690A6e025B80E406458",
    multicall3: "0x809d550fca64d94Bd9F66E60752A544199cfAC3D",
    orderHandler: "0x821f3361D454cc98b7555221A06Be563a7E2E0A6",
    reader: "0x5e6CB7E728E1C320855587E1D9C6F7972ebdD6D5",
    wnt: "0x7a2088a1bFc9d81c55368AE168C2C02570cB814F",
    esGmx: "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
    feeDistributor: "0xe70f935c32da4db13e7876795f1e175465e6458e",
    feeDistributorVault: "0xaC9fCBA56E42d5960f813B9D0387F3D3bC003338",
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
    feeDistributor: "0x0000000000000000000000000000000000000000",
    feeDistributorVault: "0x0000000000000000000000000000000000000000",
  },
  [AVALANCHE_FUJI]: {
    config: "0x1518ab348e7187d9CDCAB6Ba4ea3e37E187eB8D7",
    configSyncer: "0xc1Af3b20EDA9fA05702ef9fc6AC16D03f302E7E5",
    dataStore: "0xEA1BFb4Ea9A412dCCd63454AbC127431eBB0F0d4",
    eventEmitter: "0xc67D98AC5803aFD776958622CeEE332A0B2CabB9",
    feeHandler: "0x0000000000000000000000000000000000000000",
    glvHandler: "0x0ce2C878c02ddA303DE5ba5776FcDF055bC52237",
    glvReader: "0x0D4231689B92E6978E5A0439B156bFBe35592C6d",
    multicall3: "0x966D1F5c54a714C6443205F0Ec49eEF81F10fdfD",
    orderHandler: "0x109fd3cd6e6b3711f70EA9d7C4fD8055CEc175e5",
    reader: "0xA71e8b30c9414852F065e4cE12bbCC05cF50937A",
    wnt: "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
    esGmx: "0x0000000000000000000000000000000000000000",
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
