import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseDuration, msUntilNext } = require('../dist/main/reminders.js');

test('parseDuration', () => {
  assert.equal(parseDuration('45m'), 45 * 60_000);
  assert.equal(parseDuration('1h'), 3_600_000);
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('2'), 120_000);
  assert.equal(parseDuration('nope'), null);
});

test('msUntilNext picks the next allowed weekday', () => {
  const wed = new Date(2026, 9, 14, 10, 0, 0); // Wednesday
  assert.equal(msUntilNext('10:30', undefined, wed), 30 * 60_000);
  assert.equal(msUntilNext('09:00', undefined, wed), 23 * 3_600_000);
  // Only Fridays (5): two days ahead.
  assert.equal(msUntilNext('10:00', [5], wed), 2 * 86_400_000);
  assert.equal(msUntilNext('25:00', undefined, wed), null);
});
