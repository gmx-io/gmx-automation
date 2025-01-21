import { ethers } from "ethers";

export function getRandomAddress(seed?: any) {
  return ethers.utils.getAddress(getRandomHash(seed).slice(0, 42));
}

export function getRandomHash(seed?: any) {
  if (seed === undefined) {
    return ethers.utils.keccak256(ethers.utils.randomBytes(32));
  }
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(seed.toString()));
}

export function getRandomWallet() {
  return ethers.Wallet.createRandom();
}
