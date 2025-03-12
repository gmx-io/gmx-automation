import {
  ARBITRUM,
  AVALANCHE,
  isSupportedChainId,
  SupportedChainId,
} from "./chains";

interface SubgraphFragments {
  [endpoint: string]: string;
}

const subgraphFragments: Record<SupportedChainId, SubgraphFragments> = {
  [ARBITRUM]: {
    referrals: "gmx-arbitrum-referrals",
    stats: "gmx-synthetics-arbitrum-stats",
  },
  [AVALANCHE]: {
    referrals: "gmx-avalanche-referrals",
    stats: "gmx-synthetics-avalanche-stats",
  },
};

export function getSubgraphUrl(
  chainId: SupportedChainId,
  endpoint: string
): string {
  if (!isSupportedChainId(chainId)) {
    throw new Error(`Cannot get subgraph for unsupported chain id ${chainId}`);
  }
  const fragments = subgraphFragments[chainId];
  if (!fragments) {
    throw new Error(`No subgraph fragments defined for chain id ${chainId}`);
  }
  const fragment = fragments[endpoint];
  if (!fragment) {
    throw new Error(
      `No subgraph fragment found for endpoint '${endpoint}' on chain ${chainId}`
    );
  }
  return `https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/${fragment}/api`;
}
