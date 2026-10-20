package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * CONTRACT.md §9c — the render gate. A fill this surface cannot draw is NOT an impression,
 * so it must never arm the viewability beacon.
 */
class RenderTest {

    private fun imageAd(assetUrl: String): Ad = Ad.fromJson(
        200,
        """{"fill":true,"imp_id":"imp1","creative":{"asset_url":"$assetUrl","click_url":"https://x/c","width":300,"height":250}}""",
    )

    private val htmlBody =
        """{"fill":true,"source":"openrtb","imp_id":"imp1","creative":{"html":"<b>ad</b>","width":300,"height":250}}"""

    @Test
    fun noFillAndTransportErrorsAreNeverRenderable() {
        assertEquals(RenderPlan.NONE, renderPlan(Ad.fromJson(200, """{"fill":false}"""), true))
        assertEquals(RenderPlan.NONE, renderPlan(Ad.fromJson(0, ""), true))
        assertEquals(RenderPlan.NONE, renderPlan(null, true))
    }

    @Test
    fun ordinaryImageCreativeRenders() {
        assertEquals(RenderPlan.IMAGE, renderPlan(imageAd("https://cdn/x.png"), false))
        assertEquals(RenderPlan.IMAGE, renderPlan(imageAd("http://cdn/x.png"), false))
    }

    @Test
    fun hostileAssetUrlIsDropped() {
        for (hostile in listOf(
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:image/png;base64,AAAA",
            "intent://x",
            "content://media/1",
        )) {
            assertEquals(hostile, RenderPlan.NONE, renderPlan(imageAd(hostile), true))
        }
    }

    @Test
    fun openRtbFillRendersOnlyWhereAWebViewExists() {
        assertEquals(RenderPlan.HTML, renderPlan(Ad.fromJson(200, htmlBody), true))
        // A surface with no WebView cannot show OpenRTB demand — not an impression.
        assertEquals(RenderPlan.NONE, renderPlan(Ad.fromJson(200, htmlBody), false))
    }

    @Test
    fun houseAdRendersButIsNotTrackable() {
        val house = Ad.fromJson(
            200,
            """{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/x","width":300,"height":250}}""",
        )
        assertEquals(RenderPlan.IMAGE, renderPlan(house, true))
        assertFalse(house.isTrackable)
    }

    @Test
    fun safeUrlAllowlist() {
        assertEquals(true, isSafeHttpUrl("https://x.example/a"))
        assertEquals(true, isSafeHttpUrl("HTTP://x.example"))
        assertEquals(true, isSafeHttpUrl("  https://x.example  "))
        assertEquals(false, isSafeHttpUrl("javascript:alert(1)"))
        assertEquals(false, isSafeHttpUrl(null))
        assertEquals(false, isSafeHttpUrl(""))
    }

    /**
     * The schemes a creative must never be able to navigate the ad WebView to.
     *
     * `CreativeWebViewClient` routes every top-level navigation through `openUrl`, which
     * refuses anything this rejects. `intent:` is the one that matters most: an Android
     * WebView with no client of its own hands such a URL to the OS as an Intent, which
     * launches arbitrary app components straight from third-party creative markup.
     */
    @Test
    fun navigationSchemesThatMustBeBlocked() {
        for (url in listOf(
            "intent://scan/#Intent;scheme=zxing;package=com.evil.app;end",
            "market://details?id=com.evil.app",
            "tel:+150055501000",
            "sms:+150055501000",
            "file:///etc/hosts",
            "content://com.android.contacts/contacts",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "app-scheme://open",
        )) {
            assertFalse("must not be navigable: $url", isSafeHttpUrl(url))
        }
    }
}
