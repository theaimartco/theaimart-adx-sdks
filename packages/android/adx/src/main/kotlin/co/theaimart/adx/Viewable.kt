package co.theaimart.adx

import org.json.JSONObject

// CONTRACT.md §5 (beacon outcomes) and §3 (identity persistence). Pure, so they are unit-tested
// on the JVM like the other contract functions.

/** What a `POST /serve/viewable` response means for the view it reported. */
public enum class ViewableOutcome {
    /** The server recorded the view (or already had it — `duplicate: true`). */
    RECORDED,

    /** Not counted, but resending is safe: too early, rate-limited, 5xx or no response. */
    RETRY,

    /** Permanent failure (e.g. `400`); resending would not help. */
    DROP,
}

/**
 * Wait before each resend of a beacon answered [ViewableOutcome.RETRY]: attempts land at roughly
 * t = 0, 1, 3 and 7 s. The backend flushes impressions every 500 ms by default, so this covers a
 * slow flush several times over without keeping a dead beacon alive.
 */
public val VIEWABLE_RETRY_DELAYS_SECONDS: List<Int> = listOf(1, 2, 4)

/**
 * Classify a viewability-beacon response. [status] 0 means no response (transport error).
 *
 * The backend writes impressions through an async buffer, so a beacon can arrive before the row
 * exists. It then answers `200 {"success": false, "retry": true}` and releases its dedup key —
 * the view was *not* counted. Reading only the status code turns that into a silent success,
 * which is how early beacons used to be lost for good.
 */
public fun viewableOutcome(status: Int, body: String?): ViewableOutcome {
    if (status == 0 || status == 429 || status >= 500) return ViewableOutcome.RETRY
    if (status !in 200..299) return ViewableOutcome.DROP
    val json = try {
        if (body.isNullOrBlank()) null else JSONObject(body)
    } catch (_: Exception) {
        null
    } ?: return ViewableOutcome.DROP
    // `opt(...) == true`, not `optBoolean`: the latter coerces the string "true" to true.
    if (json.opt("success") == true) return ViewableOutcome.RECORDED
    if (json.opt("retry") == true) return ViewableOutcome.RETRY
    return ViewableOutcome.DROP
}

/**
 * Send a measured view, resending on [VIEWABLE_RETRY_DELAYS_SECONDS] while the answer is
 * [ViewableOutcome.RETRY] and [retryable] is true. Only an internal impression is retryable: an
 * OpenRTB win never gets a row the beacon could mark, so its answer is `retry` forever.
 */
internal fun deliverWithRetry(
    retryable: Boolean,
    send: () -> ViewableOutcome,
    sleepMs: (Long) -> Unit,
): ViewableOutcome {
    var outcome = send()
    for (delay in VIEWABLE_RETRY_DELAYS_SECONDS) {
        if (outcome != ViewableOutcome.RETRY || !retryable) break
        sleepMs(delay * 1000L)
        outcome = send()
    }
    return outcome
}

/**
 * Whether a server-sent `_an_id` value is safe to persist and replay in a `Cookie` header.
 *
 * The value is `<uuid>.<base64 signature>` (or a bare legacy UUID), so anything outside the
 * UUID/base64 alphabets — a `;`, whitespace, a control character — is refused rather than
 * stored: a poisoned value would otherwise be resent on every request for a year.
 */
internal fun isStorableIdentity(value: String?): Boolean {
    if (value.isNullOrEmpty() || value.length > 256) return false
    return value.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it in "._-+/=" }
}

/** Where a rendering surface keeps `_an_id` between requests (CONTRACT.md §3). */
internal interface IdentityStore {
    fun load(): String?
    fun save(value: String)
}
