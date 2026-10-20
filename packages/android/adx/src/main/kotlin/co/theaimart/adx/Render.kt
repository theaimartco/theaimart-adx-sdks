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
