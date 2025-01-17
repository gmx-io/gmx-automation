import * as EventEmitter from "../abis/EventEmitter.json";

export type KeyValueEventData = {
  getUint: (key: string, defaultValue?: any) => bigint;
  getInt: (key: string, defaultValue?: any) => bigint;
  getBool: (key: string, defaultValue?: any) => boolean;
  getAddress: (key: string, defaultValue?: any) => string;
  getBytes32: (key: string, defaultValue?: any) => string;
  getBytes: (key: string, defaultValue?: any) => string;
  getString: (key: string, defaultValue?: any) => string;
  getUintArray: (key: string, defaultValue?: any) => bigint[];
  getIntArray: (key: string, defaultValue?: any) => bigint[];
  getBoolArray: (key: string, defaultValue?: any) => boolean[];
  getAddressArray: (key: string, defaultValue?: any) => string[];
  getBytes32Array: (key: string, defaultValue?: any) => string[];
  getBytesArray: (key: string, defaultValue?: any) => string[];
  getStringArray: (key: string, defaultValue?: any) => string[];
};

export function parseLog(log: Log) {
  const decodedArgs = decodeEventEmitterLog(log);
  const kv = getKeyValueEventData(decodedArgs);

  return { decodedArgs, kv };
}

export function getKeyValueEventData(
  args: ReturnType<typeof decodeEventEmitterLog>
): KeyValueEventData {
  // for some reason ethers doesn't create keys for eventName, eventData, etc.
  // eventData is the last field of event
  const eventData = args.eventData || args[(args as any).length - 1];

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

type EventLogArg =
  | ReturnType<typeof EventEmitter.events.EventLog.decode>
  | ReturnType<typeof EventEmitter.events.EventLog1.decode>
  | ReturnType<typeof EventEmitter.events.EventLog2.decode>;

const _cache: WeakMap<Log, EventLogArg> = new WeakMap();

// export const decodeStats = {
//   count: 0,
//   cumTime: 0n, // nanoseconds
// };

export function decodeEventEmitterLog(log: Log): EventLogArg {
  let decoded = _cache.get(log);

  if (!decoded) {
    decoded = decodeEventLog({
      abi: EventEmitterAbi,
      topics: log.topics,
      data: log.data,
    } as any).args as EventLogArg;

    // decodeStats.cumTime += process.hrtime.bigint() - start;
    // decodeStats.count++;
    _cache.set(log, decoded as any);
  }

  return decoded;
}
