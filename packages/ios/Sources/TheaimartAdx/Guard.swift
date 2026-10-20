import Foundation

/// Outbound request guard (CONTRACT.md §12).
///
/// Everything this SDK puts on the wire to the ad server passes through here first: the config is
/// held to a client-safe shape (a public `pk_` key over TLS), every request field is validated,
/// minimised and length-bounded, and the request rate is capped on the device so a buggy
/// integration — a layout loop, a retry storm — never reaches the server as load.
///
/// Implements exactly the rules of the Node/Web/React Native `guard.ts` and is asserted with the
/// same test vectors.
public enum AdxGuard {
    public static let maxPageURLBytes = 2048
    public static let maxKeywordsBytes = 1024
    public static let maxSlotNameBytes = 128
    public static let maxConsentBytes = 8192
    public static let maxUSPrivacyChars = 32
    public static let maxGPPSIDChars = 128
    public static let maxHeaderValueChars = 512
    public static let maxResponseBytes = 512 * 1024
    public static let maxRequestsPerMinute = 60
    public static let defaultRateLimitBackoffSeconds = 60
    public static let maxRateLimitBackoffSeconds = 600

    /// Local no-fill reasons. No request was sent for any of them.
    public static let reasonInvalidRequest = "invalid_request"
    public static let reasonRateLimited = "rate_limited"
    public static let reasonInvalidConfig = "invalid_config"

    /// Query-parameter names that carry credentials or personal data, matched exactly.
    public static let sensitiveParamNames: Set<String> = [
        "code", "state", "key", "sig", "sid", "nonce", "ticket", "otp", "pin",
        "email", "phone", "password", "pass", "pwd", "ssn",
    ]
    /// Query-parameter name fragments that carry credentials, matched as substrings.
    public static let sensitiveParamFragments: [String] = [
        "token", "secret", "passw", "session", "auth", "jwt", "signature",
        "apikey", "api_key", "access_key", "credential", "private",
    ]

    // MARK: - Character classes (ASCII-only, matching the other SDKs' regexes exactly)

    private static func isControl(_ s: Unicode.Scalar) -> Bool {
        (s.value <= 0x1F) || (s.value >= 0x7F && s.value <= 0x9F)
    }

    private static func isAlnum(_ s: Unicode.Scalar) -> Bool {
        (s.value >= 0x30 && s.value <= 0x39) || (s.value >= 0x41 && s.value <= 0x5A)
            || (s.value >= 0x61 && s.value <= 0x7A)
    }

    private static func isDigit(_ s: Unicode.Scalar) -> Bool { s.value >= 0x30 && s.value <= 0x39 }

    private static func isHex(_ s: Unicode.Scalar) -> Bool {
        isDigit(s) || (s.value >= 0x41 && s.value <= 0x46) || (s.value >= 0x61 && s.value <= 0x66)
    }

    private static func all(_ value: String, count range: ClosedRange<Int>, _ ok: (Unicode.Scalar) -> Bool) -> Bool {
        let scalars = value.unicodeScalars
        return range.contains(scalars.count) && scalars.allSatisfy(ok)
    }

    // MARK: - Config

    /// Whether `key` is a publishable site key — never an account token or secret.
    public static func isPublishableKey(_ key: String) -> Bool {
        guard key.hasPrefix("pk_") else { return false }
        return all(String(key.dropFirst(3)), count: 1...97) { isAlnum($0) || $0 == "_" || $0 == "-" }
    }

    private static func ipv4(_ host: String) -> [Int]? {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var out: [Int] = []
        for p in parts {
            guard (1...3).contains(p.count), p.unicodeScalars.allSatisfy(isDigit), let n = Int(p) else { return nil }
            out.append(n)
        }
        return out
    }

    private static func isLocalHost(_ host: String) -> Bool {
        if host == "localhost" || host.hasSuffix(".localhost") || host == "[::1]" { return true }
        guard let ip = ipv4(host) else { return false }
        let a = ip[0], b = ip[1]
        return a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && (16...31).contains(b))
    }

    /// Normalise a base URL, or nil if it is unsafe: `https` required, plain `http` only for a
    /// loopback or private-network host; no credentials, query, fragment, backslash or whitespace.
    public static func normalizeBaseURL(_ url: String) -> String? {
        var s = url.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        let forbidden: Set<Unicode.Scalar> = ["@", "?", "#", "\\"]
        if s.unicodeScalars.contains(where: {
            isControl($0) || forbidden.contains($0) || CharacterSet.whitespacesAndNewlines.contains($0)
        }) {
            return nil
        }
        let lowered = s.lowercased()
        let rest: Substring
        let secure: Bool
        if lowered.hasPrefix("https://") {
            rest = lowered.dropFirst(8); secure = true
        } else if lowered.hasPrefix("http://") {
            rest = lowered.dropFirst(7); secure = false
        } else {
            return nil
        }
        let authority = rest.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let host: String
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { return nil }
            host = String(authority[...close])
        } else {
            host = authority.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        }
        if host.isEmpty || (!secure && !isLocalHost(host)) { return nil }
        return s
    }

    // MARK: - Field validators

    public static func isUUID(_ value: String) -> Bool {
        let scalars = Array(value.unicodeScalars)
        guard scalars.count == 36 else { return false }
        for (i, s) in scalars.enumerated() {
            if [8, 13, 18, 23].contains(i) { if s != "-" { return false } } else if !isHex(s) { return false }
        }
        return true
    }

    /// Whether an `imp_id` may be echoed back to the server. Real ones are `<millis>_<uuid>`.
    public static func isSafeImpID(_ value: String?) -> Bool {
        guard let value = value else { return false }
        return all(value, count: 1...128) { isAlnum($0) || $0 == "_" || $0 == "-" }
    }

    /// Whether an `_an_id` may be stored or sent as a `Cookie`: the server's own alphabet.
    public static func isSafeIdentityCookie(_ value: String?) -> Bool {
        guard let value = value else { return false }
        let extra: Set<Unicode.Scalar> = [".", "_", "+", "/", "=", "-"]
        return all(value, count: 1...512) { isAlnum($0) || extra.contains($0) }
    }

    public static func stripControl(_ value: String) -> String {
        var out = String.UnicodeScalarView()
        out.append(contentsOf: value.unicodeScalars.filter { !isControl($0) })
        return String(out)
    }

    /// A header value the caller supplied: control-free and bounded.
    public static func safeHeaderValue(_ value: String) -> String {
        var out = String.UnicodeScalarView()
        out.append(contentsOf: value.unicodeScalars.filter { !isControl($0) }.prefix(maxHeaderValueChars))
        return String(out)
    }

    /// Truncate to at most `maxBytes` UTF-8 bytes without splitting a character.
    public static func truncateUTF8(_ value: String, _ maxBytes: Int) -> String {
        var bytes = 0
        var out = String.UnicodeScalarView()
        for s in value.unicodeScalars {
            let size = String(s).utf8.count
            if bytes + size > maxBytes { break }
            bytes += size
            out.append(s)
        }
        return String(out)
    }

    private static func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Whether a path segment or query value looks like an opaque credential — a reset/magic-link
    /// token, a session id, a hex digest, a JWT — whatever it is called: 24+ chars of
    /// `[A-Za-z0-9_.~=-]` with one `-._~=`-separated piece of 16+ chars mixing letters and digits.
    public static func looksLikeSecret(_ value: String) -> Bool {
        let separators: Set<Unicode.Scalar> = ["-", ".", "_", "~", "="]
        let scalars = value.unicodeScalars
        guard scalars.count >= 24, scalars.allSatisfy({ isAlnum($0) || separators.contains($0) }) else {
            return false
        }
        var piece: [Unicode.Scalar] = []
        func pieceIsSecret() -> Bool {
            piece.count >= 16 && piece.contains(where: { isAlnum($0) && !isDigit($0) }) && piece.contains(where: isDigit)
        }
        for s in scalars {
            if separators.contains(s) {
                if pieceIsSecret() { return true }
                piece.removeAll()
            } else {
                piece.append(s)
            }
        }
        return pieceIsSecret()
    }

    /// Decode `%XX` escapes of ASCII characters, so `%74oken` is read as `token`.
    private static func decodeASCIIEscapes(_ value: String) -> String {
        let scalars = Array(value.unicodeScalars)
        var out = String.UnicodeScalarView()
        var i = 0
        while i < scalars.count {
            if scalars[i] == "%", i + 2 < scalars.count,
               let hi = Int(String(scalars[i + 1]), radix: 16), hi < 8,
               let lo = Int(String(scalars[i + 2]), radix: 16) {
                out.append(Unicode.Scalar(UInt8(hi * 16 + lo)))
                i += 3
            } else {
                out.append(scalars[i])
                i += 1
            }
        }
        return String(out)
    }

    private static func isSensitiveParam(_ name: String) -> Bool {
        let n = decodeASCIIEscapes(name).lowercased().replacingOccurrences(of: "-", with: "_")
        return sensitiveParamNames.contains(n) || sensitiveParamFragments.contains { n.contains($0) }
    }

    private static func nonEmpty(_ s: String) -> String? { s.isEmpty ? nil : s }

    /// Minimise a page URL before it leaves the device: drop the fragment and any userinfo, drop
    /// each query parameter whose name is credential-like or whose value contains `@`, and bound
    /// it to `maxPageURLBytes`. The backend stores `page_url` and forwards it to OpenRTB bidders.
    public static func sanitizePageURL(_ url: String) -> String? {
        var s = trimmed(stripControl(url))
        if let hash = s.firstIndex(of: "#") { s = String(s[..<hash]) }

        if let scheme = s.range(of: "://") {
            let start = scheme.upperBound
            let end = s[start...].firstIndex(where: { $0 == "/" || $0 == "?" }) ?? s.endIndex
            if let at = s[start..<end].lastIndex(of: "@") {
                s = String(s[..<start]) + String(s[s.index(after: at)...])
            }
        }

        // Opaque tokens in the path (`/reset/<token>`, `/magic/<jwt>`) become `*`.
        let q0 = s.firstIndex(of: "?") ?? s.endIndex
        var pathStart = s.startIndex
        if let scheme = s.range(of: "://"), scheme.upperBound <= q0 {
            pathStart = s[scheme.upperBound..<q0].firstIndex(of: "/") ?? q0
        }
        let path = s[pathStart..<q0]
            .split(separator: "/", omittingEmptySubsequences: false)
            .map { looksLikeSecret(String($0)) ? "*" : String($0) }
            .joined(separator: "/")
        s = String(s[..<pathStart]) + path + String(s[q0...])

        if let q = s.firstIndex(of: "?") {
            let query = s[s.index(after: q)...]
            let kept = query.split(separator: "&", omittingEmptySubsequences: true).filter { part in
                let pieces = part.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                let name = String(pieces[0])
                let raw = pieces.count > 1 ? String(pieces[1]) : ""
                let value = raw.lowercased()
                return !(isSensitiveParam(name) || value.contains("@") || value.contains("%40") || looksLikeSecret(raw))
            }
            s = String(s[..<q]) + (kept.isEmpty ? "" : "?" + kept.joined(separator: "&"))
        }

        return nonEmpty(truncateUTF8(s, maxPageURLBytes))
    }

    public static func sanitizeKeywords(_ keywords: String) -> String? {
        nonEmpty(truncateUTF8(trimmed(stripControl(keywords)), maxKeywordsBytes))
    }

    /// Never dropped or reinterpreted: the backend reads the third character as the opt-out flag.
    public static func sanitizeUSPrivacy(_ value: String) -> String? {
        var out = String.UnicodeScalarView()
        out.append(contentsOf: trimmed(stripControl(value)).unicodeScalars.prefix(maxUSPrivacyChars))
        return nonEmpty(String(out))
    }

    /// Keeps every section id: any non-digit becomes `,` (`"7;8"` → `"7,8"`, never `"78"`).
    public static func sanitizeGPPSID(_ value: String) -> String? {
        var ids: [String] = []
        var current = ""
        for s in value.unicodeScalars {
            if isDigit(s) {
                current.unicodeScalars.append(s)
            } else if !current.isEmpty {
                ids.append(current); current = ""
            }
        }
        if !current.isEmpty { ids.append(current) }
        var out = ""
        for id in ids {
            let next = out.isEmpty ? id : out + "," + id
            if next.count > maxGPPSIDChars { break }
            out = next
        }
        return nonEmpty(out)
    }

    /// Over `maxConsentBytes` it is omitted, never truncated — a cut consent string is corrupt.
    public static func sanitizeConsent(_ value: String) -> String? {
        let s = trimmed(stripControl(value))
        return s.isEmpty || s.utf8.count > maxConsentBytes ? nil : s
    }

    /// Validate and minimise one serve request. Returns the ordered query params, or nil when it
    /// must not be sent: no usable slot, a `slot_id` that is not a UUID, an over-long `slot_name`.
    public static func guardServeParams(apiKey: String, request: AdRequest) -> [(String, String?)]? {
        let slotID = request.slotID.map(trimmed) ?? ""
        let slotName = request.slotName.map { trimmed(stripControl($0)) } ?? ""
        if !slotID.isEmpty {
            if !isUUID(slotID) { return nil }
        } else if slotName.isEmpty || slotName.utf8.count > maxSlotNameBytes {
            return nil
        }
        let byID = !slotID.isEmpty
        return [
            ("api_key", apiKey),
            ("slot_id", byID ? slotID : nil),
            ("slot_name", byID ? nil : slotName),
            ("page_url", request.pageURL.flatMap(sanitizePageURL)),
            ("page_keywords", request.pageKeywords.flatMap(sanitizeKeywords)),
            ("us_privacy", request.usPrivacy.flatMap(sanitizeUSPrivacy)),
            ("euconsent_v2", request.euconsentV2.flatMap(sanitizeConsent)),
            ("gpp", request.gpp.flatMap(sanitizeConsent)),
            ("gpp_sid", request.gppSID.flatMap(sanitizeGPPSID)),
        ]
    }

    // MARK: - Shared rate guards

    private static let registryLock = NSLock()
    private static var registry: [String: AdxRequestGuard] = [:]

    /// The process-wide guard for one (base URL, api key) — shared by every client and banner.
    public static func requestGuard(baseURL: String, apiKey: String) -> AdxRequestGuard {
        registryLock.lock()
        defer { registryLock.unlock() }
        let id = baseURL + " " + apiKey
        if let existing = registry[id] { return existing }
        let created = AdxRequestGuard()
        registry[id] = created
        return created
    }

    /// Forget every guard's state. For tests.
    public static func resetRequestGuards() {
        registryLock.lock()
        registry.removeAll()
        registryLock.unlock()
    }
}

/// Client-side rate bound for one (base URL, api key): a token bucket of
/// `AdxGuard.maxRequestsPerMinute` refilled continuously, plus a circuit breaker that stops every
/// request after a `429` until its `Retry-After` has passed. Thread-safe; time is passed in (ms).
public final class AdxRequestGuard {
    private let lock = NSLock()
    private var tokens = Double(AdxGuard.maxRequestsPerMinute)
    private var refilledAt: Double?
    private var blockedUntil: Double = 0

    public init() {}

    /// Take one request slot. nil if the request may go, else seconds to wait.
    public func acquire(nowMs: Double) -> Int? {
        lock.lock()
        defer { lock.unlock() }
        if nowMs < blockedUntil { return Int(((blockedUntil - nowMs) / 1000).rounded(.up)) }
        let cap = Double(AdxGuard.maxRequestsPerMinute)
        let perMs = cap / 60_000
        if let at = refilledAt { tokens = min(cap, tokens + max(0, nowMs - at) * perMs) }
        refilledAt = nowMs
        if tokens >= 1 {
            tokens -= 1
            return nil
        }
        return max(1, Int(((1 - tokens) / perMs / 1000).rounded(.up)))
    }

    /// Record the server's answer. A `429` opens the breaker for its `Retry-After`.
    public func record(status: Int, retryAfterSeconds: Int?, nowMs: Double) {
        guard status == 429 else { return }
        let seconds: Int
        if let ra = retryAfterSeconds, ra > 0 {
            seconds = min(ra, AdxGuard.maxRateLimitBackoffSeconds)
        } else {
            seconds = AdxGuard.defaultRateLimitBackoffSeconds
        }
        lock.lock()
        blockedUntil = max(blockedUntil, nowMs + Double(seconds) * 1000)
        lock.unlock()
    }
}
