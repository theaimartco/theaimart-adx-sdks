package co.theaimart.adx

import org.json.JSONArray
import org.json.JSONObject

/** Which demand source filled the request. INTERNAL when the response carries no `source` field. */
public enum class AdSource { INTERNAL, OPENRTB, HOUSE }

/** How to render the ad. */
public enum class AdKind { NO_FILL, IMAGE, HTML }

public data class Auction(
    val type: String? = null,
    val clearingPricePaise: Int? = null,
    val qualityScore: Double? = null,
    val effectiveBid: Double? = null,
    val winnerBidPaise: Int? = null,
    val winnerEcpmPaise: Int? = null,
)

public data class Creative(
    val width: Int = 300,
    val height: Int = 250,
    val assetUrl: String? = null,
    val clickUrl: String? = null,
    val html: String? = null,
    val headline: String? = null,
    val description: String? = null,
    val id: String? = null,
    val campaignId: String? = null,
)

/**
 * A normalized ad decision. An unfillable or errored request yields [filled] == false rather
 * than throwing (fail-closed). See CONTRACT.md §4.
 */
public data class Ad(
    val filled: Boolean,
    val kind: AdKind,
    val source: AdSource,
    val httpStatus: Int,
    val impId: String? = null,
    val identityId: String? = null,
    val dsp: String? = null,
    val reason: String? = null,
    val creative: Creative? = null,
    val auction: Auction? = null,
    val retryAfterSeconds: Int? = null,
    val setIdentityCookie: String? = null,
) {
    /** True iff a viewability beacon can be fired (an `impId` is present). */
    val isTrackable: Boolean get() = impId != null

    public companion object {
        public fun noFill(
            httpStatus: Int,
            reason: String? = null,
            retryAfterSeconds: Int? = null,
            setIdentityCookie: String? = null,
        ): Ad = Ad(
            filled = false,
            kind = AdKind.NO_FILL,
            source = AdSource.INTERNAL,
            httpStatus = httpStatus,
            reason = reason,
            retryAfterSeconds = retryAfterSeconds,
            setIdentityCookie = setIdentityCookie,
        )

        /**
         * Parse an HTTP status + JSON body string into a normalized [Ad]. Fail-closed: any non-200
         * status, unparseable body, or `fill != true` becomes a no-fill. Parse order matches
         * CONTRACT.md §4: fill? → html? → source=="house"? → internal.
         */
        public fun fromJson(
            httpStatus: Int,
            body: String?,
            retryAfterSeconds: Int? = null,
            setIdentityCookie: String? = null,
        ): Ad {
            val json = parseObject(body)
            if (httpStatus != 200 || json == null) {
                return noFill(httpStatus, json?.optStringOrNull("reason"), retryAfterSeconds, setIdentityCookie)
            }
            if (!json.optBoolean("fill", false)) {
                return noFill(httpStatus, json.optStringOrNull("reason"), retryAfterSeconds, setIdentityCookie)
            }

            val creativeJson = json.optJSONObject("creative")
            val html = creativeJson?.optStringOrNull("html")
            val sourceField = json.optStringOrNull("source")

            val kind: AdKind
            val source: AdSource
            when {
                html != null -> { kind = AdKind.HTML; source = AdSource.OPENRTB }
                sourceField == "house" -> { kind = AdKind.IMAGE; source = AdSource.HOUSE }
                else -> { kind = AdKind.IMAGE; source = AdSource.INTERNAL }
            }

            return Ad(
                filled = true,
                kind = kind,
                source = source,
                httpStatus = httpStatus,
                impId = json.optStringOrNull("imp_id"),
                identityId = json.optStringOrNull("identity_id"),
                dsp = json.optStringOrNull("dsp"),
                creative = creativeJson?.let { toCreative(it) } ?: Creative(),
                auction = json.optJSONObject("auction")?.let { toAuction(it) },
                retryAfterSeconds = retryAfterSeconds,
                setIdentityCookie = setIdentityCookie,
            )
        }

        private fun parseObject(body: String?): JSONObject? {
            if (body.isNullOrEmpty()) return null
            return try {
                JSONObject(body)
            } catch (_: Throwable) {
                null
            }
        }

        private fun toCreative(o: JSONObject): Creative = Creative(
            width = if (o.has("width")) o.optInt("width", 300) else 300,
            height = if (o.has("height")) o.optInt("height", 250) else 250,
            assetUrl = o.optStringOrNull("asset_url"),
            clickUrl = o.optStringOrNull("click_url"),
            html = o.optStringOrNull("html"),
            headline = o.optStringOrNull("headline"),
            description = o.optStringOrNull("description"),
            id = o.optStringOrNull("id"),
            campaignId = o.optStringOrNull("campaign_id"),
        )

        private fun toAuction(o: JSONObject): Auction = Auction(
            type = o.optStringOrNull("type"),
            clearingPricePaise = o.optIntOrNull("clearing_price_paise"),
            qualityScore = o.optDoubleOrNull("quality_score"),
            effectiveBid = o.optDoubleOrNull("effective_bid"),
            winnerBidPaise = o.optIntOrNull("winner_bid_paise"),
            winnerEcpmPaise = o.optIntOrNull("winner_ecpm_paise"),
        )
    }
}

// --- small JSONObject helpers that return null instead of "null"/defaults ---

// `optString(key, null)` passes a null into a platform non-null parameter — Kotlin cannot prove
// it is safe, and org.json's own contract for it differs between the Android and JVM builds.
// Reading the raw value keeps the exact same result without the nullability hole.
private fun JSONObject.optStringOrNull(key: String): String? = when (val value = opt(key)) {
    null, JSONObject.NULL -> null
    is String -> value
    is JSONObject, is JSONArray -> null
    else -> value.toString()
}

private fun JSONObject.optIntOrNull(key: String): Int? =
    if (isNull(key) || !has(key)) null else optInt(key)

private fun JSONObject.optDoubleOrNull(key: String): Double? =
    if (isNull(key) || !has(key)) null else optDouble(key).takeIf { !it.isNaN() }
