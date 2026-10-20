using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Theaimart.Adx
{
    /// <summary>Ad request parameters. Exactly one of SlotId (preferred) / SlotName is required.</summary>
    public sealed class AdRequest
    {
        public string SlotId;
        public string SlotName;
        public string PageUrl;
        public string PageKeywords;
        public string UsPrivacy;
        public string EuconsentV2;
        public string IdentityCookie;
        /// <summary>IAB GPP string. Passed through; the backend does not parse it yet.</summary>
        public string Gpp;
        /// <summary>
        /// IAB GPP applicable section ids, e.g. "7" or "7,8". Any US section (7–12) makes the request
        /// contextual-only, like a CCPA opt-out (CONTRACT.md §3).
        /// </summary>
        public string GppSid;
    }

    /// <summary>
    /// Client for the theaimart Ad Network. Zero third-party dependencies (UnityWebRequest + a tiny
    /// bundled JSON parser). Methods are coroutines — run them via `StartCoroutine` on any
    /// MonoBehaviour (e.g. AdxBanner).
    ///
    /// <code>
    /// var adx = new Adx("pk_...");
    /// StartCoroutine(adx.RequestAd(new AdRequest { SlotId = "8b1f-uuid" }, ad => {
    ///     if (ad.Filled) { /* draw it */ }
    /// }));
    /// // Only once the creative is actually drawn AND ≥50% on screen for ≥1s (CONTRACT.md §9c):
    /// StartCoroutine(adx.DeliverViewable(ad.ImpId, ad.Source == AdSource.Internal));
    /// </code>
    /// AdxBanner does all of this — including persisting the _an_id identity — for you.
    /// </summary>
    public sealed class Adx
    {
        private readonly string _apiKey;
        private readonly string _baseUrl;
        private readonly int _timeoutSeconds;
        private readonly string _userAgent;
        private readonly AdxRequestGuard _guard;

        /// <summary>
        /// Why this client refuses to send anything, or null when it is correctly configured (CONTRACT.md
        /// §12). A game must never crash because of an ad SDK, so an unsafe key or base URL disables the
        /// client instead of throwing: every request is a no-fill with reason invalid_config, and nothing
        /// is sent.
        /// </summary>
        public string ConfigError { get; private set; }

        public Adx(
            string apiKey,
            string baseUrl = AdxConstants.DefaultBaseUrl,
            int timeoutSeconds = AdxConstants.DefaultTimeoutSeconds,
            string userAgent = null)
        {
            if (string.IsNullOrEmpty(apiKey)) throw new ArgumentException("apiKey is required and must be non-empty");
            _apiKey = apiKey.Trim();
            string normalized = AdxGuard.NormalizeBaseUrl(baseUrl);
            if (!AdxGuard.IsPublishableKey(_apiKey))
                ConfigError = "apiKey must be a publishable site key (pk_…); never ship an account token or secret";
            else if (normalized == null)
                ConfigError = "baseUrl must be https:// (http only for a local host), with no credentials, query or fragment";
            if (ConfigError != null) Debug.LogWarning("[theaimart-adx] " + ConfigError);
            _baseUrl = normalized ?? (baseUrl ?? "").TrimEnd('/');
            _timeoutSeconds = timeoutSeconds;
            _userAgent = string.IsNullOrEmpty(userAgent) ? DefaultUserAgent() : AdxGuard.SafeHeaderValue(userAgent);
            _guard = AdxGuard.RequestGuardFor(_baseUrl, _apiKey);
        }

        /// <summary>Request an ad. Invokes callback with a normalized Ad (never null); no-fill on error.</summary>
        public IEnumerator RequestAd(AdRequest request, Action<Ad> callback)
        {
            if (ConfigError != null)
            {
                callback?.Invoke(Ad.NoFill(0, AdxGuard.ReasonInvalidConfig));
                yield break;
            }
            // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server. An
            // invalid request (no slot, a SlotId that is not a UUID) is a local no-fill, not an exception.
            List<KeyValuePair<string, string>> parameters = AdxGuard.GuardServeParams(_apiKey, request);
            if (parameters == null)
            {
                callback?.Invoke(Ad.NoFill(0, AdxGuard.ReasonInvalidRequest));
                yield break;
            }
            int? wait = _guard.Acquire(AdxGuard.NowMs());
            if (wait.HasValue)
            {
                callback?.Invoke(Ad.NoFill(0, AdxGuard.ReasonRateLimited, wait));
                yield break;
            }
            string url = _baseUrl + AdxConstants.ServeAdPath + "?" + AdxEncoding.BuildServeQuery(parameters);

            using (UnityWebRequest www = UnityWebRequest.Get(url))
            {
                www.timeout = _timeoutSeconds;
                // No serve endpoint redirects; following one would replay the Cookie to another host.
                www.redirectLimit = 0;
                www.SetRequestHeader("User-Agent", _userAgent);
                www.SetRequestHeader("Accept", "application/json");
                www.SetRequestHeader("X-Adx-Sdk", AdxConstants.SdkIdentifier);
                if (AdxGuard.IsSafeIdentityCookie(request.IdentityCookie))
                {
                    www.SetRequestHeader("Cookie", "_an_id=" + request.IdentityCookie);
                }

                yield return www.SendWebRequest();

                Ad ad;
                if (www.result == UnityWebRequest.Result.ConnectionError ||
                    www.result == UnityWebRequest.Result.DataProcessingError)
                {
                    ad = Ad.NoFill(0);
                }
                else
                {
                    int status = (int)www.responseCode;
                    int? retryAfter = ParseRetryAfter(www.GetResponseHeader("Retry-After"));
                    _guard.Record(status, retryAfter, AdxGuard.NowMs());
                    string cookie = ExtractIdentityCookie(www.GetResponseHeader("Set-Cookie"));
                    byte[] data = www.downloadHandler.data;
                    string body = data != null && data.Length > AdxGuard.MaxResponseBytes ? null : www.downloadHandler.text;
                    ad = Ad.FromJson(status, body, retryAfter, cookie);
                }
                callback?.Invoke(ad);
            }
        }

        /// <summary>
        /// Fire the viewability beacon once. No-ops for a null/empty impId. onOutcome, if given, receives
        /// the classified answer (CONTRACT.md §5): Retry means the view was NOT counted — typically the
        /// beacon beat the impression into the database — and resending the same impId is safe.
        /// </summary>
        public IEnumerator ReportViewable(string impId, Action<ViewableOutcome> onOutcome = null)
        {
            // Only an id the server could have issued is echoed back to it (CONTRACT.md §12).
            if (ConfigError != null || !AdxGuard.IsSafeImpId(impId))
            {
                onOutcome?.Invoke(ViewableOutcome.Drop);
                yield break;
            }
            // impId is [A-Za-z0-9_-] only (checked above), so it needs no JSON escaping.
            byte[] body = System.Text.Encoding.UTF8.GetBytes("{\"imp_id\":\"" + impId + "\"}");
            using (var www = new UnityWebRequest(_baseUrl + AdxConstants.ViewablePath, "POST"))
            {
                www.uploadHandler = new UploadHandlerRaw(body);
                www.downloadHandler = new DownloadHandlerBuffer();
                www.timeout = _timeoutSeconds;
                www.redirectLimit = 0;
                www.SetRequestHeader("Content-Type", "application/json");
                www.SetRequestHeader("User-Agent", _userAgent);
                www.SetRequestHeader("X-Adx-Sdk", AdxConstants.SdkIdentifier);
                yield return www.SendWebRequest();

                int status = www.result == UnityWebRequest.Result.ConnectionError ? 0 : (int)www.responseCode;
                string text = www.downloadHandler != null ? www.downloadHandler.text : null;
                onOutcome?.Invoke(AdxViewable.Classify(status, text));
            }
        }

        /// <summary>
        /// Deliver a measured view: send the beacon and, while the server answers Retry, resend after
        /// 1 s, 2 s and 4 s, then give up (CONTRACT.md §5). Pass retryable: false for anything but an
        /// internal impression — an OpenRTB win is sent once. Runs as long as the MonoBehaviour that
        /// started it stays active.
        /// </summary>
        public IEnumerator DeliverViewable(string impId, bool retryable)
        {
            if (string.IsNullOrEmpty(impId)) yield break;
            for (int attempt = 0; ; attempt++)
            {
                ViewableOutcome outcome = ViewableOutcome.Drop;
                yield return ReportViewable(impId, o => outcome = o);
                if (!AdxViewable.ShouldResend(outcome, retryable, attempt)) yield break;
                yield return new WaitForSecondsRealtime(AdxViewable.RetryDelaysSeconds[attempt]);
            }
        }

        /// <summary>Build a click-tracker URL. Rarely needed — prefer ad.Creative.ClickUrl.</summary>
        public string ClickUrl(string impId)
        {
            return _baseUrl + AdxConstants.ClickPath + "?id=" + AdxEncoding.PercentEncodeAll(impId);
        }

        /// <summary>
        /// Fraud-safe User-Agent (CONTRACT.md §6): avoids every backend bot substring and includes an
        /// Android/iPhone token so the server classifies the device correctly.
        /// </summary>
        public static string DefaultUserAgent()
        {
            string token;
            if (Application.platform == RuntimePlatform.Android) token = "Android";
            else if (Application.platform == RuntimePlatform.IPhonePlayer) token = "iPhone";
            else token = Application.platform.ToString();
            return "theaimart-adx-unity/" + AdxConstants.Version + " (" + token + ")";
        }

        /// <summary>Only http/https click URLs may be opened — rejects javascript:/file:/intent: payloads.</summary>
        public static bool IsSafeHttpUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;
            string lowered = url.TrimStart().ToLowerInvariant();
            return lowered.StartsWith("http://") || lowered.StartsWith("https://");
        }

        internal static int? ParseRetryAfter(string value)
        {
            if (!string.IsNullOrEmpty(value) && int.TryParse(value.Trim(), out int n)) return n;
            return null;
        }

        internal static string ExtractIdentityCookie(string setCookie)
        {
            if (string.IsNullOrEmpty(setCookie)) return null;
            foreach (string segment in setCookie.Split(';'))
            {
                string trimmed = segment.Trim();
                if (trimmed.StartsWith("_an_id="))
                {
                    string value = trimmed.Substring("_an_id=".Length);
                    return AdxGuard.IsSafeIdentityCookie(value) ? value : null;
                }
            }
            return null;
        }
    }
}
