/**
 * Bundles the Gravity Claw backend server into a single ESM file (bundle.mjs)
 * for packaging. Core server dependencies are bundled so spawned child
 * processes do not rely on workspace-root node_modules.
 *
 * The Telegram bridge is intentionally runtime-optional. If `telegraf` is not
 * available beside the packaged server, the bridge disables itself and the rest
 * of the backend remains usable.
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

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: [path.join(APP_ROOT, 'server', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: OUT_FILE,
  // node: built-ins (node:*, fs, path, net, etc.) are automatically external
  // with platform:node.
  external: [],
  sourcemap: 'linked',
  logLevel: 'info',
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

console.log(`✓ Server bundle written to server/dist/bundle.mjs`);
