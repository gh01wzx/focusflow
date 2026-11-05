import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export interface LaunchProfile {
  directory: string;
  sampleLabel: string | null;
}

export function selectProfile(options: {
  packaged: boolean;
  args: readonly string[];
  localDataDirectory: string;
  checkoutDirectory: string;
  schemaVersion: number;
  testProfile?: string | undefined;
}): LaunchProfile {
  const root = join(options.localDataDirectory, 'FocusFlow');
  const reviewIndex = options.args.indexOf('--review');
  if (reviewIndex !== -1) {
    if (options.testProfile) throw new Error('Clear FOCUSFLOW_TEST_PROFILE before opening review data.');
    const name = options.args[reviewIndex + 1] ?? 'local';
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(name)) {
      throw new Error('Use a review name of up to 48 letters, numbers or hyphens, such as pr-72.');
    }
    return {
      directory: join(root, 'reviews', name.toLowerCase(), `schema-${options.schemaVersion}`),
      sampleLabel: `Review ${name.toLowerCase()}`,
    };
  }
  if (options.testProfile) return { directory: resolve(options.testProfile), sampleLabel: null };
  if (options.packaged) return { directory: join(root, 'desktop'), sampleLabel: null };
  const checkout = resolve(options.checkoutDirectory);
  const identity = createHash('sha256').update(process.platform === 'win32' ? checkout.toLowerCase() : checkout)
    .digest('hex').slice(0, 16);
  return {
    directory: join(root, 'development', identity, `schema-${options.schemaVersion}`),
    sampleLabel: 'Development',
  };
}
