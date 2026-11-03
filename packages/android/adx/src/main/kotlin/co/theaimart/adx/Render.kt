package co.theaimart.adx

/**
 * The §9c render gate, as a pure decision — CONTRACT.md §9c.
 *
 * Every SDK asks this one question before it draws anything, and the answer is the *only* thing
 * allowed to arm the viewability beacon. [RenderPlan.NONE] means this surface cannot draw the
 * creative, so it is not an impression: no beacon, and the slot backs off and refills (§9a).
 *
 * Deliberately free of `android.net.Uri` so the rule is exercised by plain JVM unit tests.
 */
public enum class RenderPlan {
    /** Draw `creative.html` in a sandboxed WebView. */
    HTML,

    /** Draw `creative.assetUrl` as an image. */
    IMAGE,

    /** Nothing can be drawn — not an impression. */
    NONE,
}

/** Only http/https URLs may be loaded or opened — rejects `javascript:`/`file:`/`data:`/`intent:`. */
public fun isSafeHttpUrl(url: String?): Boolean {
    if (url == null) return false
    val lowered = url.trim().lowercase()
    return lowered.startsWith("http://") || lowered.startsWith("https://")
}

/** @param canRenderHtml whether this surface actually has a WebView available right now. */
public fun renderPlan(ad: Ad?, canRenderHtml: Boolean): RenderPlan {
    if (ad == null || !ad.filled || ad.creative == null) return RenderPlan.NONE
    val creative = ad.creative
    if (ad.kind == AdKind.HTML) {
        // An OpenRTB creative with no WebView to put it in is a fill we cannot show.
        val html = creative.html
        return if (!html.isNullOrEmpty() && canRenderHtml) RenderPlan.HTML else RenderPlan.NONE
    }
    // §4e: a hostile asset URL is dropped, and a dropped creative is not an impression.
    return if (isSafeHttpUrl(creative.assetUrl)) RenderPlan.IMAGE else RenderPlan.NONE
}

/** What to do with a navigation an html/openrtb creative starts — CONTRACT.md §4e. */
public enum class CreativeNavigation {
    /** Let the WebView load it. Only ever a sub-frame inside the creative. */
    ALLOW,

    /** A click-through: open it in the browser and refuse the in-WebView navigation. */
    OPEN_EXTERNALLY,

    /** Refuse it and do nothing. */
    BLOCK,
}

/**
 * How long after the user's last touch on the creative a top-level navigation still counts as
 * theirs. Ad click handlers commonly fire a tracker and redirect a few hundred ms later.
 */
public const val CREATIVE_GESTURE_WINDOW_MS: Long = 2_000L

/**
 * The §4e navigation rule. Two properties matter:
 *
 *  * **Nothing leaves the app without a tap.** A top-level navigation with no user gesture
 *    behind it is a forced redirect — the classic malvertising move of throwing the user into
 *    a scam page or an app store the moment the ad loads. It is blocked, not opened.
 *  * **The banner itself is never navigated.** A tapped top-level http/https navigation is a
 *    click-through and opens outside the ad surface; anything else is dropped.
 *
 * A sub-frame inside the creative (an OpenRTB tag's own iframes) may load http/https/about
 * content in place, because that never leaves the ad's box — but never another scheme.
 */
public fun creativeNavigation(url: String?, isMainFrame: Boolean, userGesture: Boolean): CreativeNavigation {
    if (url == null) return CreativeNavigation.BLOCK
    val safe = isSafeHttpUrl(url)
    if (!isMainFrame) {
        val inPlace = safe || url.trim().lowercase().startsWith("about:")
        return if (inPlace) CreativeNavigation.ALLOW else CreativeNavigation.BLOCK
    }
    return if (safe && userGesture) CreativeNavigation.OPEN_EXTERNALLY else CreativeNavigation.BLOCK
}
