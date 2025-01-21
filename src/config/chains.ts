export const ARBITRUM = 42161;
export const AVALANCHE = 43114;
export const AVALANCHE_FUJI = 43113;
export const HARDHAT = 31337;

export type SupportedChainId =
  | typeof ARBITRUM
  | typeof AVALANCHE
  | typeof AVALANCHE_FUJI
  | typeof HARDHAT;

export const isSupportedChainId = (
  chainId: number
): chainId is SupportedChainId => {
  return (
    chainId === ARBITRUM ||
    chainId === AVALANCHE ||
    chainId === AVALANCHE_FUJI ||
    chainId === HARDHAT
  );
};
