package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsTest {

    @Test
    fun parsesInternalFill_noSourceField() {
        val body = """
            {"fill":true,"imp_id":"imp1","identity_id":"id1",
             "auction":{"type":"second_price","clearing_price_paise":120,"quality_score":0.83},
             "creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp1","headline":"Hi","width":300,"height":250}}
        """.trimIndent()
        val ad = Ad.fromJson(200, body)
        assertTrue(ad.filled)
        assertEquals(AdKind.IMAGE, ad.kind)
        assertEquals(AdSource.INTERNAL, ad.source)
        assertEquals("imp1", ad.impId)
        assertTrue(ad.isTrackable)
        assertEquals("https://cdn/x.png", ad.creative?.assetUrl)
        assertEquals(120, ad.auction?.clearingPricePaise)
    }

    @Test
    fun parsesOpenRtbHtmlFill() {
        val body = """{"fill":true,"source":"openrtb","imp_id":"i","dsp":"DSP","creative":{"html":"<div>ad</div>","width":320,"height":50}}"""
        val ad = Ad.fromJson(200, body)
        assertEquals(AdKind.HTML, ad.kind)
        assertEquals(AdSource.OPENRTB, ad.source)
        assertEquals("DSP", ad.dsp)
        assertEquals("<div>ad</div>", ad.creative?.html)
    }

    @Test
    fun parsesHouseFill_notTrackable() {
        val body = """{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/landing","width":300,"height":250}}"""
        val ad = Ad.fromJson(200, body)
        assertEquals(AdSource.HOUSE, ad.source)
        assertEquals(AdKind.IMAGE, ad.kind)
        assertNull(ad.impId)
        assertFalse(ad.isTrackable)
    }

    @Test
    fun noFillVariants() {
        assertFalse(Ad.fromJson(200, """{"fill":false}""").filled)
        assertEquals("fraud_rejected", Ad.fromJson(200, """{"fill":false,"reason":"fraud_rejected"}""").reason)
    }

    @Test
    fun nonOkStatusAndGarbageAreNoFill() {
        assertEquals(60, Ad.fromJson(429, """{"fill":false}""", 60).retryAfterSeconds)
        assertFalse(Ad.fromJson(400, "not json").filled)
        assertFalse(Ad.fromJson(200, null).filled)
    }

    @Test
    fun creativeDimensionsDefault() {
        val ad = Ad.fromJson(200, """{"fill":true,"creative":{"asset_url":"x","click_url":"y"}}""")
        assertEquals(300, ad.creative?.width)
        assertEquals(250, ad.creative?.height)
    }
}
