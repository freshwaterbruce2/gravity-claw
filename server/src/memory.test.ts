import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubPII } from './memory.js';

test('scrubPII redacts OpenAI-style API keys', () => {
  const input = 'My key is sk-abc123def456ghi789jkl012mno345pqr678';
  const result = scrubPII(input);
  assert.equal(result, 'My key is [REDACTED]');
});

test('scrubPII redacts long hex strings', () => {
  const input = 'Token: a1b2c3d4e5f6789012345678abcdef1234567890abcdef1234567890abcd';
  const result = scrubPII(input);
  assert.equal(result, 'Token: [REDACTED]');
});

test('scrubPII redacts email addresses', () => {
  const input = 'Contact me at user@example.com please';
  const result = scrubPII(input);
  assert.equal(result, 'Contact me at [REDACTED] please');
});

test('scrubPII redacts phone numbers', () => {
  const input = 'Call me at 555-123-4567 or 555.987.6543';
  const result = scrubPII(input);
  assert.equal(result, 'Call me at [REDACTED] or [REDACTED]');
});

test('scrubPII redacts credit card numbers', () => {
  const input = 'Card: 4111 1111 1111 1111';
  const result = scrubPII(input);
  assert.equal(result, 'Card: [REDACTED]');
});

test('scrubPII redacts URLs with credentials', () => {
  const input = 'Repo: https://user:pass@github.com/org/repo.git';
  const result = scrubPII(input);
  assert.equal(result, 'Repo: [REDACTED]');
});

test('scrubPII handles multiple PII types in one string', () => {
  const input =
    'Email: alice@test.com, Key: sk-12345678901234567890, Phone: 800-555-0199';
  const result = scrubPII(input);
  assert.equal(
    result,
    'Email: [REDACTED], Key: [REDACTED], Phone: [REDACTED]',
  );
});

test('scrubPII leaves clean text unchanged', () => {
  const input = 'Hello, how can I help you today?';
  const result = scrubPII(input);
  assert.equal(result, input);
});
