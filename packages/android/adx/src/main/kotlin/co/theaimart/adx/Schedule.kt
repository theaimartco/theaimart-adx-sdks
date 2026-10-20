package co.theaimart.adx

/**
 * Continuous-fill scheduling policy — CONTRACT.md §9a.
 *
 * Pure and platform-independent: every SDK in this repository implements this exact function so
 * one slot behaves identically on every platform. The conformance table in `ScheduleTest.kt` is
 * shared across packages — if you change one, change them all.
 */

/** Ceiling on the doubling exponent so the backoff can never overflow an Int. */
private const val MAX_BACKOFF_EXPONENT: Int = 16

/**
 * How long to wait before the next ad request, or `null` to stop (single-shot).
 *
 * @param rendered            the cycle just finished actually attached a visible creative (§9c)
 * @param consecutiveFailures consecutive non-rendered cycles *including* the one just finished
 * @param retryAfterSeconds   `Retry-After` from the last response, if any (§8)
 * @param refreshSeconds      integrator's requested interval; `<= 0` disables continuous fill
 */
public fun nextDelaySeconds(
    rendered: Boolean,
    consecutiveFailures: Int,
    retryAfterSeconds: Int?,
    refreshSeconds: Int,
): Int? {
    if (refreshSeconds <= 0) return null
    if (rendered) return maxOf(refreshSeconds, MIN_REFRESH_SECONDS)

    val failures = if (consecutiveFailures < 1) 1 else consecutiveFailures
    val exponent = minOf(failures - 1, MAX_BACKOFF_EXPONENT)
    val backoff = minOf(MIN_REFRESH_SECONDS shl exponent, MAX_RETRY_SECONDS)
    // Retry-After can only push the delay out, never pull it in (§8).
    val retryAfter = if (retryAfterSeconds != null && retryAfterSeconds > 0) retryAfterSeconds else 0
    return maxOf(backoff, retryAfter, refreshSeconds)
}
