using System.Collections.Generic;

namespace Theaimart.Adx
{
    /// <summary>What a POST /serve/viewable response means for the view it reported (CONTRACT.md §5).</summary>
    public enum ViewableOutcome
    {
        /// <summary>The server recorded the view (or already had it — duplicate: true).</summary>
        Recorded,
        /// <summary>Not counted, but resending is safe: too early, rate-limited, 5xx or no response.</summary>
        Retry,
        /// <summary>Permanent failure (e.g. 400); resending would not help.</summary>
        Drop,
    }

    /// <summary>
    /// CONTRACT.md §5 beacon outcomes and §3 identity persistence. Pure, so they are covered by the
    /// EditMode tests like the other contract functions.
    /// </summary>
    public static class AdxViewable
    {
        /// <summary>
        /// Wait before each resend of a beacon answered Retry: attempts land at roughly t = 0, 1, 3
        /// and 7 s. The backend flushes impressions every 500 ms by default, so this covers a slow
        /// flush several times over without keeping a dead beacon alive.
        /// </summary>
        public static readonly int[] RetryDelaysSeconds = { 1, 2, 4 };

        /// <summary>
        /// Classify a viewability-beacon response. status 0 means no response (transport error).
        ///
        /// The backend writes impressions through an async buffer, so a beacon can arrive before the
        /// row exists. It then answers 200 {"success": false, "retry": true} and releases its dedup
        /// key — the view was NOT counted. Reading only the status code turns that into a silent
        /// success, which is how early beacons used to be lost for good.
        /// </summary>
        public static ViewableOutcome Classify(int status, string body)
        {
            if (status == 0 || status == 429 || status >= 500) return ViewableOutcome.Retry;
            if (status < 200 || status >= 300) return ViewableOutcome.Drop;
            var obj = Json.Parse(body) as Dictionary<string, object>;
            if (obj == null) return ViewableOutcome.Drop;
            if (IsTrue(obj, "success")) return ViewableOutcome.Recorded;
            if (IsTrue(obj, "retry")) return ViewableOutcome.Retry;
            return ViewableOutcome.Drop;
        }

        /// <summary>
        /// Whether to resend after the given outcome, on the given zero-based attempt. Only an internal
        /// impression is retryable: an OpenRTB win never gets a row the beacon could mark.
        /// </summary>
        public static bool ShouldResend(ViewableOutcome outcome, bool retryable, int attempt)
        {
            return outcome == ViewableOutcome.Retry && retryable && attempt < RetryDelaysSeconds.Length;
        }

        /// <summary>
        /// Whether a server-sent _an_id is safe to persist and replay in a Cookie header. The value is
        /// "uuid.base64signature" (or a bare legacy UUID); anything outside those alphabets is refused.
        /// </summary>
        public static bool IsStorableIdentity(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 256) return false;
            foreach (char c in value)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
                          c == '.' || c == '_' || c == '-' || c == '+' || c == '/' || c == '=';
                if (!ok) return false;
            }
            return true;
        }

        // A JSON string "true" is not a success: only a real boolean counts.
        private static bool IsTrue(Dictionary<string, object> obj, string key)
        {
            return obj.TryGetValue(key, out object v) && v is bool b && b;
        }
    }
}
