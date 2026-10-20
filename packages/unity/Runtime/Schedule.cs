using System;

namespace Theaimart.Adx
{
    /// <summary>
    /// Continuous-fill scheduling policy — CONTRACT.md §9a.
    ///
    /// Pure and platform-independent: every SDK in this repository implements this exact
    /// function so one slot behaves identically on every platform. The conformance table in
    /// <c>ScheduleTests.cs</c> is shared across packages — if you change one, change them all.
    /// </summary>
    public static class AdxSchedule
    {
        /// <summary>Ceiling on the doubling exponent so the backoff can never overflow an int.</summary>
        private const int MaxBackoffExponent = 16;

        /// <summary>
        /// How long to wait before the next ad request, or <c>null</c> to stop (single-shot).
        /// </summary>
        /// <param name="rendered">The cycle just finished actually attached a visible creative (§9c).</param>
        /// <param name="consecutiveFailures">Consecutive non-rendered cycles including the one just finished.</param>
        /// <param name="retryAfterSeconds"><c>Retry-After</c> from the last response, if any (§8).</param>
        /// <param name="refreshSeconds">Integrator's requested interval; &lt;= 0 disables continuous fill.</param>
        public static int? NextDelaySeconds(
            bool rendered,
            int consecutiveFailures,
            int? retryAfterSeconds,
            int refreshSeconds)
        {
            if (refreshSeconds <= 0) return null;
            if (rendered) return Math.Max(refreshSeconds, AdxConstants.MinRefreshSeconds);

            int failures = consecutiveFailures < 1 ? 1 : consecutiveFailures;
            int exponent = Math.Min(failures - 1, MaxBackoffExponent);
            int backoff = Math.Min(AdxConstants.MinRefreshSeconds << exponent, AdxConstants.MaxRetrySeconds);
            // Retry-After can only push the delay out, never pull it in (§8).
            int retryAfter = (retryAfterSeconds.HasValue && retryAfterSeconds.Value > 0)
                ? retryAfterSeconds.Value
                : 0;
            return Math.Max(Math.Max(backoff, retryAfter), refreshSeconds);
        }
    }
}
