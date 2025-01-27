import {
  ARBITRUM,
  AVALANCHE,
  AVALANCHE_FUJI,
  HARDHAT,
  isSupportedChainId,
  SupportedChainId,
} from "./chains";

export const RPC_PROVIDERS: Record<SupportedChainId, string[]> = {
  [ARBITRUM]: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://1rpc.io/arb",
    "https://arbitrum-one.public.blastapi.io",
    "https://rpc.ankr.com/arbitrum",
  ],
  [AVALANCHE]: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://1rpc.io/avax/c",
  ],
  [AVALANCHE_FUJI]: [
    "https://avalanche-fuji-c-chain.publicnode.com",
    "https://api.avax-test.network/ext/bc/C/rpc",
  ],
  [HARDHAT]: [],
};

export const getRpcProviderUrl = (chainId: number) => {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const providers = RPC_PROVIDERS[chainId];

  if (!providers.length) {
    throw new Error(`No RPC provider found for chainId: ${chainId}`);
  }

  const randomIndex = Math.floor(Math.random() * providers.length);
  const url = providers[randomIndex];

  return url;
};
