//! Viewability-beacon response classification (CONTRACT.md §5).

use serde_json::Value;

/// What a `POST /serve/viewable` response means for the view it reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViewableOutcome {
    /// The server recorded the view (or already had it — `duplicate: true`).
    Recorded,
    /// Not counted, but resending is safe: too early, rate-limited, 5xx or no response.
    Retry,
    /// Permanent failure (e.g. `400`); resending would not help.
    Drop,
}

/// Classify a viewability-beacon response. `status` 0 means no response (transport error).
///
/// The backend writes impressions through an async buffer, so a beacon can arrive before the
/// row exists. It then answers `200 {"success": false, "retry": true}` and releases its dedup
/// key — the view was *not* counted. Reading only the status code turns that into a silent
/// success, which is how early beacons used to be lost for good.
pub fn viewable_outcome(status: u16, body: &[u8]) -> ViewableOutcome {
    if status == 0 || status == 429 || status >= 500 {
        return ViewableOutcome::Retry;
    }
    if !(200..300).contains(&status) {
        return ViewableOutcome::Drop;
    }
    let Ok(Value::Object(obj)) = serde_json::from_slice::<Value>(body) else {
        return ViewableOutcome::Drop;
    };
    if obj.get("success") == Some(&Value::Bool(true)) {
        ViewableOutcome::Recorded
    } else if obj.get("retry") == Some(&Value::Bool(true)) {
        ViewableOutcome::Retry
    } else {
        ViewableOutcome::Drop
    }
}
