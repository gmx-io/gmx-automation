import fs from "fs";
import path from "path";

export const storagePath = path.resolve(
  __dirname,
  "../web3-functions/feeDistribution/storage.json"
);

export const fileStore: Record<string, string> = fs.existsSync(storagePath)
  ? JSON.parse(fs.readFileSync(storagePath, "utf8"))
  : {};

export async function flushStorage() {
  fs.writeFileSync(storagePath, JSON.stringify(fileStore, null, 2));
}
