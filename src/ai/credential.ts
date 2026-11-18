import type { ApiProvider } from '../shared/ai.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CredentialCrypto } from '../github/vault.ts';

export function createProviderCredential(directory: string, crypto: CredentialCrypto, name: ApiProvider | 'deepseek-api' = 'deepseek') {
  const path = join(directory, name + '.bin');
  return {
    async read() {
      try {
        const data = await readFile(path);
        if (!await crypto.available()) throw new Error('Protected storage is unavailable.');
        return await crypto.decrypt(data);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      }
    },
    async write(value: string) {
      if (!await crypto.available()) throw new Error('Protected storage is unavailable.');
      const encrypted = await crypto.encrypt(value);
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, randomUUID() + '.tmp');
      try {
        await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    },
  };
}
