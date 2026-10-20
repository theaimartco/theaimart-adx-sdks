import XCTest
@testable import TheaimartAdx

final class ModelsTests: XCTestCase {

    private func data(_ s: String) -> Data { Data(s.utf8) }

    func testParsesInternalFillNoSourceField() {
        let body = """
        {"fill":true,"imp_id":"imp1","identity_id":"id1",
         "auction":{"type":"second_price","clearing_price_paise":120,"quality_score":0.83},
         "creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp1","headline":"Hi","width":300,"height":250}}
        """
        let ad = Ad.fromJSON(httpStatus: 200, data: data(body))
        XCTAssertTrue(ad.filled)
        XCTAssertEqual(ad.kind, .image)
        XCTAssertEqual(ad.source, .internal)
        XCTAssertEqual(ad.impID, "imp1")
        XCTAssertTrue(ad.isTrackable)
        XCTAssertEqual(ad.creative?.assetURL, "https://cdn/x.png")
        XCTAssertEqual(ad.auction?.clearingPricePaise, 120)
    }

    func testParsesOpenRtbHtmlFill() {
        let body = #"{"fill":true,"source":"openrtb","imp_id":"i","dsp":"DSP","creative":{"html":"<div>ad</div>","width":320,"height":50}}"#
        let ad = Ad.fromJSON(httpStatus: 200, data: data(body))
        XCTAssertEqual(ad.kind, .html)
        XCTAssertEqual(ad.source, .openrtb)
        XCTAssertEqual(ad.dsp, "DSP")
        XCTAssertEqual(ad.creative?.html, "<div>ad</div>")
    }

    func testParsesHouseFillNotTrackable() {
        let body = #"{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/landing","width":300,"height":250}}"#
        let ad = Ad.fromJSON(httpStatus: 200, data: data(body))
        XCTAssertEqual(ad.source, .house)
        XCTAssertEqual(ad.kind, .image)
        XCTAssertNil(ad.impID)
        XCTAssertFalse(ad.isTrackable)
    }

    func testNoFillAndErrors() {
        XCTAssertFalse(Ad.fromJSON(httpStatus: 200, data: data(#"{"fill":false}"#)).filled)
        XCTAssertEqual(Ad.fromJSON(httpStatus: 200, data: data(#"{"fill":false,"reason":"fraud_rejected"}"#)).reason, "fraud_rejected")
        XCTAssertEqual(Ad.fromJSON(httpStatus: 429, data: data(#"{"fill":false}"#), retryAfterSeconds: 60).retryAfterSeconds, 60)
        XCTAssertFalse(Ad.fromJSON(httpStatus: 400, data: data("not json")).filled)
        XCTAssertFalse(Ad.fromJSON(httpStatus: 200, data: nil).filled)
    }

    func testCreativeDimensionsDefault() {
        let ad = Ad.fromJSON(httpStatus: 200, data: data(#"{"fill":true,"creative":{"asset_url":"x","click_url":"y"}}"#))
        XCTAssertEqual(ad.creative?.width, 300)
        XCTAssertEqual(ad.creative?.height, 250)
    }

    func testExtractIdentityCookie() {
        XCTAssertEqual(Adx.extractIdentityCookie("_an_id=abc123; Path=/; HttpOnly"), "abc123")
        XCTAssertNil(Adx.extractIdentityCookie(nil))
    }
}
