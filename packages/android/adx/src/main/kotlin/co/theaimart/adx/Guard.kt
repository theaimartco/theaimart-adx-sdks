package co.theaimart.adx

/**
 * Outbound request guard (CONTRACT.md §12).
 *
 * Everything this SDK puts on the wire to the ad server passes through here first: the config is
 * held to a client-safe shape (a public `pk_` key over TLS), every request field is validated,
 * minimised and length-bounded, and the request rate is capped on the device so a buggy
 * integration — a render loop, a retry storm — never reaches the server as load.
 *
 * Implements exactly the rules of the Node/Web/React Native `guard.ts` and is asserted with the
 * same test vectors.
 */
public object Guard {
    public const val MAX_PAGE_URL_BYTES: Int = 2048
    public const val MAX_KEYWORDS_BYTES: Int = 1024
    public const val MAX_SLOT_NAME_BYTES: Int = 128
    public const val MAX_CONSENT_BYTES: Int = 8192
    public const val MAX_US_PRIVACY_CHARS: Int = 32
    public const val MAX_GPP_SID_CHARS: Int = 128
    public const val MAX_HEADER_VALUE_CHARS: Int = 512
    public const val MAX_RESPONSE_BYTES: Int = 512 * 1024
    public const val MAX_REQUESTS_PER_MINUTE: Int = 60
    public const val DEFAULT_RATE_LIMIT_BACKOFF_SECONDS: Int = 60
    public const val MAX_RATE_LIMIT_BACKOFF_SECONDS: Int = 600

    /** Local no-fill reasons. No request was sent for any of them. */
    public const val REASON_INVALID_REQUEST: String = "invalid_request"
    public const val REASON_RATE_LIMITED: String = "rate_limited"
    public const val REASON_INVALID_CONFIG: String = "invalid_config"

    private val PUBLISHABLE_KEY = Regex("pk_[A-Za-z0-9_-]{1,97}")
    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
    private val IMP_ID = Regex("[A-Za-z0-9_-]{1,128}")
    private val IDENTITY = Regex("[A-Za-z0-9._+/=-]{1,512}")
    private val IPV4 = Regex("[0-9]{1,3}(\\.[0-9]{1,3}){3}")
    private val NON_DIGITS = Regex("[^0-9]+")
    private val TOKEN_CHARS = Regex("[A-Za-z0-9_.~=-]+")
    private val TOKEN_SPLIT = Regex("[-._~=]")
    private val ASCII_ESCAPE = Regex("%([0-7][0-9A-Fa-f])")

    /** Query-parameter names that carry credentials or personal data, matched exactly. */
    @JvmField
    public val SENSITIVE_PARAM_NAMES: List<String> = listOf(
        "code", "state", "key", "sig", "sid", "nonce", "ticket", "otp", "pin",
        "email", "phone", "password", "pass", "pwd", "ssn",
    )

    /** Query-parameter name fragments that carry credentials, matched as substrings. */
    @JvmField
    public val SENSITIVE_PARAM_FRAGMENTS: List<String> = listOf(
        "token", "secret", "passw", "session", "auth", "jwt", "signature",
        "apikey", "api_key", "access_key", "credential", "private",
    )

    private fun isControl(c: Char): Boolean = c.code in 0x00..0x1F || c.code in 0x7F..0x9F

    /** Whether [key] is a publishable site key — never an account token or secret. */
    @JvmStatic
    public fun isPublishableKey(key: String): Boolean = PUBLISHABLE_KEY.matches(key)

    private fun isLocalHost(host: String): Boolean {
        if (host == "localhost" || host.endsWith(".localhost") || host == "[::1]") return true
        if (!IPV4.matches(host)) return false
        val parts = host.split('.')
        val a = parts[0].toInt()
        val b = parts[1].toInt()
        return a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && b in 16..31)
    }

    /**
     * Normalise a base URL, or null if it is unsafe: `https` required, plain `http` only for a
     * loopback or private-network host; no credentials, query, fragment, backslash or whitespace.
     */
    @JvmStatic
    public fun normalizeBaseUrl(url: String): String? {
        val s = url.trim().trimEnd('/')
        if (s.any { it.isWhitespace() || isControl(it) || it == '@' || it == '?' || it == '#' || it == '\\' }) {
            return null
        }
        val lowered = s.lowercase()
        val secure: Boolean
        val rest: String
        when {
            lowered.startsWith("https://") -> { rest = lowered.substring(8); secure = true }
            lowered.startsWith("http://") -> { rest = lowered.substring(7); secure = false }
            else -> return null
        }
        val authority = rest.substringBefore('/')
        val host = if (authority.startsWith("[")) {
            val close = authority.indexOf(']')
            if (close == -1) return null
            authority.substring(0, close + 1)
        } else {
            authority.substringBefore(':')
        }
        if (host.isEmpty() || (!secure && !isLocalHost(host))) return null
        return s
    }

    @JvmStatic
    public fun isUuid(value: String): Boolean = UUID.matches(value)

    /** Whether an `imp_id` may be echoed back to the server. Real ones are `<millis>_<uuid>`. */
    @JvmStatic
    public fun isSafeImpId(value: String?): Boolean = value != null && IMP_ID.matches(value)

    /** Whether an `_an_id` may be stored or sent as a `Cookie`: the server's own alphabet. */
    @JvmStatic
    public fun isSafeIdentityCookie(value: String?): Boolean = value != null && IDENTITY.matches(value)

    @JvmStatic
    public fun stripControl(value: String): String = value.filterNot(::isControl)

    /** A header value the caller supplied: control-free and bounded. */
    @JvmStatic
    public fun safeHeaderValue(value: String): String = stripControl(value).take(MAX_HEADER_VALUE_CHARS)

    /** Truncate to at most [maxBytes] UTF-8 bytes without splitting a character. */
    @JvmStatic
    public fun truncateUtf8(value: String, maxBytes: Int): String {
        var bytes = 0
        var i = 0
        while (i < value.length) {
            val cp = value.codePointAt(i)
            val size = when {
                cp < 0x80 -> 1
                cp < 0x800 -> 2
                cp < 0x10000 -> 3
                else -> 4
            }
            if (bytes + size > maxBytes) break
            bytes += size
            i += Character.charCount(cp)
        }
        return value.substring(0, i)
    }

    private fun utf8Length(value: String): Int = value.toByteArray(Charsets.UTF_8).size

    /**
     * Whether a path segment or query value looks like an opaque credential — a reset/magic-link
     * token, a session id, a hex digest, a JWT — whatever it is called: 24+ chars of
     * `[A-Za-z0-9_.~=-]` with one `-._~=`-separated piece of 16+ chars mixing letters and digits.
     */
    @JvmStatic
    public fun looksLikeSecret(value: String): Boolean {
        if (value.length < 24 || !TOKEN_CHARS.matches(value)) return false
        return value.split(TOKEN_SPLIT).any { piece ->
            piece.length >= 16 && piece.any { it in 'a'..'z' || it in 'A'..'Z' } && piece.any { it in '0'..'9' }
        }
    }

    private fun decodeAsciiEscapes(value: String): String =
        ASCII_ESCAPE.replace(value) { it.groupValues[1].toInt(16).toChar().toString() }

    private fun isSensitiveParam(name: String): Boolean {
        val n = decodeAsciiEscapes(name).lowercase().replace('-', '_')
        return n in SENSITIVE_PARAM_NAMES || SENSITIVE_PARAM_FRAGMENTS.any { n.contains(it) }
    }

    /**
     * Minimise a page URL before it leaves the device: drop the fragment and any userinfo, drop
     * each query parameter whose name is credential-like or whose value contains `@`, and bound it
     * to [MAX_PAGE_URL_BYTES]. The backend stores `page_url` and forwards it to OpenRTB bidders.
     */
    @JvmStatic
    public fun sanitizePageUrl(url: String): String? {
        var s = stripControl(url).trim().substringBefore('#')

        val scheme = s.indexOf("://")
        if (scheme != -1) {
            val start = scheme + 3
            var end = s.length
            for (sep in charArrayOf('/', '?')) {
                val at = s.indexOf(sep, start)
                if (at != -1 && at < end) end = at
            }
            val at = s.lastIndexOf('@', end - 1)
            if (at >= start) s = s.substring(0, start) + s.substring(at + 1)
        }

        // Opaque tokens in the path (`/reset/<token>`, `/magic/<jwt>`) become `*`.
        val q0 = s.indexOf('?')
        val head = if (q0 == -1) s else s.substring(0, q0)
        val tail = if (q0 == -1) "" else s.substring(q0)
        var pathStart = 0
        if (scheme != -1) {
            val slash = head.indexOf('/', scheme + 3)
            pathStart = if (slash == -1) head.length else slash
        }
        val path = head.substring(pathStart).split('/').joinToString("/") { if (looksLikeSecret(it)) "*" else it }
        s = head.substring(0, pathStart) + path + tail

        val q = s.indexOf('?')
        if (q != -1) {
            val kept = s.substring(q + 1).split('&').filter { part ->
                if (part.isEmpty()) return@filter false
                val name = part.substringBefore('=')
                val raw = if (part.contains('=')) part.substringAfter('=') else ""
                val value = raw.lowercase()
                !(isSensitiveParam(name) || value.contains('@') || value.contains("%40") || looksLikeSecret(raw))
            }
            s = s.substring(0, q) + if (kept.isNotEmpty()) "?" + kept.joinToString("&") else ""
        }

        s = truncateUtf8(s, MAX_PAGE_URL_BYTES)
        return s.ifEmpty { null }
    }

    @JvmStatic
    public fun sanitizeKeywords(keywords: String): String? =
        truncateUtf8(stripControl(keywords).trim(), MAX_KEYWORDS_BYTES).ifEmpty { null }

    /** Never dropped or reinterpreted: the backend reads the third character as the opt-out flag. */
    @JvmStatic
    public fun sanitizeUsPrivacy(value: String): String? =
        stripControl(value).trim().take(MAX_US_PRIVACY_CHARS).ifEmpty { null }

    /** Keeps every section id: any non-digit becomes `,` (`"7;8"` → `"7,8"`, never `"78"`). */
    @JvmStatic
    public fun sanitizeGppSid(value: String): String? {
        val out = StringBuilder()
        for (id in value.split(NON_DIGITS)) {
            if (id.isEmpty()) continue
            val extra = if (out.isEmpty()) id.length else id.length + 1
            if (out.length + extra > MAX_GPP_SID_CHARS) break
            if (out.isNotEmpty()) out.append(',')
            out.append(id)
        }
        return out.toString().ifEmpty { null }
    }

    /** Over [MAX_CONSENT_BYTES] it is omitted, never truncated — a cut consent string is corrupt. */
    @JvmStatic
    public fun sanitizeConsent(value: String): String? {
        val s = stripControl(value).trim()
        return if (s.isEmpty() || utf8Length(s) > MAX_CONSENT_BYTES) null else s
    }

    /**
     * Validate and minimise one serve request. Returns the ordered query params, or null when it
     * must not be sent: no usable slot, a `slot_id` that is not a UUID, an over-long `slot_name`.
     */
    @JvmStatic
    public fun guardServeParams(apiKey: String, request: AdRequest): List<Pair<String, String?>>? {
        val slotId = request.slotId?.trim().orEmpty()
        val slotName = request.slotName?.let { stripControl(it).trim() }.orEmpty()
        if (slotId.isNotEmpty()) {
            if (!isUuid(slotId)) return null
        } else if (slotName.isEmpty() || utf8Length(slotName) > MAX_SLOT_NAME_BYTES) {
            return null
        }
        val byId = slotId.isNotEmpty()
        return listOf(
            "api_key" to apiKey,
            "slot_id" to slotId.takeIf { byId },
            "slot_name" to slotName.takeIf { !byId },
            "page_url" to request.pageUrl?.let(::sanitizePageUrl),
            "page_keywords" to request.pageKeywords?.let(::sanitizeKeywords),
            "us_privacy" to request.usPrivacy?.let(::sanitizeUsPrivacy),
            "euconsent_v2" to request.euconsentV2?.let(::sanitizeConsent),
            "gpp" to request.gpp?.let(::sanitizeConsent),
            "gpp_sid" to request.gppSid?.let(::sanitizeGppSid),
        )
    }

    private val guards = HashMap<String, RequestGuard>()

    /** The process-wide guard for one (base URL, api key) — shared by every client and banner. */
    @JvmStatic
    public fun requestGuardFor(baseUrl: String, apiKey: String): RequestGuard =
        synchronized(guards) { guards.getOrPut("$baseUrl $apiKey") { RequestGuard() } }

    /** Forget every guard's state. For tests. */
    @JvmStatic
    public fun resetRequestGuards() {
        synchronized(guards) { guards.clear() }
    }
}

/**
 * Client-side rate bound for one (base URL, api key): a token bucket of
 * [Guard.MAX_REQUESTS_PER_MINUTE] refilled continuously, plus a circuit breaker that stops every
 * request after a `429` until its `Retry-After` has passed. Thread-safe; time is passed in (ms).
 */
public class RequestGuard {
    private var tokens = Guard.MAX_REQUESTS_PER_MINUTE.toDouble()
    private var refilledAt: Long? = null
    private var blockedUntil = 0L

    /** Take one request slot. Null if the request may go, else seconds to wait. */
    @Synchronized
    public fun acquire(nowMs: Long): Int? {
        if (nowMs < blockedUntil) return Math.ceil((blockedUntil - nowMs) / 1000.0).toInt()
        val cap = Guard.MAX_REQUESTS_PER_MINUTE.toDouble()
        val perMs = cap / 60_000.0
        refilledAt?.let { at -> tokens = minOf(cap, tokens + maxOf(0L, nowMs - at) * perMs) }
        refilledAt = nowMs
        if (tokens >= 1.0) {
            tokens -= 1.0
            return null
        }
        return maxOf(1, Math.ceil((1.0 - tokens) / perMs / 1000.0).toInt())
    }

    /** Record the server's answer. A `429` opens the breaker for its `Retry-After`. */
    @Synchronized
    public fun record(status: Int, retryAfterSeconds: Int?, nowMs: Long) {
        if (status != 429) return
        val seconds = if (retryAfterSeconds != null && retryAfterSeconds > 0) {
            minOf(retryAfterSeconds, Guard.MAX_RATE_LIMIT_BACKOFF_SECONDS)
        } else {
            Guard.DEFAULT_RATE_LIMIT_BACKOFF_SECONDS
        }
        blockedUntil = maxOf(blockedUntil, nowMs + seconds * 1000L)
    }
}
