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
  type GravityClawConfig,
} from './config.js';

test('sanitizeConfig defaults the agent name when it is omitted', () => {
  const config = sanitizeConfig({
    model: 'gemini-2.5-flash',
  });

  assert.equal(config.name, 'G-CLAW-01');
});

test('sanitizeConfig applies defaults for all fields when input is empty', () => {
  const config = sanitizeConfig({});

  assert.equal(config.name, 'G-CLAW-01');
  assert.equal(config.model, 'gemini-2.5-flash');
  assert.equal(config.gravityMechanicEnabled, true);
  assert.equal(config.memoryEnabled, true);
  assert.equal(config.beeMemoryEnabled, true);
  assert.equal(config.selfImprovementEnabled, true);
  assert.equal(config.vectorMemoryEnabled, false);
  assert.equal(config.directShellEnabled, true);
  assert.equal(config.workspaceWatchersEnabled, false);
  assert.equal(config.gitPipelineEnabled, true);
  assert.equal(config.oauthLoopholeEmail, 'bruceybabybot@gmail.com');
  assert.deepEqual(config.platforms, {
    telegram: true,
    discord: true,
    whatsapp: true,
    slack: false,
    email: true,
    signal: false,
  });
  assert.deepEqual(config.skillEngine, {
    maxConcurrentSkills: 3,
    skillTimeoutSeconds: 60,
    webSearchMaxResults: 10,
  });
});

test('sanitizeConfig clamps skill engine values', () => {
  const config = sanitizeConfig({
    skillEngine: {
      maxConcurrentSkills: 0,
      skillTimeoutSeconds: -5,
      webSearchMaxResults: NaN,
    },
  });

  assert.equal(config.skillEngine.maxConcurrentSkills, 1);
  assert.equal(config.skillEngine.skillTimeoutSeconds, 1);
  assert.equal(config.skillEngine.webSearchMaxResults, 10);
});

test('sanitizeConfig handles invalid field types gracefully', () => {
  const config = sanitizeConfig({
    name: '',
    model: null as unknown as string,
    gravityMechanicEnabled: 'yes' as unknown as boolean,
    platforms: null as unknown as GravityClawConfig['platforms'],
    skillEngine: null as unknown as GravityClawConfig['skillEngine'],
  });

  assert.equal(config.name, 'G-CLAW-01');
  assert.equal(config.model, 'gemini-2.5-flash');
  assert.equal(config.gravityMechanicEnabled, true);
});

test('getGravityClawConfig returns cached config on repeated calls', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'gravity-claw-config-cache-'));
  const configPath = path.join(tempDir, 'gravity-claw.config.json');
  const previousPath = process.env.GRAVITY_CLAW_CONFIG_PATH;

  process.env.GRAVITY_CLAW_CONFIG_PATH = configPath;
  resetGravityClawConfigCache();

  try {
    const first = await getGravityClawConfig();
    const second = await getGravityClawConfig();
    assert.equal(first, second);
  } finally {
    if (previousPath !== undefined) {
      process.env.GRAVITY_CLAW_CONFIG_PATH = previousPath;
    } else {
      delete process.env.GRAVITY_CLAW_CONFIG_PATH;
    }
    resetGravityClawConfigCache();
  }
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
    if (previousPath !== undefined) {
      process.env.GRAVITY_CLAW_CONFIG_PATH = previousPath;
    } else {
      delete process.env.GRAVITY_CLAW_CONFIG_PATH;
    }
    resetGravityClawConfigCache();
  }
});
