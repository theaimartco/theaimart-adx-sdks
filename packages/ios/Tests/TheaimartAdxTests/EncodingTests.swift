import XCTest
@testable import TheaimartAdx

final class EncodingTests: XCTestCase {

    private let nastyPageURL =
        "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com" +
        "&sel=select a table; drop-- update union open cast 1=1"

    func testPercentEncodeAllUppercaseHex() {
        XCTAssertEqual(AdxEncoding.percentEncodeAll("aZ0"), "%61%5A%30")
        XCTAssertEqual(AdxEncoding.percentEncodeAll("a@ =é"), "%61%40%20%3D%C3%A9")
    }

    func testPercentEncodeAllRoundtrips() {
        let encoded = AdxEncoding.percentEncodeAll(nastyPageURL)
        XCTAssertEqual(encoded.removingPercentEncoding, nastyPageURL)
    }

    func testBuildServeQuerySkipsNils() {
        let q = AdxEncoding.buildServeQuery([("api_key", "pk"), ("slot_id", nil), ("page_url", "x")])
        XCTAssertTrue(q.contains("api_key="))
        XCTAssertFalse(q.contains("slot_id="))
        XCTAssertTrue(q.contains("page_url="))
    }

    func testBuiltQueryIsWafSafeForHostileInput() {
        let q = AdxEncoding.buildServeQuery([
            ("api_key", "pk_live"),
            ("slot_id", "11111111-2222-3333-4444-555555555555"),
            ("page_url", nastyPageURL),
            ("page_keywords", "select,table,cast,end,open"),
        ])
        let lowered = q.lowercased()
        let offenders = AdxEncoding.sqlInjectionKeywords.filter { lowered.contains($0) }
        XCTAssertEqual(offenders, [])
        XCTAssertTrue(AdxEncoding.rawQueryIsWafSafe(q))
    }

    func testNaiveEncodingWouldBeUnsafe() {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=")
        let naive = "page_url=" + (nastyPageURL.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
        XCTAssertFalse(AdxEncoding.rawQueryIsWafSafe(naive))
    }
}
