import {
  ARBITRUM,
  ARBITRUM_SEPOLIA,
  AVALANCHE,
  HARDHAT,
  isSupportedChainId,
  SupportedChainId,
} from "./chains";

export type SupportedContractName = "dataStore";

export const isSupportedContractName = (
  contractName: string
): contractName is SupportedContractName => {
  return contractName === "dataStore";
};

const addresses: Record<
  SupportedChainId,
  Record<SupportedContractName, string>
> = {
  [HARDHAT]: {
    dataStore: "0x0000000000000000000000000000000000000000",
  },
  [ARBITRUM]: {
    dataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
  },
  [ARBITRUM_SEPOLIA]: {
    dataStore: "0xB558f529F97a405178E2437737F97Bb10eFadAfE",
  },
  [AVALANCHE]: {
    dataStore: "0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6",
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
