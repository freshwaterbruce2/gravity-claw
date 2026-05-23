#!/usr/bin/env node
/**
 * Generates a `latest.json` file for Tauri's auto-updater.
 *
 * Run after `tauri build` to produce the update manifest that the app
 * will fetch from GitHub Releases (or any static HTTPS endpoint).
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs <version> <notes>
 *
 * Example:
 *   node scripts/generate-latest-json.mjs 0.2.1 "Bug fixes and improvements"
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const version = process.argv[2] || '0.2.0';
const notes = process.argv[3] || `Gravity Claw ${version}`;
const date = new Date().toISOString();

const targetDir = resolve('target', 'gravity-claw', 'release', 'bundle');

function sha256(filePath) {
  if (!existsSync(filePath)) return null;
  const data = readFileSync(filePath);
  return createHash('sha256').update(data).digest('base64');
}

function sig(filePath) {
  const p = `${filePath}.sig`;
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8').trim();
}

const platforms = {};

// Windows NSIS
const nsisPath = resolve(targetDir, 'nsis', `Gravity Claw_${version}_x64-setup.exe`);
const nsisSig = sig(nsisPath);
if (nsisSig) {
  platforms['windows-x86_64'] = {
    signature: nsisSig,
    url: `https://github.com/freshwaterbruce2/vibe-tech-monorepo/releases/download/v${version}/Gravity.Claw_${version}_x64-setup.exe`,
  };
}

// Windows MSI
const msiPath = resolve(targetDir, 'msi', `Gravity Claw_${version}_x64_en-US.msi`);
const msiSig = sig(msiPath);
if (msiSig) {
  platforms['windows-x86_64-msi'] = {
    signature: msiSig,
    url: `https://github.com/freshwaterbruce2/vibe-tech-monorepo/releases/download/v${version}/Gravity.Claw_${version}_x64_en-US.msi`,
  };
}

const manifest = {
  version,
  notes,
  pub_date: date,
  platforms,
};

const outPath = resolve(targetDir, 'latest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Generated ${outPath}`);
console.log(JSON.stringify(manifest, null, 2));
