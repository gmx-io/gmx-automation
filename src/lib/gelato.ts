type Secrets = {
  get: (key: string) => Promise<string | undefined>;
};

export async function getSecrets(
  secrets: Secrets,
  keys: string[]
): Promise<string[]> {
  const values = await Promise.all(keys.map((key) => secrets.get(key)));
  for (const [i, value] of values.entries()) {
    if (value === undefined) {
      throw new Error(`Secret ${keys[i]} is undefined`);
    }
  }
  return values as string[];
}

export type Storage = {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
};
