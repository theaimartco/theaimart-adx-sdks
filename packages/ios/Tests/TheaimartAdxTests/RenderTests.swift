import XCTest
@testable import TheaimartAdx

/// CONTRACT.md §9c — the render gate. A fill this surface cannot draw is NOT an impression,
/// so it must never arm the viewability beacon.
final class RenderTests: XCTestCase {

    private func data(_ s: String) -> Data { Data(s.utf8) }

    private func imageAd(_ assetURL: String) -> Ad {
        Ad.fromJSON(
            httpStatus: 200,
            data: data("""
            {"fill":true,"imp_id":"imp1","creative":{"asset_url":"\(assetURL)","click_url":"https://x/c","width":300,"height":250}}
            """)
        )
    }

    private var htmlAd: Ad {
        Ad.fromJSON(
            httpStatus: 200,
            data: data("""
            {"fill":true,"source":"openrtb","imp_id":"imp1","creative":{"html":"<b>ad</b>","width":300,"height":250}}
            """)
        )
    }

    func testNoFillAndTransportErrorsAreNeverRenderable() {
        XCTAssertEqual(renderPlan(Ad.fromJSON(httpStatus: 200, data: data(#"{"fill":false}"#)), canRenderHTML: true), RenderPlan.none)
        XCTAssertEqual(renderPlan(Ad.fromJSON(httpStatus: 0, data: nil), canRenderHTML: true), RenderPlan.none)
        XCTAssertEqual(renderPlan(nil, canRenderHTML: true), RenderPlan.none)
    }

    func testOrdinaryImageCreativeRenders() {
        XCTAssertEqual(renderPlan(imageAd("https://cdn/x.png"), canRenderHTML: false), RenderPlan.image)
        XCTAssertEqual(renderPlan(imageAd("http://cdn/x.png"), canRenderHTML: false), RenderPlan.image)
    }

    func testHostileAssetURLIsDropped() {
        for hostile in ["javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AAAA", "intent://x"] {
            XCTAssertEqual(renderPlan(imageAd(hostile), canRenderHTML: true), RenderPlan.none, hostile)
        }
    }

    func testOpenRtbFillRendersOnlyWhereAWebViewExists() {
        XCTAssertEqual(renderPlan(htmlAd, canRenderHTML: true), RenderPlan.html)
        // A surface with no WebView cannot show OpenRTB demand — not an impression.
        XCTAssertEqual(renderPlan(htmlAd, canRenderHTML: false), RenderPlan.none)
    }

    func testHouseAdRendersButIsNotTrackable() {
        let house = Ad.fromJSON(
            httpStatus: 200,
            data: data(#"{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/x","width":300,"height":250}}"#)
        )
        XCTAssertEqual(renderPlan(house, canRenderHTML: true), RenderPlan.image)
        XCTAssertFalse(house.isTrackable)
    }

    func testSafeURLAllowlist() {
        XCTAssertTrue(isSafeHTTPURL("https://x.example/a"))
        XCTAssertTrue(isSafeHTTPURL("HTTP://x.example"))
        XCTAssertTrue(isSafeHTTPURL("  https://x.example  "))
        XCTAssertFalse(isSafeHTTPURL("javascript:alert(1)"))
        XCTAssertFalse(isSafeHTTPURL(nil))
        XCTAssertFalse(isSafeHTTPURL(""))
    }
}
