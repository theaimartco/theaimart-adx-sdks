/**
 * CONTRACT.md §9a — the continuous-fill scheduling policy.
 *
 * This is the shared conformance table. Every SDK in the repository ships the same cases;
 * if you change one, change them all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDelaySeconds } from '../src/schedule.ts';
import { MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS } from '../src/constants.ts';

test('refresh disabled is single-shot, whatever happened', () => {
  assert.equal(nextDelaySeconds(true, 0, null, 0), null);
  assert.equal(nextDelaySeconds(false, 3, null, 0), null);
  assert.equal(nextDelaySeconds(false, 1, 60, -5), null);
});

test('a rendered ad refreshes at the requested interval, floored at 30s', () => {
  assert.equal(nextDelaySeconds(true, 0, null, 60), 60);
  assert.equal(nextDelaySeconds(true, 0, null, 30), 30);
  assert.equal(nextDelaySeconds(true, 0, null, 10), MIN_REFRESH_SECONDS);
  assert.equal(nextDelaySeconds(true, 0, null, 1), MIN_REFRESH_SECONDS);
});

test('failures back off 30 → 60 → 120 → 240 → 300 and cap there', () => {
  assert.equal(nextDelaySeconds(false, 1, null, 30), 30);
  assert.equal(nextDelaySeconds(false, 2, null, 30), 60);
  assert.equal(nextDelaySeconds(false, 3, null, 30), 120);
  assert.equal(nextDelaySeconds(false, 4, null, 30), 240);
  assert.equal(nextDelaySeconds(false, 5, null, 30), MAX_RETRY_SECONDS);
  assert.equal(nextDelaySeconds(false, 99, null, 30), MAX_RETRY_SECONDS);
  // A very long outage must not overflow into a negative or absurd delay.
  assert.equal(nextDelaySeconds(false, 1e9, null, 30), MAX_RETRY_SECONDS);
});

test('Retry-After can push the delay out but never pull it in (§8)', () => {
  assert.equal(nextDelaySeconds(false, 1, 90, 30), 90);
  assert.equal(nextDelaySeconds(false, 5, 10, 30), MAX_RETRY_SECONDS);
  assert.equal(nextDelaySeconds(false, 1, 0, 30), 30);
  assert.equal(nextDelaySeconds(false, 1, null, 30), 30);
});

test('a slow requested interval is honoured on failure too', () => {
  assert.equal(nextDelaySeconds(false, 1, null, 600), 600);
  assert.equal(nextDelaySeconds(true, 0, null, 600), 600);
});

test('the loop always stays inside the per-key rate limit', () => {
  // Worst case is a permanently filling slot at the floor: 2 requests/min, vs 100/min per api_key.
  const perMinute = 60 / (nextDelaySeconds(true, 0, null, 1) as number);
  assert.ok(perMinute <= 2, `expected <= 2 req/min at the floor, got ${perMinute}`);
});
