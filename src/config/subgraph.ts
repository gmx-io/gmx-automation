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
    statsV1: "gmx-arbitrum-stats",
    statsV2: "synthetics-arbitrum-stats",
  },
  [AVALANCHE]: {
    referrals: "gmx-avalanche-referrals",
    statsV1: "gmx-avalanche-stats",
    statsV2: "synthetics-avalanche-stats",
  },
};

export function getSubgraphUrl(
  chainId: SupportedChainId,
  endpoint: string
): string {
  const effectiveChainId = chainId === 31337 ? ARBITRUM : chainId;

  if (!isSupportedChainId(effectiveChainId)) {
    throw new Error(
      `Cannot get subgraph for unsupported chain id ${effectiveChainId}`
    );
  }
  const fragments = subgraphFragments[effectiveChainId];
  if (!fragments) {
    throw new Error(
      `No subgraph fragments defined for chain id ${effectiveChainId}`
    );
  }
  const fragment = fragments[endpoint];
  if (!fragment) {
    throw new Error(
      `No subgraph fragment found for endpoint '${endpoint}' on chain ${effectiveChainId}`
    );
  }
  return `https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/${fragment}/api`;
}
