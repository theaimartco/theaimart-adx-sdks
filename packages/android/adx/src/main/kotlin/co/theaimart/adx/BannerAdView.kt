package co.theaimart.adx

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * A drop-in banner view. Requests an ad, renders it (image via [ImageView] with a click-through,
 * or html/openrtb via a sandboxed [WebView]), and implements CONTRACT.md §9 in full:
 *
 *  * **§9a continuous fill** — set [refreshSeconds] and the slot keeps itself filled, backing off
 *    exponentially (30s → 300s) whenever a cycle does not render, so one no-fill never leaves the
 *    slot permanently dark. Leave it 0 for a single shot.
 *  * **§9b visibility gating** — no request is made while the window is hidden (app backgrounded)
 *    or a drawn ad is scrolled off screen; it resumes, firing at once if overdue, when shown again.
 *  * **§9c** — the viewability beacon is armed **only** by a creative that actually attached. An
 *    image whose download failed, or a creative rejected by the §4e scheme allowlist, is reported
 *    through [onAdFailed] and is *not* an impression.
 *  * **§3 identity** — the server's `_an_id` is kept in `SharedPreferences` and resent, so
 *    frequency caps hold across requests and launches. `HttpURLConnection` has no cookie jar of
 *    its own; without this every request was a brand-new user to the server.
 *  * **§5 beacon delivery** — a beacon the server answers `retry` (it arrived before the
 *    impression row was written) is resent, so a measured view is not lost.
 *  * **§4e navigation** — html/openrtb creatives render in a WebView with file and content access
 *    off, no JavaScript bridge, and a [CreativeWebViewClient] that lets a creative-initiated
 *    navigation reach only `http`/`https`, and only in the browser. Without that client the
 *    WebView would hand `intent://` and friends to the OS as an Intent.
 *
 * ```kotlin
 * val banner = BannerAdView(context)
 * banner.refreshSeconds = 60          // continuous fill
 * banner.load(Adx(apiKey = "pk_..."), AdRequest(slotId = "8b1f-uuid"))
 * container.addView(banner)
 * // when the host screen goes away:
 * banner.destroy()
 * ```
 */
public class BannerAdView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : FrameLayout(context, attrs, defStyleAttr) {

    private val ui = Handler(Looper.getMainLooper())

    private var adx: Adx? = null
    private var pendingRequest: AdRequest? = null
    private var currentAd: Ad? = null
    private var currentBitmap: Bitmap? = null

    private var rendered = false
    private var beaconFired = false
    private var visibleSinceMs = 0L

    // Continuous fill (§9a/§9b).
    private var failures = 0
    private var dueAtMs = 0L
    private var cycle = 0
    private var settledCycle = -1
    private var driver: Runnable? = null
    private var destroyed = false

    private val identityStore: IdentityStore = SharedPrefsIdentityStore(context)

    /**
     * Continuous-fill interval in seconds (CONTRACT.md §9a); clamped up to
     * [MIN_REFRESH_SECONDS]. 0 (the default) is a single shot.
     */
    public var refreshSeconds: Int = 0

    /** Visual-only surface options. They never affect request or tracking behavior. */
    public var cornerRadiusDp: Float = 12f
        set(value) {
            field = value.coerceIn(0f, 48f)
            applySurfaceStyle()
        }

    public var surfaceColor: Int? = null
        set(value) {
            field = value
            applySurfaceStyle()
        }

    public var elevated: Boolean = true
        set(value) {
            field = value
            applySurfaceStyle()
        }

    /** Optional callbacks. */
    public var onAdLoaded: ((Ad) -> Unit)? = null
    public var onAdFailed: ((String) -> Unit)? = null

    init {
        applySurfaceStyle()
    }

    /** Request and render an ad. Safe to call again to restart the loop with a new request. */
    public fun load(client: Adx, request: AdRequest) {
        adx = client
        pendingRequest = request
        failures = 0
        dueAtMs = 0L
        requestCycle()
    }

    /**
     * Stop the loop for good. Call from the host Activity/Fragment teardown. Detaching the view
     * only *suspends* the loop, so a recycled view resumes correctly.
     */
    public fun destroy() {
        destroyed = true
        cycle += 1
        stopDriver()
        clearCreativeViews()
        currentAd = null
        dueAtMs = 0L
    }

    private fun requestCycle() {
        val client = adx ?: return
        val request = pendingRequest ?: return
        if (destroyed) return

        val myCycle = ++cycle
        rendered = false
        beaconFired = false
        visibleSinceMs = 0L

        client.requestAd(request, identityStore) { ad ->
            if (destroyed || myCycle != cycle) return@requestAd
            render(ad, myCycle)
        }
    }

    private fun render(ad: Ad, forCycle: Int) {
        currentAd = ad
        clearCreativeViews()

        when (renderPlan(ad, canRenderHtml = true)) {
            RenderPlan.HTML -> {
                visibility = VISIBLE
                renderHtml(ad.creative?.html.orEmpty())
                markRendered(true, ad, forCycle)
            }
            RenderPlan.IMAGE -> {
                visibility = VISIBLE
                // Settles asynchronously: an image only counts once its bytes actually decoded.
                renderImage(ad, forCycle)
            }
            RenderPlan.NONE -> {
                visibility = GONE
                markRendered(false, ad, forCycle)
            }
        }
    }

    private fun markRendered(ok: Boolean, ad: Ad, forCycle: Int) {
        if (destroyed || forCycle != cycle) return
        rendered = ok
        if (ok) {
            onAdLoaded?.invoke(ad)
        } else {
            onAdFailed?.invoke(
                if (ad.filled) "creative could not be rendered" else (ad.reason ?: "no fill"),
            )
        }
        settle(ok, ad.retryAfterSeconds, forCycle)
        startDriver()
    }

    /** §9a — once a cycle settles, decide when (or whether) to ask again. */
    private fun settle(ok: Boolean, retryAfterSeconds: Int?, forCycle: Int) {
        if (settledCycle == forCycle) return
        settledCycle = forCycle
        failures = if (ok) 0 else failures + 1
        val delay = nextDelaySeconds(ok, failures, retryAfterSeconds, refreshSeconds)
        dueAtMs = if (delay == null) 0L else System.currentTimeMillis() + delay * 1000L
    }

    private fun renderHtml(html: String) {
        val navigationPolicy = CreativeWebViewClient()
        val webView = WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            // Lock the WebView down: no local file/content access for a remote creative.
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            @Suppress("DEPRECATION")
            settings.allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            settings.allowUniversalAccessFromFileURLs = false
            // `window.open` has nowhere to go, so a creative cannot spawn a second surface;
            // the navigation it attempts instead lands in the client below.
            settings.setSupportMultipleWindows(false)
            settings.javaScriptCanOpenWindowsAutomatically = false
            webViewClient = navigationPolicy
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            setBackgroundColor(Color.TRANSPARENT)
            loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        }
        addView(webView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private fun renderImage(ad: Ad, forCycle: Int) {
        val creative = ad.creative ?: return
        val assetUrl = creative.assetUrl ?: return
        val imageView = ImageView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER)
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = creative.headline ?: "Advertisement"
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            alpha = 0f
            creative.clickUrl?.takeIf { isSafeHttpUrl(it) }?.let { url ->
                isClickable = true
                setOnClickListener { openUrl(url) }
            }
        }
        addView(imageView)

        io.execute {
            val raw = try {
                java.net.URL(assetUrl).openConnection().run {
                    connectTimeout = DEFAULT_TIMEOUT_MS
                    readTimeout = DEFAULT_TIMEOUT_MS
                    useCaches = true
                    getInputStream().use { input -> readCreativeBytes(input) }
                }
            } catch (_: Throwable) {
                null
            }
            val bitmap = raw?.let {
                try {
                    decodeCreative(it, creative.width, creative.height)
                } catch (_: Throwable) {
                    null
                }
            }
            ui.post {
                if (destroyed || forCycle != cycle) {
                    bitmap?.recycle()
                    return@post
                }
                if (bitmap != null) {
                    currentBitmap?.recycle()
                    currentBitmap = bitmap
                    imageView.setImageBitmap(bitmap)
                    imageView.animate().alpha(1f).setDuration(FADE_IN_MS).start()
                    markRendered(true, ad, forCycle)
                } else {
                    // §9c: an empty box is not an impression. Hide it and let §9a refill.
                    visibility = GONE
                    markRendered(false, ad, forCycle)
                }
            }
        }
    }

    /**
     * Navigation policy for the creative [WebView] — CONTRACT.md §4e.
     *
     * A WebView with **no** client hands any URL it cannot resolve itself to the OS as an
     * Intent, so a hostile creative navigating to `intent://…`, `market://…`, `tel:` or a
     * custom app scheme can launch arbitrary components on the device. That is the one
     * creative-driven escape the file/content lockdown in [renderHtml] does not close, and it
     * is the reason this client exists. The Web SDK closes it with an iframe `sandbox` and the
     * React Native SDK with `originWhitelist`; this is the Android equivalent.
     *
     * The creative's own markup is loaded with a `null` base URL and is never routed here, and
     * its sub-resources go through `shouldInterceptRequest` instead — so images, scripts and
     * pixels inside the ad are unaffected. Only a *top-level navigation the creative initiates*
     * reaches this point, and there are exactly two outcomes:
     *
     *  * `http`/`https` — a click-through. It opens in the browser via [openUrl] rather than
     *    inside a banner-sized WebView, which is what the web SDK's
     *    `allow-popups-to-escape-sandbox` achieves on that platform.
     *  * anything else — dropped, because no legitimate creative needs it.
     *
     * Both overrides return `true` ("handled"), so the WebView never navigates itself and can
     * never hand a URL to the system on our behalf. [openUrl] re-checks the scheme, so the
     * allowlist is enforced here even though this class never inspects it directly.
     */
    private inner class CreativeWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?,
        ): Boolean {
            request?.url?.toString()?.let { openUrl(it) }
            return true
        }

        // Deprecated on API 24+, but minSdk is 21 and API 21-23 call *only* this overload —
        // without it the policy simply would not apply on those devices.
        @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
            url?.let { openUrl(it) }
            return true
        }
    }

    private fun openUrl(url: String) {
        // §4e: only http/https click URLs are opened — javascript:/file:/intent: are rejected.
        if (!isSafeHttpUrl(url)) return
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (_: Throwable) {
            // no browser / bad url — ignore
        }
    }

    private fun clearCreativeViews() {
        for (index in childCount - 1 downTo 0) {
            when (val child = getChildAt(index)) {
                is WebView -> {
                    child.stopLoading()
                    child.loadUrl("about:blank")
                    child.removeAllViews()
                    child.destroy()
                }
                is ImageView -> child.setImageDrawable(null)
            }
        }
        removeAllViews()
        currentBitmap?.let { if (!it.isRecycled) it.recycle() }
        currentBitmap = null
    }

    private fun applySurfaceStyle() {
        val dark =
            resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
                Configuration.UI_MODE_NIGHT_YES
        val fill = surfaceColor ?: if (dark) Color.rgb(28, 34, 43) else Color.rgb(243, 245, 247)
        val stroke = if (dark) Color.argb(24, 255, 255, 255) else Color.argb(16, 0, 0, 0)
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(cornerRadiusDp)
            setColor(fill)
            setStroke(dp(0.5f).toInt().coerceAtLeast(1), stroke)
        }
        clipToOutline = cornerRadiusDp > 0f
        elevation = if (elevated) dp(6f) else 0f
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    /**
     * One adaptive driver for viewability and refresh. It runs at 4 Hz only for the one-second
     * IAB measurement, sleeps until the refresh deadline, then stops after a single-shot beacon.
     */
    private fun startDriver() {
        if (driver != null || destroyed || !isAttachedToWindow) return
        val delay = nextDriverDelay() ?: return
        val runnable = Runnable {
            driver = null
            if (destroyed) return@Runnable
            tick()
            startDriver()
        }
        driver = runnable
        ui.postDelayed(runnable, delay)
    }

    private fun stopDriver() {
        driver?.let { ui.removeCallbacks(it) }
        driver = null
    }

    private fun tick() {
        val ratio = visibleFraction()
        val ad = currentAd
        val impId = ad?.impId

        // §9c: only a cycle that actually drew arms the beacon.
        if (rendered && ad != null && ad.isTrackable && impId != null && !beaconFired) {
            val now = System.currentTimeMillis()
            if (ratio >= VIEWABILITY_RATIO) {
                if (visibleSinceMs == 0L) {
                    visibleSinceMs = now
                } else if (now - visibleSinceMs >= VIEWABILITY_MS) {
                    beaconFired = true
                    // Outlives this cycle on purpose: a late delivery is still this view (§5).
                    adx?.deliverViewable(impId, retryable = ad.source == AdSource.INTERNAL)
                }
            } else {
                visibleSinceMs = 0L
            }
        }

        maybeAdvance(ratio > 0.0)
    }

    private fun maybeAdvance(onScreen: Boolean) {
        if (dueAtMs == 0L || destroyed) return
        // §9b: nothing is requested while the window is hidden (backgrounded app)…
        if (!isAttachedToWindow || windowVisibility != VISIBLE) return
        // …and a drawn ad that is scrolled away waits, while a slot showing nothing must still
        // be able to recover.
        if (rendered && !onScreen) return
        if (System.currentTimeMillis() < dueAtMs) return
        dueAtMs = 0L
        requestCycle()
    }

    private fun visibleFraction(): Double {
        if (!isShown || width <= 0 || height <= 0) return 0.0
        val rect = Rect()
        if (!getGlobalVisibleRect(rect)) return 0.0
        val visibleArea = rect.width().toLong() * rect.height().toLong()
        val totalArea = width.toLong() * height.toLong()
        return visibleArea.toDouble() / totalArea.toDouble()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        applySurfaceStyle()
        if (adx != null) startDriver()
    }

    override fun onDetachedFromWindow() {
        // Suspend, do not tear down: a recycled view (RecyclerView) reattaches and resumes.
        stopDriver()
        super.onDetachedFromWindow()
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        if (visibility == VISIBLE) startDriver() else stopDriver()
    }

    private fun nextDriverDelay(): Long? {
        val ad = currentAd
        if (rendered && ad?.isTrackable == true && ad.impId != null && !beaconFired) {
            return POLL_MS
        }
        if (dueAtMs == 0L) return null
        val remaining = dueAtMs - System.currentTimeMillis()
        return if (remaining > 0L) remaining else POLL_MS
    }

    private fun readCreativeBytes(input: java.io.InputStream): ByteArray? {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_CREATIVE_BYTES) return null
            output.write(buffer, 0, count)
        }
        return output.toByteArray().takeIf { it.isNotEmpty() }
    }

    private fun decodeCreative(data: ByteArray, targetWidth: Int, targetHeight: Int): android.graphics.Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        val safeWidth = targetWidth.coerceAtLeast(1)
        val safeHeight = targetHeight.coerceAtLeast(1)
        while (bounds.outWidth / (sample * 2) >= safeWidth &&
            bounds.outHeight / (sample * 2) >= safeHeight
        ) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(data, 0, data.size, options)
    }

    private companion object {
        const val VIEWABILITY_RATIO = 0.5
        const val VIEWABILITY_MS = 1000L
        const val POLL_MS = 250L
        const val FADE_IN_MS = 160L
        const val MAX_CREATIVE_BYTES = 5 * 1024 * 1024

        /**
         * One shared daemon pool for creative downloads across every banner — a per-view
         * executor would leak a thread for each row of a scrolling feed.
         */
        val io: ExecutorService = Executors.newFixedThreadPool(4) { r ->
            Thread(r, "adx-banner").apply { isDaemon = true }
        }
    }
}

/**
 * `_an_id` persistence for [BannerAdView] (CONTRACT.md §3). App-wide, so every banner in the app
 * is the same user to the server, which is what frequency capping needs. Only ever called on the
 * client's executor thread, never on the UI thread.
 */
internal class SharedPrefsIdentityStore(context: Context) : IdentityStore {
    private val app: Context = context.applicationContext ?: context

    override fun load(): String? = prefs().getString(KEY, null)

    override fun save(value: String) {
        prefs().edit().putString(KEY, value).apply()
    }

    private fun prefs() = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private companion object {
        const val PREFS = "co.theaimart.adx"
        const val KEY = "an_id"
    }
}
