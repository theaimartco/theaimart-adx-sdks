package co.theaimart.adx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CONTRACT.md §9a — the continuous-fill scheduling policy.
 *
 * This is the shared conformance table. Every SDK in the repository ships the same cases;
 * if you change one, change them all.
 */
class ScheduleTest {

    @Test
    fun refreshDisabledIsSingleShot() {
        assertNull(nextDelaySeconds(true, 0, null, 0))
        assertNull(nextDelaySeconds(false, 3, null, 0))
        assertNull(nextDelaySeconds(false, 1, 60, -5))
    }

    @Test
    fun renderedAdRefreshesAtRequestedIntervalFlooredAt30s() {
        assertEquals(60, nextDelaySeconds(true, 0, null, 60))
        assertEquals(30, nextDelaySeconds(true, 0, null, 30))
        assertEquals(MIN_REFRESH_SECONDS, nextDelaySeconds(true, 0, null, 10))
        assertEquals(MIN_REFRESH_SECONDS, nextDelaySeconds(true, 0, null, 1))
    }

    @Test
    fun failuresBackOffAndCap() {
        assertEquals(30, nextDelaySeconds(false, 1, null, 30))
        assertEquals(60, nextDelaySeconds(false, 2, null, 30))
        assertEquals(120, nextDelaySeconds(false, 3, null, 30))
        assertEquals(240, nextDelaySeconds(false, 4, null, 30))
        assertEquals(MAX_RETRY_SECONDS, nextDelaySeconds(false, 5, null, 30))
        assertEquals(MAX_RETRY_SECONDS, nextDelaySeconds(false, 99, null, 30))
        // A very long outage must not overflow into a negative or absurd delay.
        assertEquals(MAX_RETRY_SECONDS, nextDelaySeconds(false, Int.MAX_VALUE, null, 30))
    }

    @Test
    fun retryAfterPushesOutNeverIn() {
        assertEquals(90, nextDelaySeconds(false, 1, 90, 30))
        assertEquals(MAX_RETRY_SECONDS, nextDelaySeconds(false, 5, 10, 30))
        assertEquals(30, nextDelaySeconds(false, 1, 0, 30))
        assertEquals(30, nextDelaySeconds(false, 1, null, 30))
    }

    @Test
    fun slowRequestedIntervalIsHonouredOnFailureToo() {
        assertEquals(600, nextDelaySeconds(false, 1, null, 600))
        assertEquals(600, nextDelaySeconds(true, 0, null, 600))
    }

    @Test
    fun loopStaysInsideThePerKeyRateLimit() {
        val perMinute = 60.0 / nextDelaySeconds(true, 0, null, 1)!!
        assertTrue("expected <= 2 req/min at the floor, got $perMinute", perMinute <= 2.0)
    }
}
