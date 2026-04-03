import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getGravityClawConfig,
  resetGravityClawConfigCache,
  sanitizeConfig,
  updateGravityClawConfig,
} from './config.js';

test('sanitizeConfig defaults the agent name when it is omitted', () => {
  const config = sanitizeConfig({
    model: 'gemini-2.5-flash',
  });

  assert.equal(config.name, 'G-CLAW-01');
});

test('updateGravityClawConfig persists and reloads the configured name', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'gravity-claw-config-'));
  const configPath = path.join(tempDir, 'gravity-claw.config.json');
  const previousPath = process.env.GRAVITY_CLAW_CONFIG_PATH;

  process.env.GRAVITY_CLAW_CONFIG_PATH = configPath;
  resetGravityClawConfigCache();

  try {
    const saved = await updateGravityClawConfig({
      name: 'G-CLAW-ALPHA',
      model: 'kimi-k2.5',
    });

    assert.equal(saved.name, 'G-CLAW-ALPHA');
    assert.equal(saved.model, 'kimi-k2.5');

    resetGravityClawConfigCache();
    const reloaded = await getGravityClawConfig();
    assert.equal(reloaded.name, 'G-CLAW-ALPHA');
    assert.equal(reloaded.model, 'kimi-k2.5');

    const raw = JSON.parse(await readFile(configPath, 'utf8')) as { name?: string };
    assert.equal(raw.name, 'G-CLAW-ALPHA');
  } finally {
    if (previousPath) {
      process.env.GRAVITY_CLAW_CONFIG_PATH = previousPath;
    } else {
      delete process.env.GRAVITY_CLAW_CONFIG_PATH;
    }
    resetGravityClawConfigCache();
  }
});
