package co.theaimart.adx

import android.os.Build
import android.os.Handler
import android.os.Looper
import co.theaimart.adx.internal.Http
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/** Ad request parameters. Exactly one of [slotId] (preferred) / [slotName] is required. */
public data class AdRequest(
    val slotId: String? = null,
    val slotName: String? = null,
    val pageUrl: String? = null,
    val pageKeywords: String? = null,
    val usPrivacy: String? = null,
    val euconsentV2: String? = null,
    /** Previously stored `_an_id` value, for stable identity / frequency capping. */
    val identityCookie: String? = null,
    /** IAB GPP string. Passed through; the backend does not parse it yet. */
    val gpp: String? = null,
    /**
     * IAB GPP applicable section ids, e.g. `"7"` or `"7,8"`. Any US section (7–12) makes the
     * request contextual-only, like a CCPA opt-out (CONTRACT.md §3).
     */
    val gppSid: String? = null,
)

/**
 * Client for the theaimart Ad Network. Zero third-party dependencies.
 *
 * ```kotlin
 * val adx = Adx(apiKey = "pk_...")
 * adx.requestAd(AdRequest(slotId = "8b1f-uuid")) { ad ->
 *     if (ad.filled) { /* render ad.creative */ }
 * }
 * // Only once the creative is actually drawn AND ≥50% on screen for ≥1s (CONTRACT.md §9c):
 * adx.deliverViewable(impId, retryable = ad.source == AdSource.INTERNAL)
 * ```
 *
 * [BannerAdView] does all of this — including persisting the `_an_id` identity — for you.
 *
 * Callbacks are delivered on the main thread. For coroutine users, wrap [requestAdBlocking] in
 * `withContext(Dispatchers.IO) { … }`.
 */
public class Adx @JvmOverloads constructor(
    private val apiKey: String,
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
    private val userAgent: String = defaultUserAgent(),
    private val executor: Executor = defaultExecutor,
) {
    init {
        require(apiKey.isNotEmpty()) { "apiKey is required and must be non-empty" }
    }

    private val key: String = apiKey.trim()
    private val normalizedBase: String = Guard.normalizeBaseUrl(baseUrl) ?: baseUrl.trimEnd('/')

    /**
     * Why this client refuses to send anything, or null when it is correctly configured
     * (CONTRACT.md §12). An app must never crash because of an ad SDK, so an unsafe key or base
     * URL disables the client instead of throwing: every request is a no-fill with reason
     * `invalid_config`, and nothing is sent.
     */
    public val configError: String? = when {
        !Guard.isPublishableKey(key) ->
            "apiKey must be a publishable site key (pk_…); never ship an account token or secret"
        Guard.normalizeBaseUrl(baseUrl) == null ->
            "baseUrl must be https:// (http only for a local host), with no credentials, query or fragment"
        else -> null
    }

    private val guard: RequestGuard = Guard.requestGuardFor(normalizedBase, key)

    init {
        configError?.let { android.util.Log.e("theaimart-adx", it) }
    }

    /** Callback for [requestAd]. */
    public fun interface AdCallback {
        public fun onResult(ad: Ad)
    }

    /** Request an ad; the callback is invoked on the main thread. Never throws for a no-fill. */
    @JvmOverloads
    public fun requestAd(request: AdRequest, userAgentOverride: String? = null, callback: AdCallback) {
        executor.execute {
            val ad = requestAdBlocking(request, userAgentOverride)
            mainHandler.post { callback.onResult(ad) }
        }
    }

    /**
     * Blocking ad request. Call from a background thread. Fail-closed and never throws: an
     * invalid request (no slot, a `slotId` that is not a UUID) is a local no-fill with reason
     * `invalid_request` — it used to `require()`, which crashed the app from the executor thread.
     */
    @Suppress("TooGenericExceptionCaught")
    public fun requestAdBlocking(request: AdRequest, userAgentOverride: String? = null): Ad {
        if (configError != null) return Ad.noFill(httpStatus = 0, reason = Guard.REASON_INVALID_CONFIG)
        // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server.
        val params = Guard.guardServeParams(key, request)
            ?: return Ad.noFill(httpStatus = 0, reason = Guard.REASON_INVALID_REQUEST)
        guard.acquire(System.currentTimeMillis())?.let { wait ->
            return Ad.noFill(httpStatus = 0, reason = Guard.REASON_RATE_LIMITED, retryAfterSeconds = wait)
        }
        val url = "$normalizedBase$SERVE_AD_PATH?${Encoding.buildServeQuery(params)}"
        val headers = buildMap {
            put("User-Agent", userAgentOverride?.let(Guard::safeHeaderValue) ?: userAgent)
            put("Accept", "application/json")
            put("X-Adx-Sdk", SDK_IDENTIFIER)
            request.identityCookie?.takeIf(Guard::isSafeIdentityCookie)?.let { put("Cookie", "_an_id=$it") }
        }
        return try {
            val resp = Http.get(url, headers, timeoutMs)
            guard.record(resp.status, resp.retryAfter, System.currentTimeMillis())
            Ad.fromJson(resp.status, resp.body, resp.retryAfter, extractIdentityCookie(resp.setCookie))
        } catch (_: Throwable) {
            Ad.noFill(httpStatus = 0)
        }
    }

    /**
     * Request an ad using, and refreshing, a persisted `_an_id` (CONTRACT.md §3). The store is
     * only read and written on the executor thread, never on the UI thread. An explicit
     * [AdRequest.identityCookie] wins and is never overwritten in the store.
     */
    internal fun requestAd(request: AdRequest, identity: IdentityStore, callback: AdCallback) {
        executor.execute {
            val explicit = request.identityCookie != null
            val stored = if (explicit) null else runCatching { identity.load() }.getOrNull()
            val effective = if (isStorableIdentity(stored)) request.copy(identityCookie = stored) else request
            val ad = requestAdBlocking(effective)
            val issued = ad.setIdentityCookie
            if (!explicit && issued != null && issued != stored && isStorableIdentity(issued)) {
                runCatching { identity.save(issued) }
            }
            mainHandler.post { callback.onResult(ad) }
        }
    }

    /** Fire the viewability beacon once (async, best-effort). No-ops for a null/blank [impId]. */
    public fun reportViewable(impId: String?) {
        if (impId.isNullOrEmpty()) return
        executor.execute { reportViewableBlocking(impId) }
    }

    /**
     * Send the viewability beacon once and classify the answer (CONTRACT.md §5). Call from a
     * background thread. [ViewableOutcome.RETRY] means the view was NOT counted — typically the
     * beacon beat the impression into the database — and resending the same [impId] is safe.
     */
    @Suppress("TooGenericExceptionCaught")
    public fun reportViewableBlocking(impId: String?): ViewableOutcome {
        // Only an id the server could have issued is echoed back to it (CONTRACT.md §12).
        if (configError != null || !Guard.isSafeImpId(impId)) return ViewableOutcome.DROP
        return try {
            val headers = mapOf(
                "Content-Type" to "application/json",
                "User-Agent" to userAgent,
                "X-Adx-Sdk" to SDK_IDENTIFIER,
            )
            // impId is `[A-Za-z0-9_-]` only (checked above), so it needs no JSON escaping.
            val body = "{\"imp_id\":\"$impId\"}".toByteArray(Charsets.UTF_8)
            val resp = Http.post("$normalizedBase$VIEWABLE_PATH", headers, body, timeoutMs)
            viewableOutcome(resp.status, resp.body)
        } catch (_: Throwable) {
            viewableOutcome(0, null)
        }
    }

    /**
     * Deliver a measured view (async): send the beacon and, while the server answers `retry`,
     * resend after 1 s, 2 s and 4 s, then give up (CONTRACT.md §5). Pass `retryable = false`
     * for anything but an internal impression — an OpenRTB win is sent once.
     */
    public fun deliverViewable(impId: String?, retryable: Boolean) {
        if (impId.isNullOrEmpty()) return
        executor.execute {
            runCatching {
                deliverWithRetry(retryable, { reportViewableBlocking(impId) }, { Thread.sleep(it) })
            }
        }
    }

    /** Build a click-tracker URL. Rarely needed — prefer `ad.creative.clickUrl`. */
    public fun clickUrl(impId: String): String =
        "$normalizedBase$CLICK_PATH?id=${Encoding.percentEncodeAll(impId)}"

    internal fun userAgentOrDefault(): String = userAgent

    public companion object {
        private val mainHandler = Handler(Looper.getMainLooper())
        private val defaultExecutor: Executor = Executors.newCachedThreadPool()

        /**
         * Fraud-safe User-Agent (CONTRACT.md §6): avoids every backend bot substring and includes
         * an `Android` token so the server classifies the device as mobile.
         */
        public fun defaultUserAgent(): String {
            val release = Build.VERSION.RELEASE ?: ""
            val model = Build.MODEL ?: ""
            return "theaimart-adx-android/$SDK_VERSION (Android $release; $model)"
        }

        private fun extractIdentityCookie(setCookie: String?): String? {
            if (setCookie.isNullOrEmpty()) return null
            for (segment in setCookie.split(";")) {
                val trimmed = segment.trim()
                if (trimmed.startsWith("_an_id=")) {
                    return trimmed.removePrefix("_an_id=").takeIf(Guard::isSafeIdentityCookie)
                }
            }
            return null
        }

    }
}
