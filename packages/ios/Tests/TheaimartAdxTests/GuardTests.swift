import XCTest
@testable import TheaimartAdx

/// Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts.
final class GuardTests: XCTestCase {
    private let slot = "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"

    func testPublishableKey() {
        for ok in ["pk_x", "pk_0123456789abcdef0123456789abcdef", "pk_virgo_live-1"] {
            XCTAssertTrue(AdxGuard.isPublishableKey(ok), ok)
        }
        let long = "pk_" + String(repeating: "a", count: 98)
        for bad in ["", "pk_", "sk_live_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x", "pk_a b", "pk_a\n", "PK_x", long] {
            XCTAssertFalse(AdxGuard.isPublishableKey(bad), bad)
        }
    }

    func testBaseURL() {
        XCTAssertEqual(AdxGuard.normalizeBaseURL("https://api.adx.theaimart.co/"), "https://api.adx.theaimart.co")
        XCTAssertEqual(AdxGuard.normalizeBaseURL("  https://h:8443/prefix// "), "https://h:8443/prefix")
        for local in ["http://localhost:8080", "http://127.0.0.1:9", "http://10.0.2.2:8080", "http://192.168.1.5",
                      "http://172.20.0.1", "http://[::1]:80", "http://dev.localhost"] {
            XCTAssertEqual(AdxGuard.normalizeBaseURL(local), local, local)
        }
        for bad in ["http://api.adx.theaimart.co", "http://10.evil.com", "http://172.32.0.1",
                    "https://user:pw@api.adx.theaimart.co", "https://api.adx.theaimart.co@evil.com",
                    "https://h/?x=1", "https://h/#f", "https://h\\@evil.com", "https://h /x", "ftp://h",
                    "javascript:alert(1)", "https://"] {
            XCTAssertNil(AdxGuard.normalizeBaseURL(bad), bad)
        }
    }

    func testImpIDAndIdentity() {
        XCTAssertTrue(AdxGuard.isSafeImpID("1751600000000_550e8400-e29b-41d4-a716-446655440000"))
        let badIDs: [String?] = ["", "a b", "x\"}", "a\r\nb", String(repeating: "a", count: 129), nil]
        for bad in badIDs {
            XCTAssertFalse(AdxGuard.isSafeImpID(bad), String(describing: bad))
        }
        XCTAssertTrue(AdxGuard.isSafeIdentityCookie("550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=="))
        for bad in ["", "a;b", "a b", "ok\r\nSet-Cookie: x", "a,b", String(repeating: "a", count: 513)] {
            XCTAssertFalse(AdxGuard.isSafeIdentityCookie(bad), bad)
        }
    }

    func testPageURL() {
        let cases: [(String, String?)] = [
            ("https://site.com/a/b?q=shoes#access_token=abc", "https://site.com/a/b?q=shoes"),
            ("https://user:pw@site.com/x", "https://site.com/x"),
            ("https://site.com/cb?code=abc&state=xyz&page=2", "https://site.com/cb?page=2"),
            ("https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl", "https://site.com/?utm_source=nl"),
            ("https://site.com/?u=alice@example.com&v=bob%40example.com&w=1", "https://site.com/?w=1"),
            ("https://site.com/@handle/post?ref=home", "https://site.com/@handle/post?ref=home"),
            ("https://site.com/x?password=hunter2", "https://site.com/x"),
            ("https://site.com/x?&&a=1&&", "https://site.com/x?a=1"),
            ("app://screen/home", "app://screen/home"),
            ("/settings/profile?email=a@b.c", "/settings/profile"),
            ("  \u{0}https://site.com/\r\n  ", "https://site.com/"),
            ("https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm", "https://site.com/reset/*/confirm"),
            ("https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln", "https://site.com/m/*"),
            ("https://site.com/blog/how-to-build-a-rest-api-in-rust-2026", "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026"),
            ("https://site.com/p/550e8400-e29b-41d4-a716-446655440000", "https://site.com/p/550e8400-e29b-41d4-a716-446655440000"),
            ("https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes", "https://site.com/?q=shoes"),
            ("https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3", "https://site.com/?page=3"),
            ("https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1", "https://site.com/?q=1"),
            ("https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high", "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high"),
            ("#only-a-fragment", nil),
            ("", nil),
        ]
        for (input, want) in cases {
            XCTAssertEqual(AdxGuard.sanitizePageURL(input), want, input)
        }
        let out = AdxGuard.sanitizePageURL("https://site.com/" + String(repeating: "é", count: 5000))!
        XCTAssertLessThanOrEqual(out.utf8.count, AdxGuard.maxPageURLBytes)
        XCTAssertTrue(out.hasPrefix("https://site.com/éé"))
    }

    func testLooksLikeSecret() {
        for yes in ["9f86d081884c7d659a2feaa0c55ad015", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln",
                    "Zx81kQ2mT7vB4nR9sW3yL6pA", "sess_4f9a8b7c6d5e4f3a2b1c"] {
            XCTAssertTrue(AdxGuard.looksLikeSecret(yes), yes)
        }
        for no in ["how-to-build-a-rest-api-in-rust-2026", "550e8400-e29b-41d4-a716-446655440000",
                   "nike+air+max+270+review+2026", "supercalifragilisticexpialidocious",
                   "123456789012345678901234567890", "short1a", ""] {
            XCTAssertFalse(AdxGuard.looksLikeSecret(no), no)
        }
    }

    func testTruncateUTF8NeverSplits() {
        let s = "aé😀b"
        for (n, want) in [(1, "a"), (2, "a"), (3, "aé"), (6, "aé"), (7, "aé😀"), (99, "aé😀b")] {
            XCTAssertEqual(AdxGuard.truncateUTF8(s, n), want, "\(n)")
        }
    }

    func testKeywords() {
        XCTAssertEqual(AdxGuard.sanitizeKeywords(" a,b\u{7},c "), "a,b,c")
        XCTAssertNil(AdxGuard.sanitizeKeywords("   "))
        XCTAssertEqual(AdxGuard.sanitizeKeywords(String(repeating: "k", count: 5000))?.count, AdxGuard.maxKeywordsBytes)
    }

    func testPrivacySignalsAreNeverLost() {
        XCTAssertEqual(AdxGuard.sanitizeUSPrivacy("1YYN"), "1YYN")
        XCTAssertEqual(AdxGuard.sanitizeUSPrivacy(" 1-Y-\n"), "1-Y-")
        XCTAssertTrue(AdxGuard.sanitizeUSPrivacy("1YY" + String(repeating: "x", count: 100))!.hasPrefix("1YY"))
        XCTAssertEqual(AdxGuard.sanitizeGPPSID("7"), "7")
        XCTAssertEqual(AdxGuard.sanitizeGPPSID("7_8"), "7,8")
        XCTAssertEqual(AdxGuard.sanitizeGPPSID("7;8"), "7,8")
        XCTAssertEqual(AdxGuard.sanitizeGPPSID(" 2 , 7 "), "2,7")
        XCTAssertNil(AdxGuard.sanitizeGPPSID("abc"))
        XCTAssertLessThanOrEqual(AdxGuard.sanitizeGPPSID(String(repeating: "1,", count: 200))!.count, 128)
        let tcf = "CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA"
        XCTAssertEqual(AdxGuard.sanitizeConsent(" \(tcf) "), tcf)
        let max = String(repeating: "C", count: AdxGuard.maxConsentBytes)
        XCTAssertEqual(AdxGuard.sanitizeConsent(max), max)
        XCTAssertNil(AdxGuard.sanitizeConsent(max + "C"))
    }

    func testInvalidSlotIsNeverSent() {
        func params(_ r: AdRequest) -> [String: String?]? {
            AdxGuard.guardServeParams(apiKey: "pk_x", request: r).map { Dictionary(uniqueKeysWithValues: $0) }
        }
        XCTAssertNil(params(AdRequest()))
        XCTAssertNil(params(AdRequest(slotID: "s1")))
        XCTAssertNil(params(AdRequest(slotID: slot + "' or 1=1")))
        XCTAssertNil(params(AdRequest(slotName: "  ")))
        XCTAssertNil(params(AdRequest(slotName: String(repeating: "n", count: 129))))
        XCTAssertEqual(params(AdRequest(slotName: " home-top "))?["slot_name"] ?? nil, "home-top")
        let p = params(AdRequest(slotID: " \(slot) ", slotName: "ignored", pageURL: "https://s.com/#t"))!
        XCTAssertEqual(p["slot_id"] ?? nil, slot)
        XCTAssertEqual(p["slot_name"] ?? "x", nil)
        XCTAssertEqual(p["page_url"] ?? nil, "https://s.com/")
        XCTAssertEqual(p["api_key"] ?? nil, "pk_x")
    }

    func testRequestBudget() {
        let g = AdxRequestGuard()
        let t0 = 1_000_000.0
        for _ in 0..<AdxGuard.maxRequestsPerMinute { XCTAssertNil(g.acquire(nowMs: t0)) }
        XCTAssertEqual(g.acquire(nowMs: t0), 1)
        XCTAssertNil(g.acquire(nowMs: t0 + 1000))
        XCTAssertEqual(g.acquire(nowMs: t0 + 1000), 1)
    }

    func testBreaker429() {
        let g = AdxRequestGuard()
        g.record(status: 429, retryAfterSeconds: 30, nowMs: 0)
        XCTAssertEqual(g.acquire(nowMs: 1000), 29)
        XCTAssertNil(g.acquire(nowMs: 30_000))
        let d = AdxRequestGuard()
        d.record(status: 429, retryAfterSeconds: nil, nowMs: 0)
        XCTAssertEqual(d.acquire(nowMs: 0), 60)
        let c = AdxRequestGuard()
        c.record(status: 429, retryAfterSeconds: 86_400, nowMs: 0)
        XCTAssertEqual(c.acquire(nowMs: 0), 600)
        let o = AdxRequestGuard()
        o.record(status: 503, retryAfterSeconds: 999, nowMs: 0)
        XCTAssertNil(o.acquire(nowMs: 0))
    }

    func testUnsafeConfigDisablesClient() {
        XCTAssertNotNil(Adx(apiKey: "sk_live_secret").configError)
        XCTAssertNotNil(Adx(apiKey: "pk_x", baseURL: "http://api.adx.theaimart.co").configError)
        XCTAssertNotNil(Adx(apiKey: "pk_x", baseURL: "https://api.adx.theaimart.co@evil.com").configError)
        XCTAssertNil(Adx(apiKey: " pk_x\n", baseURL: "http://localhost:8080").configError)
    }
}
