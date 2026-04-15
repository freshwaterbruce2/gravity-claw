/**
 * Bundles the Gravity Claw backend server into a single self-contained ESM
 * file (bundle.mjs) for packaging. This avoids runtime dependency on workspace
 * node_modules which are not accessible to spawned child processes in the
 * packaged Electron app (workspace-root node_modules are not bundled by
 * electron-builder, and app-local node_modules inside app.asar are opaque to
 * child processes).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(APP_ROOT, 'server', 'dist');
// ESM format required: server uses top-level await and import.meta.url
const OUT_FILE = path.join(OUT_DIR, 'bundle.mjs');

fs.mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(APP_ROOT, 'server', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: OUT_FILE,
  // node: built-ins (node:*, fs, path, net, etc.) are automatically external
  // with platform:node. Only need to explicitly exclude electron.
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'info',
});

console.log(`✓ Server bundle written to server/dist/bundle.mjs`);
