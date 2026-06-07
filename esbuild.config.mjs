import * as esbuild from 'esbuild';
import { cp, mkdir, copyFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

const entries = [
  'src/background/service-worker.ts',
  'src/content/content-script.ts',
  'src/content/page-probe-runner.ts',
  'src/popup/popup.ts',
];

const buildOptions = {
  entryPoints: entries,
  outdir: 'dist',
  bundle: true,
  format: 'iife', // classic <script>-compatible; content scripts in MV3 are NOT ES modules
  target: 'es2022',
  platform: 'browser',
  sourcemap: 'inline',
  logLevel: 'info',
};

async function copyStatic() {
  await mkdir('dist/popup', { recursive: true });
  await mkdir('dist/icons', { recursive: true });
  await copyFile('src/popup/popup.html', 'dist/popup/popup.html');
  await copyFile('src/popup/popup.css', 'dist/popup/popup.css');
  await copyFile('manifest.json', 'dist/manifest.json');
  await cp('src/icons', 'dist/icons', { recursive: true });
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  await copyStatic();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  await copyStatic();
  console.log('Build complete.');
}
