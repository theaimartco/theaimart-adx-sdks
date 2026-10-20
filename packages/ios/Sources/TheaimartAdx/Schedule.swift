import Foundation

/// Continuous-fill scheduling policy — CONTRACT.md §9a.
///
/// Pure and platform-independent: every SDK in this repository implements this exact function so
/// one slot behaves identically on every platform. The conformance table in `ScheduleTests.swift`
/// is shared across packages — if you change one, change them all.

/// Ceiling on the doubling exponent so the backoff can never overflow.
private let maxBackoffExponent = 16

/// How long to wait before the next ad request, or `nil` to stop (single-shot).
///
/// - Parameters:
///   - rendered: The cycle just finished actually attached a visible creative (§9c).
///   - consecutiveFailures: Consecutive non-rendered cycles *including* the one just finished.
///   - retryAfterSeconds: `Retry-After` from the last response, if any (§8).
///   - refreshSeconds: Integrator's requested interval; `<= 0` disables continuous fill.
public func nextDelaySeconds(
    rendered: Bool,
    consecutiveFailures: Int,
    retryAfterSeconds: Int?,
    refreshSeconds: Int
) -> Int? {
    guard refreshSeconds > 0 else { return nil }
    if rendered { return max(refreshSeconds, AdxConstants.minRefreshSeconds) }

    let failures = consecutiveFailures < 1 ? 1 : consecutiveFailures
    let exponent = min(failures - 1, maxBackoffExponent)
    let backoff = min(AdxConstants.minRefreshSeconds << exponent, AdxConstants.maxRetrySeconds)
    // Retry-After can only push the delay out, never pull it in (§8).
    let retryAfter = max(retryAfterSeconds ?? 0, 0)
    return max(backoff, retryAfter, refreshSeconds)
}
