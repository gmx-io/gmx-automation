export const ARBITRUM = 42161;
export const ARBITRUM_SEPOLIA = 421614;
export const BASE_SEPOLIA = 84532;
export const AVALANCHE = 43114;
export const AVALANCHE_FUJI = 43113;
export const LOCALHOST = 31337;

export type SupportedChainId =
  | typeof ARBITRUM
  | typeof ARBITRUM_SEPOLIA
  | typeof BASE_SEPOLIA
  | typeof AVALANCHE
  | typeof AVALANCHE_FUJI
  | typeof LOCALHOST;

export const isSupportedChainId = (
  chainId: number
): chainId is SupportedChainId => {
  return (
    chainId === ARBITRUM ||
    chainId === ARBITRUM_SEPOLIA ||
    chainId === BASE_SEPOLIA ||
    chainId === AVALANCHE ||
    chainId === AVALANCHE_FUJI ||
    chainId === LOCALHOST
  );
};
