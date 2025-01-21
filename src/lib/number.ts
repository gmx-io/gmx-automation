import { BigNumber, BigNumberish, ethers } from "ethers";

export type ReplaceBigNumberWithString<T> = {
  [K in keyof T]: T[K] extends BigNumber
    ? string
    : T[K] extends object
    ? ReplaceBigNumberWithString<T[K]>
    : T[K];
};

export const MAX_UINT8 = "255"; // 2^8 - 1
export const MAX_UINT32 = "4294967295"; // 2^32 - 1
export const MAX_UINT64 = "18446744073709551615"; // 2^64 - 1

export const FLOAT = expandDecimals(1, 30);
export const FLOAT_BIG_INT = 1000000000000000000000000000000n;
export const FLOAT_PRECISION = 30;

export const BASIS_POINTS = 10000;

export function bigNumberify(n: BigNumberish) {
  if (n === undefined) {
    throw new Error("bigNumberify: n is undefined");
  }
  if (typeof n === "number" && n >= Number.MAX_SAFE_INTEGER) {
    n = BigInt(n);
  }
  return ethers.BigNumber.from(n);
}

export function expandDecimals(n: BigNumberish, decimals: number) {
  if (
    (typeof n === "number" && !Number.isInteger(n)) ||
    (typeof n === "string" && n.includes("."))
  ) {
    let [base, scale] = n.toString().split(".");
    if (scale) {
      scale = scale.substring(0, decimals);
      return bigNumberify(base + scale.padEnd(decimals, "0"));
    }
  }
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}

export function getMedian(values: number[]) {
  values = [...values].sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  if (values.length % 2) {
    return values[middle];
  }
  return (values[middle - 1] + values[middle]) / 2;
}

export function getMin(...values: BigNumber[]) {
  return values.reduce((min, value) => (value.lt(min) ? value : min));
}

export function getMax(...values: BigNumber[]) {
  return values.reduce((max, value) => (value.gt(max) ? value : max));
}

export function getAvg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function roundUpMagnitudeDivision(a: BigNumber, b: BigNumber) {
  if (a.lt(0)) {
    return a.sub(b).add(1).div(b);
  }

  return a.add(b).sub(1n).div(b);
}

export function bigNumberToNumber(value: BigNumber, decimals: number): number {
  return Number(value.toBigInt()) / Math.pow(10, decimals);
}

export function numberToBigNumber(value: number | string, decimals: number) {
  const [mantissa, exponentStr] = value.toString().split(/e\+?/);
  let ret = ethers.utils.parseUnits(mantissa, FLOAT_PRECISION);

  let exponent = decimals;

  if (exponentStr) {
    exponent += Number(exponentStr);
  }
  if (exponent > 0) {
    ret = ret.mul(bigNumberify(10).pow(exponent));
  } else {
    ret = ret.div(bigNumberify(10).pow(-exponent));
  }

  return ret.div(FLOAT);
}
