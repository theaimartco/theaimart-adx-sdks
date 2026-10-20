import XCTest
@testable import TheaimartAdx

/// CONTRACT.md §5 — every viewability-beacon response, and the resend schedule.
final class ViewableTests: XCTestCase {

    private func data(_ json: String) -> Data { Data(json.utf8) }

    func testClassifiesEveryContractResponse() {
        let tooEarly = #"{"success":false,"reason":"impression_not_recorded_yet","retry":true}"#
        let cases: [(Int, String?, ViewableOutcome)] = [
            (200, #"{"success":true}"#, .recorded),
            (200, #"{"success":true,"duplicate":true}"#, .recorded),
            (200, tooEarly, .retry),
            (0, nil, .retry),
            (429, #"{"error":"rate limit"}"#, .retry),
            (500, nil, .retry),
            (503, "oops", .retry),
            (400, "Json deserialize error", .drop),
            (404, nil, .drop),
            (200, #"{"success":false}"#, .drop),
            (200, nil, .drop),
            (200, "", .drop),
            (200, "[true]", .drop),
            (200, #"{"success":"true"}"#, .drop),
        ]
        for (status, body, want) in cases {
            XCTAssertEqual(
                viewableOutcome(status: status, body: body.map { data($0) }), want, "\(status) \(body ?? "nil")"
            )
        }
    }

    /// Runs `deliverWithRetry` synchronously: scripted answers, an instant clock.
    private func deliver(
        _ answers: [ViewableOutcome], retryable: Bool
    ) -> (sends: Int, delays: [TimeInterval], outcome: ViewableOutcome?) {
        var sends = 0
        var delays: [TimeInterval] = []
        var final: ViewableOutcome?
        deliverWithRetry(
            retryable: retryable,
            send: { done in
                let answer = answers[min(sends, answers.count - 1)]
                sends += 1
                done(answer)
            },
            after: { seconds, work in
                delays.append(seconds)
                work()
            },
            completion: { final = $0 }
        )
        return (sends, delays, final)
    }

    func testResendsATooEarlyBeaconUntilRecorded() {
        let run = deliver([.retry, .retry, .recorded], retryable: true)
        XCTAssertEqual(run.sends, 3)
        XCTAssertEqual(run.delays, [1, 2])
        XCTAssertEqual(run.outcome, .recorded)
    }

    func testGivesUpAfterTheSchedule() {
        let run = deliver([.retry], retryable: true)
        XCTAssertEqual(run.sends, 4)
        XCTAssertEqual(run.delays, [1, 2, 4])
        XCTAssertEqual(run.outcome, .retry)
    }

    func testNeverResendsOpenRtbOrAPermanentFailure() {
        XCTAssertEqual(deliver([.retry], retryable: false).sends, 1, "OpenRTB has no impression row")
        XCTAssertEqual(deliver([.drop], retryable: true).sends, 1)
    }
}
