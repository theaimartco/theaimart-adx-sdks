package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** CONTRACT.md §5 beacon outcomes + resend schedule, and §3 identity persistence. */
class ViewableTest {

    @Test
    fun classifiesEveryContractResponse() {
        val tooEarly = """{"success":false,"reason":"impression_not_recorded_yet","retry":true}"""
        val cases = listOf(
            Triple(200, """{"success":true}""", ViewableOutcome.RECORDED),
            Triple(200, """{"success":true,"duplicate":true}""", ViewableOutcome.RECORDED),
            Triple(200, tooEarly, ViewableOutcome.RETRY),
            Triple(0, null, ViewableOutcome.RETRY),
            Triple(429, """{"error":"rate limit"}""", ViewableOutcome.RETRY),
            Triple(500, "", ViewableOutcome.RETRY),
            Triple(503, "oops", ViewableOutcome.RETRY),
            Triple(400, "Json deserialize error", ViewableOutcome.DROP),
            Triple(404, null, ViewableOutcome.DROP),
            Triple(200, """{"success":false}""", ViewableOutcome.DROP),
            Triple(200, "", ViewableOutcome.DROP),
            Triple(200, "[true]", ViewableOutcome.DROP),
            Triple(200, """{"success":"true"}""", ViewableOutcome.DROP),
        )
        for ((status, body, want) in cases) {
            assertEquals("$status $body", want, viewableOutcome(status, body))
        }
    }

    @Test
    fun resendsATooEarlyBeaconUntilRecorded() {
        val answers = ArrayDeque(listOf(ViewableOutcome.RETRY, ViewableOutcome.RETRY, ViewableOutcome.RECORDED))
        val slept = mutableListOf<Long>()
        var sends = 0
        val outcome = deliverWithRetry(true, { sends++; answers.removeFirst() }, { slept += it })
        assertEquals(ViewableOutcome.RECORDED, outcome)
        assertEquals(3, sends)
        assertEquals(listOf(1000L, 2000L), slept)
    }

    @Test
    fun givesUpAfterTheSchedule() {
        val slept = mutableListOf<Long>()
        var sends = 0
        val outcome = deliverWithRetry(true, { sends++; ViewableOutcome.RETRY }, { slept += it })
        assertEquals(ViewableOutcome.RETRY, outcome)
        assertEquals(4, sends)
        assertEquals(listOf(1000L, 2000L, 4000L), slept)
    }

    @Test
    fun neverResendsOpenRtbOrAPermanentFailure() {
        var sends = 0
        deliverWithRetry(false, { sends++; ViewableOutcome.RETRY }, { })
        assertEquals("OpenRTB has no impression row: send once", 1, sends)
        sends = 0
        deliverWithRetry(true, { sends++; ViewableOutcome.DROP }, { })
        assertEquals(1, sends)
    }

    @Test
    fun onlyASaneIdentityIsPersisted() {
        assertTrue(isStorableIdentity("1a45674e-a8b0-4acb-ada9-774f3055ef15._X8sLEOxqwz4akZKKJtrFW4n6xnpcbTGPWH1tPf6IT0"))
        assertTrue(isStorableIdentity("86ee3b2a-511e-4ff2-bb54-3f696a6525b8.Vdo+st/eh="))
        assertTrue("legacy bare UUID", isStorableIdentity("86ee3b2a-511e-4ff2-bb54-3f696a6525b8"))
        assertFalse(isStorableIdentity(null))
        assertFalse(isStorableIdentity(""))
        assertFalse(isStorableIdentity("abc; Path=/"))
        assertFalse(isStorableIdentity("abc\r\nX-Evil: 1"))
        assertFalse(isStorableIdentity("abc def"))
        assertFalse(isStorableIdentity("a".repeat(257)))
    }
}
