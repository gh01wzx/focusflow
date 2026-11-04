import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: project,
  entryPoints: { 'today/app': resolve(project, 'public/today/app.tsx') },
  outdir: resolve(project, 'dist/public'), bundle: true, format: 'esm', platform: 'browser', target: 'es2023',
  jsx: 'automatic', tsconfig: resolve(project, 'tsconfig.browser.json'), minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
