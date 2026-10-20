/**
 * Continuous-fill scheduling policy — CONTRACT.md §9a.
 *
 * Pure and platform-independent on purpose: every SDK in this repository implements this exact
 * function, so one slot behaves identically on the web, on a phone and in a game engine. Keep the
 * three implementations byte-compatible; the unit tests in each package assert the same table.
 */

import { MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS } from './constants.ts';

/** Ceiling on the doubling exponent so the backoff can never overflow a 32-bit int. */
const MAX_BACKOFF_EXPONENT = 16;

/**
 * How long to wait before the next ad request, or `null` to stop (single-shot).
 *
 * @param rendered            The cycle just finished actually attached a visible creative (§9c).
 * @param consecutiveFailures Consecutive non-rendered cycles *including* the one just finished.
 * @param retryAfterSeconds   `Retry-After` from the last response, if any (§8).
 * @param refreshSeconds      Integrator's requested interval; `<= 0` disables continuous fill.
 */
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
