import fs from "fs";
import path from "path";

const storagePath = path.resolve(
  __dirname,
  "../web3-functions/feeDistribution/storage.json"
);

const fileStore: Record<string, string> = fs.existsSync(storagePath)
  ? JSON.parse(fs.readFileSync(storagePath, "utf8"))
  : {};

export function createSecrets(seed: Record<string, string> = {}) {
  return {
    async get(key: string): Promise<string | undefined> {
      if (!key) {
        return undefined;
      }
      return seed[key];
    },
  };
}

export function createStorage() {
  return {
    async get(key: string) {
      return fileStore[key];
    },
    async set(key: string, val: string) {
      fileStore[key] = val;
    },
    async delete(key: string) {
      delete fileStore[key];
    },
    async getKeys() {
      return Object.keys(fileStore);
    },
    async getSize() {
      return Object.keys(fileStore).length;
    },
  };
}

export async function flushStorage() {
  fs.writeFileSync(storagePath, JSON.stringify(fileStore, null, 2));
}
