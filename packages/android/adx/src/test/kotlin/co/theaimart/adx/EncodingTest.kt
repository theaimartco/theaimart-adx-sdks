package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.URLDecoder

class EncodingTest {

    private val nastyPageUrl =
        "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com" +
            "&sel=select a table; drop-- update union open cast 1=1"

    @Test
    fun percentEncodeAll_encodesEveryByteUppercaseHex() {
        assertEquals("%61%5A%30", Encoding.percentEncodeAll("aZ0"))
        assertEquals("%61%40%20%3D%C3%A9", Encoding.percentEncodeAll("a@ =é"))
    }

    @Test
    fun percentEncodeAll_roundtrips() {
        val encoded = Encoding.percentEncodeAll(nastyPageUrl)
        assertEquals(nastyPageUrl, URLDecoder.decode(encoded, "UTF-8"))
    }

    @Test
    fun buildServeQuery_skipsNulls() {
        val q = Encoding.buildServeQuery(
            listOf("api_key" to "pk", "slot_id" to null, "page_url" to "x"),
        )
        assertTrue(q.contains("api_key="))
        assertFalse(q.contains("slot_id="))
        assertTrue(q.contains("page_url="))
    }

    @Test
    fun builtQuery_isWafSafe_evenForHostileInput() {
        val q = Encoding.buildServeQuery(
            listOf(
                "api_key" to "pk_live",
                "slot_id" to "11111111-2222-3333-4444-555555555555",
                "page_url" to nastyPageUrl,
                "page_keywords" to "select,table,cast,end,open",
            ),
        )
        val lowered = q.lowercase()
        val offenders = Encoding.SQL_INJECTION_KEYWORDS.filter { lowered.contains(it) }
        assertEquals(emptyList<String>(), offenders)
        assertTrue(Encoding.rawQueryIsWafSafe(q))
    }

    @Test
    fun builtQuery_roundtripsOnDecode() {
        val q = Encoding.buildServeQuery(listOf("page_url" to nastyPageUrl))
        val value = q.removePrefix("page_url=")
        assertEquals(nastyPageUrl, URLDecoder.decode(value, "UTF-8"))
    }
}
