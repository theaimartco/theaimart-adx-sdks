import Foundation

/// What a `POST /serve/viewable` response means for the view it reported (CONTRACT.md §5).
public enum ViewableOutcome: Equatable {
    /// The server recorded the view (or already had it — `duplicate: true`).
    case recorded
    /// Not counted, but resending is safe: too early, rate-limited, 5xx or no response.
    case retry
    /// Permanent failure (e.g. `400`); resending would not help.
    case drop
}

/// Wait before each resend of a beacon answered `.retry`: attempts land at roughly t = 0, 1, 3
/// and 7 s. The backend flushes impressions every 500 ms by default, so this covers a slow flush
/// several times over without keeping a dead beacon alive.
public let viewableRetryDelaysSeconds: [Int] = [1, 2, 4]

/// Classify a viewability-beacon response. `status` 0 means no response (transport error).
///
/// The backend writes impressions through an async buffer, so a beacon can arrive before the row
/// exists. It then answers `200 {"success": false, "retry": true}` and releases its dedup key —
/// the view was *not* counted. Reading only the status code turns that into a silent success,
/// which is how early beacons used to be lost for good.
public func viewableOutcome(status: Int, body: Data?) -> ViewableOutcome {
    if status == 0 || status == 429 || status >= 500 { return .retry }
    guard (200..<300).contains(status) else { return .drop }
    guard let body = body,
          let object = try? JSONSerialization.jsonObject(with: body, options: []),
          let json = object as? [String: Any]
    else { return .drop }
    // `as? Bool` never bridges a JSON string, so `"success": "true"` is not a success.
    if (json["success"] as? Bool) == true { return .recorded }
    if (json["retry"] as? Bool) == true { return .retry }
    return .drop
}

/// Send a measured view, resending it on `viewableRetryDelaysSeconds` while the answer is
/// `.retry` and `retryable` is true, then give up. Only an internal impression is retryable: an
/// OpenRTB win never gets a row the beacon could mark, so its answer is `.retry` forever.
///
/// `send` performs one beacon and reports its outcome; `after` runs work after a delay. Both are
/// injected so the schedule is unit-tested without a network or a clock.
func deliverWithRetry(
    retryable: Bool,
    attempt: Int = 0,
    send: @escaping (@escaping (ViewableOutcome) -> Void) -> Void,
    after: @escaping (TimeInterval, @escaping () -> Void) -> Void,
    completion: @escaping (ViewableOutcome) -> Void = { _ in }
) {
    send { outcome in
        guard outcome == .retry, retryable, attempt < viewableRetryDelaysSeconds.count else {
            completion(outcome)
            return
        }
        after(TimeInterval(viewableRetryDelaysSeconds[attempt])) {
            deliverWithRetry(
                retryable: retryable,
                attempt: attempt + 1,
                send: send,
                after: after,
                completion: completion
            )
        }
    }
}
