// Continuous-fill scheduling policy — CONTRACT.md §9a.
//
// Pure and platform-independent: every SDK in this repository implements this exact function so
// one slot behaves identically on every platform. The conformance table in
// `test/schedule_test.dart` is shared across packages — if you change one, change them all.

import 'constants.dart';

/// Ceiling on the doubling exponent so the backoff can never overflow.
const int _maxBackoffExponent = 16;

/// How long to wait before the next ad request, or `null` to stop (single-shot).
///
/// [rendered] — the cycle just finished actually attached a visible creative (§9c).
/// [consecutiveFailures] — consecutive non-rendered cycles *including* the one just finished.
/// [retryAfterSeconds] — `Retry-After` from the last response, if any (§8).
/// [refreshSeconds] — integrator's requested interval; `<= 0` disables continuous fill.
int? nextDelaySeconds(
  bool rendered,
  int consecutiveFailures,
  int? retryAfterSeconds,
  int refreshSeconds,
) {
  if (refreshSeconds <= 0) return null;
  if (rendered) {
    return refreshSeconds > minRefreshSeconds
        ? refreshSeconds
        : minRefreshSeconds;
  }

  final failures = consecutiveFailures < 1 ? 1 : consecutiveFailures;
  final exponent = (failures - 1) > _maxBackoffExponent
      ? _maxBackoffExponent
      : (failures - 1);
  var delay = minRefreshSeconds * (1 << exponent);
  if (delay > maxRetrySeconds) delay = maxRetrySeconds;

  // Retry-After can only push the delay out, never pull it in (§8).
  final retryAfter = (retryAfterSeconds != null && retryAfterSeconds > 0)
      ? retryAfterSeconds
      : 0;
  if (retryAfter > delay) delay = retryAfter;
  if (refreshSeconds > delay) delay = refreshSeconds;
  return delay;
}
