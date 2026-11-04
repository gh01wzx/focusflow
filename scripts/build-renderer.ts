import { build } from 'esbuild';

await build({
  entryPoints: { app: 'public/app.ts', 'today/app': 'public/today/app.tsx' },
  outdir: 'dist/public', bundle: true, format: 'esm', platform: 'browser', target: 'es2023',
  jsx: 'automatic', tsconfig: 'tsconfig.browser.json', minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
