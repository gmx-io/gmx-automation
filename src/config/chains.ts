export const ARBITRUM_SEPOLIA = 421614;
export const ARBITRUM = 42161;
export const AVALANCHE = 43114;
export const HARDHAT = 31337;

export type SupportedChainId =
  | typeof ARBITRUM_SEPOLIA
  | typeof ARBITRUM
  | typeof AVALANCHE
  | typeof HARDHAT;

export const isSupportedChainId = (
  chainId: number
): chainId is SupportedChainId => {
  return (
    chainId === ARBITRUM_SEPOLIA ||
    chainId === ARBITRUM ||
    chainId === AVALANCHE ||
    chainId === HARDHAT
  );
};
