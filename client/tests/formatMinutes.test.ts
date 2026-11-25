import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration } from '../src/formatMinutes.ts';

test('converts workflow duration at hour, day, and 30-day month boundaries', () => {
  assert.equal(formatDuration(59), '59 min');
  assert.equal(formatDuration(60), '1 hr');
  assert.equal(formatDuration(1_439), '23 hr 59 min');
  assert.equal(formatDuration(1_440), '1 d');
  assert.equal(formatDuration(43_200), '1 mo');
});

test('keeps the nonzero units and fractional minutes in longer durations', () => {
  assert.equal(formatDuration(61.5), '1 hr 1.5 min');
  assert.equal(formatDuration(43_200 + 2 * 1_440 + 3 * 60 + 5), '1 mo 2 d 3 hr 5 min');
});

test('distinguishes a zero duration from unavailable timing', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(undefined), '—');
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), '—');
  assert.equal(formatDuration(-1), '—');
});
