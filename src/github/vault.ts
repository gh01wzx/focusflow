import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitHubRepository } from '../shared/github.ts';
import { parseGitHubRepository } from '../shared/github.ts';

export interface StoredGitHub {
  clientId: string; token: string; account: string; expiresAt: number | null;
  repositories: Record<string, GitHubRepository>;
}
export interface GitHubVault {
  available(): Promise<boolean>;
  read(): Promise<StoredGitHub | null>;
  write(value: StoredGitHub): Promise<void>;
  clear(): Promise<void>;
}
export interface CredentialCrypto {
  available(): Promise<boolean>;
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
}
export function createGitHubVault(directory: string, crypto: CredentialCrypto): GitHubVault {
  const path = join(directory, 'connection.bin');
  return {
    available: () => crypto.available(),
    async read() {
      let data: Buffer;
      try { data = await readFile(path); }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
        throw new Error('GitHub credential storage could not be read.');
      }
      if (!await crypto.available()) throw new Error('OS-protected credential storage is unavailable.');
      const item: unknown = JSON.parse(await crypto.decrypt(data));
      if (!item || typeof item !== 'object') throw new Error('GitHub credential storage is invalid.');
      const value = item as Record<string, unknown>;
      if (typeof value.clientId !== 'string' || typeof value.token !== 'string' || typeof value.account !== 'string'
        || (value.expiresAt !== null && (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)))
        || !value.repositories || typeof value.repositories !== 'object' || Array.isArray(value.repositories)) {
        throw new Error('GitHub credential storage is invalid.');
      }
      const repositories: Record<string, GitHubRepository> = {};
      for (const [id, repo] of Object.entries(value.repositories)) {
        if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid project connection.');
        repositories[id] = parseGitHubRepository(repo);
      }
      return { clientId: value.clientId, token: value.token, account: value.account,
        expiresAt: value.expiresAt as number | null, repositories };
    },
    async write(value) {
      if (!await crypto.available()) throw new Error('OS-protected credential storage is unavailable.');
      await mkdir(directory, { recursive: true });
      const encrypted = await crypto.encrypt(JSON.stringify(value));
      const temporary = join(directory, 'connection-' + randomUUID() + '.tmp');
      try { await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
      finally { await rm(temporary, { force: true }); }
    },
    async clear() { await rm(path, { force: true }); },
  };
}
