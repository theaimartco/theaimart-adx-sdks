import XCTest
@testable import TheaimartAdx

/// CONTRACT.md §9a — the continuous-fill scheduling policy.
///
/// This is the shared conformance table. Every SDK in the repository ships the same cases;
/// if you change one, change them all.
final class ScheduleTests: XCTestCase {

    func testRefreshDisabledIsSingleShot() {
        XCTAssertNil(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 0))
        XCTAssertNil(nextDelaySeconds(rendered: false, consecutiveFailures: 3, retryAfterSeconds: nil, refreshSeconds: 0))
        XCTAssertNil(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: 60, refreshSeconds: -5))
    }

    func testRenderedAdRefreshesAtRequestedIntervalFlooredAt30s() {
        XCTAssertEqual(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 60), 60)
        XCTAssertEqual(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 30), 30)
        XCTAssertEqual(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 10), AdxConstants.minRefreshSeconds)
        XCTAssertEqual(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 1), AdxConstants.minRefreshSeconds)
    }

    func testFailuresBackOffAndCap() {
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: nil, refreshSeconds: 30), 30)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 2, retryAfterSeconds: nil, refreshSeconds: 30), 60)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 3, retryAfterSeconds: nil, refreshSeconds: 30), 120)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 4, retryAfterSeconds: nil, refreshSeconds: 30), 240)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 5, retryAfterSeconds: nil, refreshSeconds: 30), AdxConstants.maxRetrySeconds)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 99, retryAfterSeconds: nil, refreshSeconds: 30), AdxConstants.maxRetrySeconds)
        // A very long outage must not overflow into a negative or absurd delay.
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: Int.max, retryAfterSeconds: nil, refreshSeconds: 30), AdxConstants.maxRetrySeconds)
    }

    func testRetryAfterPushesOutNeverIn() {
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: 90, refreshSeconds: 30), 90)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 5, retryAfterSeconds: 10, refreshSeconds: 30), AdxConstants.maxRetrySeconds)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: 0, refreshSeconds: 30), 30)
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: nil, refreshSeconds: 30), 30)
    }

    func testSlowRequestedIntervalIsHonouredOnFailureToo() {
        XCTAssertEqual(nextDelaySeconds(rendered: false, consecutiveFailures: 1, retryAfterSeconds: nil, refreshSeconds: 600), 600)
        XCTAssertEqual(nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 600), 600)
    }

    func testLoopStaysInsideThePerKeyRateLimit() {
        let floor = nextDelaySeconds(rendered: true, consecutiveFailures: 0, retryAfterSeconds: nil, refreshSeconds: 1)
        XCTAssertNotNil(floor)
        XCTAssertLessThanOrEqual(60.0 / Double(floor!), 2.0)
    }
}
