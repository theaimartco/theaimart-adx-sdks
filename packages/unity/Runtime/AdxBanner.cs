using System;
using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace Theaimart.Adx
{
    /// <summary>
    /// A drop-in banner component. Attach to a UI GameObject with a <see cref="RawImage"/> (inside
    /// a Canvas with an EventSystem). Implements CONTRACT.md §9 in full:
    ///
    /// <list type="bullet">
    /// <item><b>§9a continuous fill</b> — set <see cref="refreshSeconds"/> and the slot keeps
    /// itself filled, backing off exponentially (30s → 300s) whenever a cycle does not render, so
    /// one no-fill never leaves the slot permanently dark. Leave it 0 for a single shot.</item>
    /// <item><b>§9b visibility gating</b> — no request is made while the app is paused or
    /// unfocused, or while a drawn ad is off screen.</item>
    /// <item><b>§9c</b> — the viewability beacon is armed <b>only</b> by a creative that actually
    /// drew. A texture that failed to download, a creative rejected by the §4e scheme allowlist,
    /// and (on this surface) every html/openrtb fill are reported through
    /// <see cref="onAdFailed"/> and are <i>not</i> impressions.</item>
    /// </list>
    ///
    /// <c>RawImage</c> cannot draw OpenRTB html markup, so this component asks the render gate
    /// with <c>canRenderHtml: false</c>. Use a WebView plugin if you need OpenRTB demand.
    /// </summary>
    [RequireComponent(typeof(RawImage))]
    public sealed class AdxBanner : MonoBehaviour, IPointerClickHandler
    {
        [Tooltip("Publisher api_key (pk_...)")]
        public string apiKey;

        [Tooltip("Ad slot id (preferred). If empty, the GameObject name is used as slot_name.")]
        public string slotId;

        [Tooltip("Ad server base URL. Leave default for production.")]
        public string baseUrl = AdxConstants.DefaultBaseUrl;

        [Tooltip("Continuous fill: seconds between refreshes, clamped up to 30. 0 = single shot.")]
        public int refreshSeconds = 0;

        [Header("Privacy (from your CMP)")]
        [Tooltip("IAB US Privacy (CCPA) string, e.g. 1YNN.")]
        public string usPrivacy;

        [Tooltip("IAB TCF v2 consent string.")]
        public string euconsentV2;

        [Tooltip("IAB GPP string.")]
        public string gpp;

        [Tooltip("IAB GPP applicable section ids, e.g. 7. Any US section (7-12) makes serving contextual-only.")]
        public string gppSid;

        [Header("Appearance (visual only)")]
        [Tooltip("Fit the creative inside the existing RectTransform without stretching it.")]
        public bool preserveAspect = true;

        [Range(0f, 1f)]
        [Tooltip("Creative fade-in duration in unscaled seconds.")]
        public float fadeInSeconds = 0.18f;

        /// <summary>Optional callbacks (assign from code).</summary>
        public Action<Ad> onAdLoaded;

        /// <summary>Called whenever a cycle produced nothing drawable — see §9c.</summary>
        public Action<string> onAdFailed;

        private Adx _adx;
        private Ad _ad;
        private RawImage _image;
        private AspectRatioFitter _aspectFitter;
        private Texture2D _ownedTexture;
        private Color _visibleColor;
        private string _clickUrl;

        private bool _rendered;
        private bool _beaconFired;
        private float _visibleSince = -1f;

        // Continuous fill (§9a/§9b).
        private int _failures;
        private float _dueAt = -1f;
        private int _cycle;
        private int _settledCycle = -1;
        private bool _appActive = true;
        private float _nextTickAt;

        private void Start()
        {
            _image = GetComponent<RawImage>();
            _visibleColor = _image.color;
            _image.enabled = false;
            _image.raycastTarget = false;
            if (preserveAspect)
            {
                _aspectFitter = GetComponent<AspectRatioFitter>();
                if (_aspectFitter == null) _aspectFitter = gameObject.AddComponent<AspectRatioFitter>();
                _aspectFitter.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            }
            _adx = new Adx(apiKey, baseUrl);
            RequestCycle();
        }

        private void RequestCycle()
        {
            _cycle++;
            int myCycle = _cycle;
            _rendered = false;
            _beaconFired = false;
            _visibleSince = -1f;
            _clickUrl = null;

            string identity = LoadIdentity();
            var request = new AdRequest
            {
                SlotId = string.IsNullOrEmpty(slotId) ? null : slotId,
                SlotName = string.IsNullOrEmpty(slotId) ? name : null,
                UsPrivacy = NullIfEmpty(usPrivacy),
                EuconsentV2 = NullIfEmpty(euconsentV2),
                Gpp = NullIfEmpty(gpp),
                GppSid = NullIfEmpty(gppSid),
                IdentityCookie = identity,
            };
            StartCoroutine(_adx.RequestAd(request, ad =>
            {
                SaveIdentity(ad.SetIdentityCookie, identity);
                OnAd(ad, myCycle);
            }));
        }

        // CONTRACT.md §3 — keep the server's _an_id across requests and launches, so frequency caps
        // hold. Without it every request is a brand-new user to the server. On WebGL the browser
        // owns cookies (and refuses a script-set Cookie header), so persistence is skipped there.
        private const string IdentityPrefsKey = "theaimart_adx_an_id";

        private static string LoadIdentity()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return null;
#else
            string value = PlayerPrefs.GetString(IdentityPrefsKey, "");
            return AdxViewable.IsStorableIdentity(value) ? value : null;
#endif
        }

        private static void SaveIdentity(string issued, string sent)
        {
#if !(UNITY_WEBGL && !UNITY_EDITOR)
            if (issued == null || issued == sent || !AdxViewable.IsStorableIdentity(issued)) return;
            PlayerPrefs.SetString(IdentityPrefsKey, issued);
            PlayerPrefs.Save();
#endif
        }

        private static string NullIfEmpty(string value)
        {
            return string.IsNullOrEmpty(value) ? null : value;
        }

        private void OnAd(Ad ad, int forCycle)
        {
            if (forCycle != _cycle) return;
            _ad = ad;

            // canRenderHtml: false — a RawImage cannot show OpenRTB markup, so such a fill is
            // refused here rather than silently counted as a view of an invisible ad (§9c).
            RenderPlan plan = AdxRender.Plan(ad, false);
            if (plan == RenderPlan.Image)
            {
                _clickUrl = ad.Creative.ClickUrl;
                if (_aspectFitter != null && ad.Creative.Height > 0)
                {
                    _aspectFitter.aspectRatio = (float)ad.Creative.Width / ad.Creative.Height;
                }
                StartCoroutine(LoadTexture(ad.Creative.AssetUrl, ad, forCycle));
                return;
            }

            SetVisible(false);
            MarkRendered(false, ad, forCycle);
        }

        private IEnumerator LoadTexture(string url, Ad ad, int forCycle)
        {
            // nonReadable releases the texture's CPU-side copy after upload, roughly halving
            // creative memory on mobile GPUs.
            using (UnityWebRequest www = UnityWebRequestTexture.GetTexture(url, true))
            {
                yield return www.SendWebRequest();
                if (forCycle != _cycle) yield break;

                if (www.result == UnityWebRequest.Result.Success)
                {
                    ReplaceTexture(DownloadHandlerTexture.GetContent(www));
                    SetVisible(true);
                    yield return FadeIn(forCycle);
                    if (forCycle != _cycle) yield break;
                    MarkRendered(true, ad, forCycle);
                }
                else
                {
                    // §9c: an empty box is not an impression. Hide it and let §9a refill.
                    SetVisible(false);
                    MarkRendered(false, ad, forCycle);
                }
            }
        }

        /// <summary>
        /// Show/hide the creative *without* deactivating the GameObject — a disabled GameObject
        /// stops receiving <c>Update</c>, which would kill the very refresh loop that is supposed
        /// to recover the slot.
        /// </summary>
        private void SetVisible(bool visible)
        {
            if (_image == null) return;
            _image.enabled = visible;
            _image.raycastTarget = visible && Adx.IsSafeHttpUrl(_clickUrl);
            if (!visible)
            {
                ReleaseTexture();
                _image.color = _visibleColor;
            }
        }

        private void ReplaceTexture(Texture2D texture)
        {
            ReleaseTexture();
            _ownedTexture = texture;
            if (_image != null) _image.texture = texture;
        }

        private void ReleaseTexture()
        {
            if (_image != null && _image.texture == _ownedTexture) _image.texture = null;
            if (_ownedTexture != null) Destroy(_ownedTexture);
            _ownedTexture = null;
        }

        private void OnDestroy()
        {
            _cycle++;
            StopAllCoroutines();
            ReleaseTexture();
        }

        private IEnumerator FadeIn(int forCycle)
        {
            if (_image == null || fadeInSeconds <= 0f)
            {
                if (_image != null) _image.color = _visibleColor;
                yield break;
            }
            float started = Time.unscaledTime;
            while (forCycle == _cycle)
            {
                float progress = Mathf.Clamp01((Time.unscaledTime - started) / fadeInSeconds);
                Color color = _visibleColor;
                color.a = _visibleColor.a * (1f - Mathf.Pow(1f - progress, 3f));
                _image.color = color;
                if (progress >= 1f) yield break;
                yield return null;
            }
        }

        private void MarkRendered(bool ok, Ad ad, int forCycle)
        {
            if (forCycle != _cycle) return;
            _rendered = ok;
            if (ok)
            {
                if (onAdLoaded != null) onAdLoaded(ad);
            }
            else if (onAdFailed != null)
            {
                onAdFailed(ad.Filled ? "creative could not be rendered" : (ad.Reason ?? "no fill"));
            }
            Settle(ok, ad.RetryAfterSeconds, forCycle);
        }

        /// <summary>§9a — once a cycle settles, decide when (or whether) to ask again.</summary>
        private void Settle(bool ok, int? retryAfterSeconds, int forCycle)
        {
            if (_settledCycle == forCycle) return;
            _settledCycle = forCycle;
            _failures = ok ? 0 : _failures + 1;

            int? delay = AdxSchedule.NextDelaySeconds(ok, _failures, retryAfterSeconds, refreshSeconds);
            _dueAt = delay.HasValue ? Time.unscaledTime + delay.Value : -1f;
            _nextTickAt = Time.unscaledTime;
        }

        private void Update()
        {
            bool tracking = _rendered && _ad != null && _ad.IsTrackable && !_beaconFired &&
                !string.IsNullOrEmpty(_ad.ImpId);
            if (!tracking && _dueAt < 0f) return;
            if (Time.unscaledTime < _nextTickAt) return;
            if (!_appActive)
            {
                _visibleSince = -1f;
                _nextTickAt = Time.unscaledTime + 1f;
                return;
            }

            float ratio = VisibleFraction();

            // §9c: only a cycle that actually drew arms the beacon.
            if (_rendered && _ad != null && _ad.IsTrackable && !_beaconFired &&
                !string.IsNullOrEmpty(_ad.ImpId))
            {
                if (ratio >= 0.5f)
                {
                    if (_visibleSince < 0f)
                    {
                        _visibleSince = Time.unscaledTime;
                    }
                    else if (Time.unscaledTime - _visibleSince >= 1f)
                    {
                        _beaconFired = true;
                        // Resent if the server answers retry (§5); a late delivery is still this view.
                        StartCoroutine(_adx.DeliverViewable(_ad.ImpId, _ad.Source == AdSource.Internal));
                    }
                }
                else
                {
                    _visibleSince = -1f;
                }
            }

            MaybeAdvance(ratio > 0f);

            tracking = _rendered && _ad != null && _ad.IsTrackable && !_beaconFired &&
                !string.IsNullOrEmpty(_ad.ImpId);
            if (tracking)
            {
                _nextTickAt = Time.unscaledTime + 0.25f;
            }
            else if (_dueAt >= 0f)
            {
                _nextTickAt = Mathf.Max(Time.unscaledTime + 0.25f, _dueAt);
            }
        }

        private void MaybeAdvance(bool onScreen)
        {
            if (_dueAt < 0f) return;
            // §9b: nothing is requested while the app is paused or unfocused…
            if (!_appActive) return;
            // …and a drawn ad that is off screen waits, while a slot showing nothing must still
            // be able to recover.
            if (_rendered && !onScreen) return;
            if (Time.unscaledTime < _dueAt) return;
            _dueAt = -1f;
            RequestCycle();
        }

        private void OnApplicationPause(bool paused)
        {
            _appActive = !paused;
            if (_appActive) _nextTickAt = Time.unscaledTime;
        }

        private void OnApplicationFocus(bool focused)
        {
            _appActive = focused;
            if (_appActive) _nextTickAt = Time.unscaledTime;
        }

        private float VisibleFraction()
        {
            // Nothing drawn means nothing visible, whatever the rect says.
            if (_image == null || !_image.enabled) return 0f;

            var rt = transform as RectTransform;
            if (rt == null) return 0f;
            var corners = new Vector3[4];
            rt.GetWorldCorners(corners);
            // Screen-space canvases report world corners in screen pixels.
            float minX = Mathf.Min(corners[0].x, corners[2].x);
            float maxX = Mathf.Max(corners[0].x, corners[2].x);
            float minY = Mathf.Min(corners[0].y, corners[2].y);
            float maxY = Mathf.Max(corners[0].y, corners[2].y);
            float w = maxX - minX;
            float h = maxY - minY;
            if (w <= 0f || h <= 0f) return 0f;
            float visX = Mathf.Min(maxX, Screen.width) - Mathf.Max(minX, 0f);
            float visY = Mathf.Min(maxY, Screen.height) - Mathf.Max(minY, 0f);
            if (visX <= 0f || visY <= 0f) return 0f;
            return (visX * visY) / (w * h);
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            // §4e: only http/https click URLs are opened — javascript:/file: are rejected.
            if (_rendered && Adx.IsSafeHttpUrl(_clickUrl))
            {
                Application.OpenURL(_clickUrl);
            }
        }
    }
}
