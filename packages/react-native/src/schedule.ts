/**
 * Continuous-fill scheduling policy — CONTRACT.md §9a.
 *
 * Pure and platform-independent: every SDK in this repository implements this exact function so
 * one slot behaves identically on every platform. The conformance table in `test/schedule.test.ts`
 * is shared across packages — if you change one, change them all.
 */

import { MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS } from './constants.ts';

/** Ceiling on the doubling exponent so the backoff can never overflow a 32-bit int. */
const MAX_BACKOFF_EXPONENT = 16;

export function nextDelaySeconds(
  rendered: boolean,
  consecutiveFailures: number,
  retryAfterSeconds: number | null,
  refreshSeconds: number,
): number | null {
  if (!Number.isFinite(refreshSeconds) || refreshSeconds <= 0) return null;
  if (rendered) return Math.max(refreshSeconds, MIN_REFRESH_SECONDS);

  const failures = Math.max(1, Math.floor(consecutiveFailures));
  const exponent = Math.min(failures - 1, MAX_BACKOFF_EXPONENT);
  const backoff = Math.min(MIN_REFRESH_SECONDS * 2 ** exponent, MAX_RETRY_SECONDS);
  // Retry-After can only push the delay out, never pull it in (§8).
  const retryAfter =
    retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : 0;
  return Math.max(backoff, retryAfter, refreshSeconds);
}
