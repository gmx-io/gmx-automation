import { BigNumber } from "ethers";
import { LogDescription } from "ethers/lib/utils";

export type KeyValueEventData = {
  getUint: (key: string, defaultValue?: any) => BigNumber;
  getInt: (key: string, defaultValue?: any) => BigNumber;
  getBool: (key: string, defaultValue?: any) => boolean;
  getAddress: (key: string, defaultValue?: any) => string;
  getBytes32: (key: string, defaultValue?: any) => string;
  getBytes: (key: string, defaultValue?: any) => string;
  getString: (key: string, defaultValue?: any) => string;
  getUintArray: (key: string, defaultValue?: any) => BigNumber[];
  getIntArray: (key: string, defaultValue?: any) => BigNumber[];
  getBoolArray: (key: string, defaultValue?: any) => boolean[];
  getAddressArray: (key: string, defaultValue?: any) => string[];
  getBytes32Array: (key: string, defaultValue?: any) => string[];
  getBytesArray: (key: string, defaultValue?: any) => string[];
  getStringArray: (key: string, defaultValue?: any) => string[];
};

export function parseLogToEventData(log: LogDescription) {
  return getKeyValueEventData(log);
}

export function parseLogToEventNameHash(log: LogDescription) {
  return getKeyValueEventNameHash(log);
}

export function getKeyValueEventData(log: LogDescription): KeyValueEventData {
  // for some reason ethers doesn't create keys for eventName, eventData, etc.
  // eventData is the last field of event
  const eventData = log.args[(log.args as any).length - 1];

  const ret: any = {};
  for (const typeKey of [
    "addressItems",
    "uintItems",
    "intItems",
    "boolItems",
    "bytes32Items",
    "bytesItems",
    "stringItems",
  ] as const) {
    ret[typeKey] = {};
    for (const listKey of ["items", "arrayItems"] as const) {
      ret[typeKey][listKey] = {};

      for (const item of eventData[typeKey][listKey]) {
        ret[typeKey][listKey][item.key] = item.value;
      }
    }
  }

  function getter(typeKey: string, listKey: string) {
    return (key: string, defaultValue?: any) => {
      const value = ret[typeKey][listKey][key];
      // skip this check in tests to make mocking easier
      if (
        value === undefined &&
        defaultValue === undefined &&
        process.env.NODE_ENV !== "test"
      ) {
        throw new Error(`Key "${key}" not found in ${typeKey}.${listKey}`);
      }
      if (value !== undefined) {
        return value;
      }
      return defaultValue;
    };
  }

  return {
    getUint: getter("uintItems", "items"),
    getInt: getter("intItems", "items"),
    getBool: getter("boolItems", "items"),
    getAddress: getter("addressItems", "items"),
    getBytes32: getter("bytes32Items", "items"),
    getBytes: getter("bytesItems", "items"),
    getString: getter("stringItems", "items"),
    getUintArray: getter("uintItems", "arrayItems"),
    getIntArray: getter("intItems", "arrayItems"),
    getBoolArray: getter("boolItems", "arrayItems"),
    getAddressArray: getter("addressItems", "arrayItems"),
    getBytes32Array: getter("bytes32Items", "arrayItems"),
    getBytesArray: getter("bytesItems", "arrayItems"),
    getStringArray: getter("stringItems", "arrayItems"),
  };
}

export function getKeyValueEventNameHash(log: LogDescription): string {
  // for some reason ethers doesn't create keys for eventName, eventData, etc.
  // eventNameHash is the second field of event
  const eventNameHash: string = (log.args as any)[1];

  return eventNameHash;
}
