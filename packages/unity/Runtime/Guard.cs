using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace Theaimart.Adx
{
    /// <summary>
    /// Outbound request guard (CONTRACT.md §12).
    ///
    /// Everything this SDK puts on the wire to the ad server passes through here first: the config is
    /// held to a client-safe shape (a public pk_ key over TLS), every request field is validated,
    /// minimised and length-bounded, and the request rate is capped on the device so a buggy
    /// integration — an Update() loop, a retry storm — never reaches the server as load.
    ///
    /// Implements exactly the rules of the Node/Web/React Native guard.ts and is asserted with the same
    /// test vectors. C# 7.3-compatible on purpose (older Unity LTS releases).
    /// </summary>
    public static class AdxGuard
    {
        public const int MaxPageUrlBytes = 2048;
        public const int MaxKeywordsBytes = 1024;
        public const int MaxSlotNameBytes = 128;
        public const int MaxConsentBytes = 8192;
        public const int MaxUsPrivacyChars = 32;
        public const int MaxGppSidChars = 128;
        public const int MaxHeaderValueChars = 512;
        public const int MaxResponseBytes = 512 * 1024;
        public const int MaxRequestsPerMinute = 60;
        public const int DefaultRateLimitBackoffSeconds = 60;
        public const int MaxRateLimitBackoffSeconds = 600;

        /// <summary>Local no-fill reasons. No request was sent for any of them.</summary>
        public const string ReasonInvalidRequest = "invalid_request";
        public const string ReasonRateLimited = "rate_limited";
        public const string ReasonInvalidConfig = "invalid_config";

        private static readonly Regex PublishableKey = new Regex("^pk_[A-Za-z0-9_-]{1,97}$", RegexOptions.CultureInvariant);
        private static readonly Regex Uuid = new Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", RegexOptions.CultureInvariant);
        private static readonly Regex ImpId = new Regex("^[A-Za-z0-9_-]{1,128}$", RegexOptions.CultureInvariant);
        private static readonly Regex Identity = new Regex("^[A-Za-z0-9._+/=-]{1,512}$", RegexOptions.CultureInvariant);
        private static readonly Regex Ipv4 = new Regex("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$", RegexOptions.CultureInvariant);
        private static readonly Regex NonDigits = new Regex("[^0-9]+", RegexOptions.CultureInvariant);
        private static readonly Regex TokenChars = new Regex("^[A-Za-z0-9_.~=-]+$", RegexOptions.CultureInvariant);
        private static readonly char[] TokenSeparators = { '-', '.', '_', '~', '=' };
        private static readonly Regex AsciiEscape = new Regex("%([0-7][0-9A-Fa-f])", RegexOptions.CultureInvariant);

        /// <summary>Query-parameter names that carry credentials or personal data, matched exactly.</summary>
        public static readonly string[] SensitiveParamNames =
        {
            "code", "state", "key", "sig", "sid", "nonce", "ticket", "otp", "pin",
            "email", "phone", "password", "pass", "pwd", "ssn",
        };

        /// <summary>Query-parameter name fragments that carry credentials, matched as substrings.</summary>
        public static readonly string[] SensitiveParamFragments =
        {
            "token", "secret", "passw", "session", "auth", "jwt", "signature",
            "apikey", "api_key", "access_key", "credential", "private",
        };

        // Regex `$` also matches before a trailing "\n"; every pattern above is checked against a value
        // that has no newline (IsMatchWhole), so "pk_a\n" can never pass.
        private static bool IsMatchWhole(Regex regex, string value)
        {
            return value != null && value.IndexOf('\n') < 0 && regex.IsMatch(value);
        }

        private static bool IsControl(char c)
        {
            return c <= '\u001f' || (c >= '\u007f' && c <= '\u009f');
        }

        /// <summary>Whether key is a publishable site key — never an account token or secret.</summary>
        public static bool IsPublishableKey(string key)
        {
            return IsMatchWhole(PublishableKey, key);
        }

        private static bool IsLocalHost(string host)
        {
            if (host == "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal) || host == "[::1]") return true;
            if (!IsMatchWhole(Ipv4, host)) return false;
            string[] parts = host.Split('.');
            int a = int.Parse(parts[0]);
            int b = int.Parse(parts[1]);
            return a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
        }

        /// <summary>
        /// Normalise a base URL, or null if it is unsafe: https required, plain http only for a loopback
        /// or private-network host; no credentials, query, fragment, backslash or whitespace.
        /// </summary>
        public static string NormalizeBaseUrl(string url)
        {
            if (url == null) return null;
            string s = url.Trim().TrimEnd('/');
            foreach (char c in s)
            {
                if (char.IsWhiteSpace(c) || IsControl(c) || c == '@' || c == '?' || c == '#' || c == '\\') return null;
            }
            string lowered = s.ToLowerInvariant();
            string rest;
            bool secure;
            if (lowered.StartsWith("https://", StringComparison.Ordinal)) { rest = lowered.Substring(8); secure = true; }
            else if (lowered.StartsWith("http://", StringComparison.Ordinal)) { rest = lowered.Substring(7); secure = false; }
            else return null;
            int slash = rest.IndexOf('/');
            string authority = slash < 0 ? rest : rest.Substring(0, slash);
            string host;
            if (authority.StartsWith("[", StringComparison.Ordinal))
            {
                int close = authority.IndexOf(']');
                if (close < 0) return null;
                host = authority.Substring(0, close + 1);
            }
            else
            {
                int colon = authority.IndexOf(':');
                host = colon < 0 ? authority : authority.Substring(0, colon);
            }
            if (host.Length == 0 || (!secure && !IsLocalHost(host))) return null;
            return s;
        }

        public static bool IsUuid(string value) { return IsMatchWhole(Uuid, value); }

        /// <summary>Whether an imp_id may be echoed back to the server. Real ones are &lt;millis&gt;_&lt;uuid&gt;.</summary>
        public static bool IsSafeImpId(string value) { return IsMatchWhole(ImpId, value); }

        /// <summary>Whether an _an_id may be stored or sent as a Cookie: the server's own alphabet.</summary>
        public static bool IsSafeIdentityCookie(string value) { return IsMatchWhole(Identity, value); }

        public static string StripControl(string value)
        {
            var sb = new StringBuilder(value.Length);
            foreach (char c in value) if (!IsControl(c)) sb.Append(c);
            return sb.ToString();
        }

        /// <summary>A header value the caller supplied: control-free and bounded.</summary>
        public static string SafeHeaderValue(string value)
        {
            string s = StripControl(value);
            return s.Length > MaxHeaderValueChars ? s.Substring(0, MaxHeaderValueChars) : s;
        }

        /// <summary>Truncate to at most maxBytes UTF-8 bytes without splitting a character.</summary>
        public static string TruncateUtf8(string value, int maxBytes)
        {
            int bytes = 0;
            int i = 0;
            while (i < value.Length)
            {
                int cp;
                int width = 1;
                if (char.IsHighSurrogate(value[i]) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
                {
                    cp = char.ConvertToUtf32(value[i], value[i + 1]);
                    width = 2;
                }
                else
                {
                    cp = value[i];
                }
                int size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
                if (bytes + size > maxBytes) break;
                bytes += size;
                i += width;
            }
            return value.Substring(0, i);
        }

        private static int Utf8Length(string value) { return System.Text.Encoding.UTF8.GetByteCount(value); }

        /// <summary>
        /// Whether a path segment or query value looks like an opaque credential — a reset/magic-link token,
        /// a session id, a hex digest, a JWT — whatever it is called: 24+ chars of [A-Za-z0-9_.~=-] with one
        /// separator-delimited piece of 16+ chars mixing letters and digits.
        /// </summary>
        public static bool LooksLikeSecret(string value)
        {
            if (value == null || value.Length < 24 || !IsMatchWhole(TokenChars, value)) return false;
            foreach (string piece in value.Split(TokenSeparators))
            {
                if (piece.Length < 16) continue;
                bool letter = false, digit = false;
                foreach (char c in piece)
                {
                    if (c >= '0' && c <= '9') digit = true;
                    else letter = true;
                }
                if (letter && digit) return true;
            }
            return false;
        }

        private static string DecodeAsciiEscapes(string value)
        {
            return AsciiEscape.Replace(value, m => ((char)Convert.ToInt32(m.Groups[1].Value, 16)).ToString());
        }

        private static bool IsSensitiveParam(string name)
        {
            string n = DecodeAsciiEscapes(name).ToLowerInvariant().Replace('-', '_');
            if (Array.IndexOf(SensitiveParamNames, n) >= 0) return true;
            foreach (string f in SensitiveParamFragments) if (n.Contains(f)) return true;
            return false;
        }

        private static string NullIfEmpty(string s) { return string.IsNullOrEmpty(s) ? null : s; }

        /// <summary>
        /// Minimise a page URL before it leaves the device: drop the fragment and any userinfo, drop each
        /// query parameter whose name is credential-like or whose value contains '@', and bound it to
        /// MaxPageUrlBytes. The backend stores page_url and forwards it to OpenRTB bidders.
        /// </summary>
        public static string SanitizePageUrl(string url)
        {
            if (url == null) return null;
            string s = StripControl(url).Trim();
            int hash = s.IndexOf('#');
            if (hash >= 0) s = s.Substring(0, hash);

            int scheme = s.IndexOf("://", StringComparison.Ordinal);
            if (scheme >= 0)
            {
                int start = scheme + 3;
                int end = s.Length;
                int slash = s.IndexOf('/', start);
                if (slash >= 0 && slash < end) end = slash;
                int q0 = s.IndexOf('?', start);
                if (q0 >= 0 && q0 < end) end = q0;
                int at = end > start ? s.LastIndexOf('@', end - 1, end - start) : -1;
                if (at >= start) s = s.Substring(0, start) + s.Substring(at + 1);
            }

            // Opaque tokens in the path (/reset/<token>, /magic/<jwt>) become "*".
            int q0 = s.IndexOf('?');
            string head = q0 < 0 ? s : s.Substring(0, q0);
            string tail = q0 < 0 ? "" : s.Substring(q0);
            int pathStart = 0;
            if (scheme >= 0)
            {
                int slash = head.IndexOf('/', scheme + 3);
                pathStart = slash < 0 ? head.Length : slash;
            }
            string[] segments = head.Substring(pathStart).Split('/');
            for (int i = 0; i < segments.Length; i++) if (LooksLikeSecret(segments[i])) segments[i] = "*";
            s = head.Substring(0, pathStart) + string.Join("/", segments) + tail;

            int q = s.IndexOf('?');
            if (q >= 0)
            {
                var kept = new List<string>();
                foreach (string part in s.Substring(q + 1).Split('&'))
                {
                    if (part.Length == 0) continue;
                    int eq = part.IndexOf('=');
                    string name = eq < 0 ? part : part.Substring(0, eq);
                    string raw = eq < 0 ? "" : part.Substring(eq + 1);
                    string value = raw.ToLowerInvariant();
                    if (IsSensitiveParam(name) || value.Contains("@") || value.Contains("%40") || LooksLikeSecret(raw)) continue;
                    kept.Add(part);
                }
                s = s.Substring(0, q) + (kept.Count > 0 ? "?" + string.Join("&", kept.ToArray()) : "");
            }

            return NullIfEmpty(TruncateUtf8(s, MaxPageUrlBytes));
        }

        public static string SanitizeKeywords(string keywords)
        {
            return keywords == null ? null : NullIfEmpty(TruncateUtf8(StripControl(keywords).Trim(), MaxKeywordsBytes));
        }

        /// <summary>Never dropped or reinterpreted: the backend reads the third character as the opt-out flag.</summary>
        public static string SanitizeUsPrivacy(string value)
        {
            if (value == null) return null;
            string s = StripControl(value).Trim();
            if (s.Length > MaxUsPrivacyChars) s = s.Substring(0, MaxUsPrivacyChars);
            return NullIfEmpty(s);
        }

        /// <summary>Keeps every section id: any non-digit becomes ',' ("7;8" → "7,8", never "78").</summary>
        public static string SanitizeGppSid(string value)
        {
            if (value == null) return null;
            string output = "";
            foreach (string id in NonDigits.Split(value))
            {
                if (id.Length == 0) continue;
                string next = output.Length == 0 ? id : output + "," + id;
                if (next.Length > MaxGppSidChars) break;
                output = next;
            }
            return NullIfEmpty(output);
        }

        /// <summary>Over MaxConsentBytes it is omitted, never truncated — a cut consent string is corrupt.</summary>
        public static string SanitizeConsent(string value)
        {
            if (value == null) return null;
            string s = StripControl(value).Trim();
            return s.Length == 0 || Utf8Length(s) > MaxConsentBytes ? null : s;
        }

        /// <summary>
        /// Validate and minimise one serve request. Returns the ordered query params, or null when it must
        /// not be sent: no usable slot, a slot_id that is not a UUID, an over-long slot_name.
        /// </summary>
        public static List<KeyValuePair<string, string>> GuardServeParams(string apiKey, AdRequest request)
        {
            if (request == null) return null;
            string slotId = request.SlotId == null ? "" : request.SlotId.Trim();
            string slotName = request.SlotName == null ? "" : StripControl(request.SlotName).Trim();
            if (slotId.Length > 0)
            {
                if (!IsUuid(slotId)) return null;
            }
            else if (slotName.Length == 0 || Utf8Length(slotName) > MaxSlotNameBytes)
            {
                return null;
            }
            bool byId = slotId.Length > 0;
            return new List<KeyValuePair<string, string>>
            {
                new KeyValuePair<string, string>("api_key", apiKey),
                new KeyValuePair<string, string>("slot_id", byId ? slotId : null),
                new KeyValuePair<string, string>("slot_name", byId ? null : slotName),
                new KeyValuePair<string, string>("page_url", SanitizePageUrl(request.PageUrl)),
                new KeyValuePair<string, string>("page_keywords", SanitizeKeywords(request.PageKeywords)),
                new KeyValuePair<string, string>("us_privacy", SanitizeUsPrivacy(request.UsPrivacy)),
                new KeyValuePair<string, string>("euconsent_v2", SanitizeConsent(request.EuconsentV2)),
                new KeyValuePair<string, string>("gpp", SanitizeConsent(request.Gpp)),
                new KeyValuePair<string, string>("gpp_sid", SanitizeGppSid(request.GppSid)),
            };
        }

        private static readonly Dictionary<string, AdxRequestGuard> Guards = new Dictionary<string, AdxRequestGuard>();

        /// <summary>The process-wide guard for one (base URL, api key) — shared by every client and banner.</summary>
        public static AdxRequestGuard RequestGuardFor(string baseUrl, string apiKey)
        {
            lock (Guards)
            {
                string id = baseUrl + " " + apiKey;
                AdxRequestGuard guard;
                if (!Guards.TryGetValue(id, out guard))
                {
                    guard = new AdxRequestGuard();
                    Guards[id] = guard;
                }
                return guard;
            }
        }

        /// <summary>Forget every guard's state. For tests.</summary>
        public static void ResetRequestGuards()
        {
            lock (Guards) Guards.Clear();
        }

        internal static long NowMs()
        {
            return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
        }
    }

    /// <summary>
    /// Client-side rate bound for one (base URL, api key): a token bucket of MaxRequestsPerMinute refilled
    /// continuously, plus a circuit breaker that stops every request after a 429 until its Retry-After has
    /// passed. Thread-safe; time is passed in (ms).
    /// </summary>
    public sealed class AdxRequestGuard
    {
        private double _tokens = AdxGuard.MaxRequestsPerMinute;
        private long? _refilledAt;
        private long _blockedUntil;

        /// <summary>Take one request slot. null if the request may go, else seconds to wait.</summary>
        public int? Acquire(long nowMs)
        {
            lock (this)
            {
                if (nowMs < _blockedUntil) return (int)Math.Ceiling((_blockedUntil - nowMs) / 1000.0);
                double cap = AdxGuard.MaxRequestsPerMinute;
                double perMs = cap / 60000.0;
                if (_refilledAt.HasValue) _tokens = Math.Min(cap, _tokens + Math.Max(0L, nowMs - _refilledAt.Value) * perMs);
                _refilledAt = nowMs;
                if (_tokens >= 1.0)
                {
                    _tokens -= 1.0;
                    return null;
                }
                return Math.Max(1, (int)Math.Ceiling((1.0 - _tokens) / perMs / 1000.0));
            }
        }

        /// <summary>Record the server's answer. A 429 opens the breaker for its Retry-After.</summary>
        public void Record(int status, int? retryAfterSeconds, long nowMs)
        {
            if (status != 429) return;
            int seconds = retryAfterSeconds.HasValue && retryAfterSeconds.Value > 0
                ? Math.Min(retryAfterSeconds.Value, AdxGuard.MaxRateLimitBackoffSeconds)
                : AdxGuard.DefaultRateLimitBackoffSeconds;
            lock (this) _blockedUntil = Math.Max(_blockedUntil, nowMs + seconds * 1000L);
        }
    }
}
