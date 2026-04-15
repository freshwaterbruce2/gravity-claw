/**
 * electron-builder configuration for Gravity Claw
 * Windows 11 only — NSIS installer + portable .exe
 *
 * CJS format required because package.json has "type":"module"
 */

'use strict';

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.vibetech.gravityclaw',
  productName: 'Gravity Claw',

  // ── Source layout ──────────────────────────────────────────────────────────
  directories: {
    output: 'release',
    buildResources: 'build',
  },

  // ── Files bundled into the asar archive ────────────────────────────────────
  // 'dist/**'                  — Vite frontend build
  // 'electron/**'              — main process + preload
  // 'scripts/runtime-paths.mjs'— imported by main.mjs at runtime
  // 'package.json'             — required by Electron at runtime
  // server/** is excluded; the pre-bundled server is delivered via extraResources.
  files: [
    'dist/**',
    'electron/**',
    // runtime-paths.mjs is statically imported by electron/main.mjs so it
    // must live inside the asar alongside main.mjs
    'scripts/runtime-paths.mjs',
    'package.json',
    // Exclude items that are either in extraResources or not needed at runtime
    '!src/**',
    '!server/**',
    '!node_modules/.cache/**',
    '!**/*.test.*',
    '!**/*.spec.*',
    '!.env*',
    '!coverage/**',
    '!release/**',
  ],

  // asar: true wraps all 'files' into a single asar archive for performance
  // and basic tamper-resistance. server/ is outside asar via extraResources.
  asar: true,

  // ── Extra resources (unpacked, accessible via process.resourcesPath) ────────
  // The Hono backend is spawned as a Node.js child process. The server source
  // is pre-bundled by scripts/bundle-server.mjs into a single self-contained
  // ESM file so no workspace node_modules are required at runtime.
  //
  // Layout in the installed app:
  //   <install>/resources/server/dist/bundle.mjs  — bundled Hono server (ESM)
  //   <install>/resources/server/src/soul.md      — personality prompt (read at runtime)
  //
  // electron/main.mjs resolves SERVER_ENTRY to:
  //   path.join(process.resourcesPath, 'server', 'dist', 'bundle.mjs')
  // and spawns it directly with node.exe (no tsx needed).
  extraResources: [
    // Pre-bundled server — all deps inlined, no node_modules required
    {
      from: 'server/dist/bundle.mjs',
      to: 'server/dist/bundle.mjs',
    },
    // soul.md is read at runtime via process.cwd()/server/src/soul.md
    {
      from: 'server/src/soul.md',
      to: 'server/src/soul.md',
    },
  ],

  // ── Windows targets ─────────────────────────────────────────────────────────
  win: {
    // Targets Windows 11 exclusively — no Mac/Linux entries
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    // icon must be a 256×256 ICO; add build/icon.ico before producing a release
    icon: 'build/icon.ico',
  },

  // ── NSIS installer options ──────────────────────────────────────────────────
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Gravity Claw',
    // Per-user install avoids UAC prompt for most users
    perMachine: false,
  },

  // ── Portable options ─────────────────────────────────────────────────────────
  portable: {
    // Portable build writes userData inside the exe's own directory so the
    // app is fully self-contained on a USB drive or shared folder
    artifactName: '${productName}-${version}-portable.exe',
  },
};

module.exports = config;
