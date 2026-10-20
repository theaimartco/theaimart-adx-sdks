package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts. */
class GuardTest {
    private val slot = "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"

    @Test
    fun publishableKey() {
        for (ok in listOf("pk_x", "pk_0123456789abcdef0123456789abcdef", "pk_virgo_live-1")) {
            assertTrue(ok, Guard.isPublishableKey(ok))
        }
        for (bad in listOf("", "pk_", "sk_live_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x", "pk_a b", "pk_a\n", "PK_x", "pk_" + "a".repeat(98))) {
            assertFalse(bad, Guard.isPublishableKey(bad))
        }
    }

    @Test
    fun baseUrl() {
        assertEquals("https://api.adx.theaimart.co", Guard.normalizeBaseUrl("https://api.adx.theaimart.co/"))
        assertEquals("https://h:8443/prefix", Guard.normalizeBaseUrl("  https://h:8443/prefix// "))
        for (local in listOf(
            "http://localhost:8080", "http://127.0.0.1:9", "http://10.0.2.2:8080", "http://192.168.1.5",
            "http://172.20.0.1", "http://[::1]:80", "http://dev.localhost",
        )) {
            assertEquals(local, local, Guard.normalizeBaseUrl(local))
        }
        for (bad in listOf(
            "http://api.adx.theaimart.co", "http://10.evil.com", "http://172.32.0.1",
            "https://user:pw@api.adx.theaimart.co", "https://api.adx.theaimart.co@evil.com",
            "https://h/?x=1", "https://h/#f", "https://h\\@evil.com", "https://h /x", "ftp://h",
            "javascript:alert(1)", "https://",
        )) {
            assertNull(bad, Guard.normalizeBaseUrl(bad))
        }
    }

    @Test
    fun impIdAndIdentity() {
        assertTrue(Guard.isSafeImpId("1751600000000_550e8400-e29b-41d4-a716-446655440000"))
        for (bad in listOf("", "a b", "x\"}", "a\r\nb", "a".repeat(129), null)) {
            assertFalse("$bad", Guard.isSafeImpId(bad))
        }
        assertTrue(Guard.isSafeIdentityCookie("550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=="))
        for (bad in listOf("", "a;b", "a b", "ok\r\nSet-Cookie: x", "a,b", "a".repeat(513))) {
            assertFalse(bad, Guard.isSafeIdentityCookie(bad))
        }
    }

    @Test
    fun pageUrl() {
        val cases = listOf(
            "https://site.com/a/b?q=shoes#access_token=abc" to "https://site.com/a/b?q=shoes",
            "https://user:pw@site.com/x" to "https://site.com/x",
            "https://site.com/cb?code=abc&state=xyz&page=2" to "https://site.com/cb?page=2",
            "https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl" to "https://site.com/?utm_source=nl",
            "https://site.com/?u=alice@example.com&v=bob%40example.com&w=1" to "https://site.com/?w=1",
            "https://site.com/@handle/post?ref=home" to "https://site.com/@handle/post?ref=home",
            "https://site.com/x?password=hunter2" to "https://site.com/x",
            "https://site.com/x?&&a=1&&" to "https://site.com/x?a=1",
            "app://screen/home" to "app://screen/home",
            "/settings/profile?email=a@b.c" to "/settings/profile",
            "  \u0000https://site.com/\r\n  " to "https://site.com/",
            "https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm" to "https://site.com/reset/*/confirm",
            "https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln" to "https://site.com/m/*",
            "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026" to "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026",
            "https://site.com/p/550e8400-e29b-41d4-a716-446655440000" to "https://site.com/p/550e8400-e29b-41d4-a716-446655440000",
            "https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes" to "https://site.com/?q=shoes",
            "https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3" to "https://site.com/?page=3",
            "https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1" to "https://site.com/?q=1",
            "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high" to "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high",
            "#only-a-fragment" to null,
            "" to null,
        )
        for ((input, want) in cases) assertEquals(input, want, Guard.sanitizePageUrl(input))
        val out = Guard.sanitizePageUrl("https://site.com/" + "é".repeat(5000))!!
        assertTrue(out.toByteArray(Charsets.UTF_8).size <= Guard.MAX_PAGE_URL_BYTES)
        assertTrue(out.startsWith("https://site.com/éé"))
    }

    @Test
    fun looksLikeSecret() {
        for (yes in listOf(
            "9f86d081884c7d659a2feaa0c55ad015", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln",
            "Zx81kQ2mT7vB4nR9sW3yL6pA", "sess_4f9a8b7c6d5e4f3a2b1c",
        )) assertTrue(yes, Guard.looksLikeSecret(yes))
        for (no in listOf(
            "how-to-build-a-rest-api-in-rust-2026", "550e8400-e29b-41d4-a716-446655440000",
            "nike+air+max+270+review+2026", "supercalifragilisticexpialidocious",
            "123456789012345678901234567890", "short1a", "",
        )) assertFalse(no, Guard.looksLikeSecret(no))
    }

    @Test
    fun truncateUtf8NeverSplits() {
        val s = "aé😀b"
        val cases = listOf(1 to "a", 2 to "a", 3 to "aé", 6 to "aé", 7 to "aé😀", 99 to s)
        for ((n, want) in cases) assertEquals("$n", want, Guard.truncateUtf8(s, n))
    }

    @Test
    fun keywords() {
        assertEquals("a,b,c", Guard.sanitizeKeywords(" a,b\u0007,c "))
        assertNull(Guard.sanitizeKeywords("   "))
        assertEquals(Guard.MAX_KEYWORDS_BYTES, Guard.sanitizeKeywords("k".repeat(5000))!!.length)
    }

    @Test
    fun privacySignalsAreNeverLost() {
        assertEquals("1YYN", Guard.sanitizeUsPrivacy("1YYN"))
        assertEquals("1-Y-", Guard.sanitizeUsPrivacy(" 1-Y-\n"))
        assertTrue(Guard.sanitizeUsPrivacy("1YY" + "x".repeat(100))!!.startsWith("1YY"))
        assertEquals("7", Guard.sanitizeGppSid("7"))
        assertEquals("7,8", Guard.sanitizeGppSid("7_8"))
        assertEquals("7,8", Guard.sanitizeGppSid("7;8"))
        assertEquals("2,7", Guard.sanitizeGppSid(" 2 , 7 "))
        assertNull(Guard.sanitizeGppSid("abc"))
        assertTrue(Guard.sanitizeGppSid("1,".repeat(200))!!.length <= 128)
        val tcf = "CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA"
        assertEquals(tcf, Guard.sanitizeConsent(" $tcf "))
        assertEquals("C".repeat(Guard.MAX_CONSENT_BYTES), Guard.sanitizeConsent("C".repeat(Guard.MAX_CONSENT_BYTES)))
        assertNull(Guard.sanitizeConsent("C".repeat(Guard.MAX_CONSENT_BYTES + 1)))
    }

    @Test
    fun invalidSlotIsNeverSent() {
        assertNull(Guard.guardServeParams("pk_x", AdRequest()))
        assertNull(Guard.guardServeParams("pk_x", AdRequest(slotId = "s1")))
        assertNull(Guard.guardServeParams("pk_x", AdRequest(slotId = "$slot' or 1=1")))
        assertNull(Guard.guardServeParams("pk_x", AdRequest(slotName = "  ")))
        assertNull(Guard.guardServeParams("pk_x", AdRequest(slotName = "n".repeat(129))))
        assertEquals("home-top", Guard.guardServeParams("pk_x", AdRequest(slotName = " home-top "))!!.toMap()["slot_name"])
        val p = Guard.guardServeParams("pk_x", AdRequest(slotId = " $slot ", slotName = "ignored", pageUrl = "https://s.com/#t"))
        assertEquals(
            listOf(
                "api_key" to "pk_x", "slot_id" to slot, "slot_name" to null, "page_url" to "https://s.com/",
                "page_keywords" to null, "us_privacy" to null, "euconsent_v2" to null, "gpp" to null, "gpp_sid" to null,
            ),
            p,
        )
    }

    @Test
    fun requestBudget() {
        val g = RequestGuard()
        val t0 = 1_000_000L
        repeat(Guard.MAX_REQUESTS_PER_MINUTE) { assertNull(g.acquire(t0)) }
        assertEquals(1, g.acquire(t0))
        assertNull(g.acquire(t0 + 1000))
        assertEquals(1, g.acquire(t0 + 1000))
    }

    @Test
    fun breaker429() {
        val g = RequestGuard()
        g.record(429, 30, 0)
        assertEquals(29, g.acquire(1000))
        assertNull(g.acquire(30_000))
        val d = RequestGuard()
        d.record(429, null, 0)
        assertEquals(60, d.acquire(0))
        val c = RequestGuard()
        c.record(429, 86_400, 0)
        assertEquals(600, c.acquire(0))
        val o = RequestGuard()
        o.record(503, 999, 0)
        assertNull(o.acquire(0))
    }
}
