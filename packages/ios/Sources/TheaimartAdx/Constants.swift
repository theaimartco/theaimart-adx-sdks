import Foundation

// Wire-contract constants. See CONTRACT.md — the single source of truth.
public enum AdxConstants {
    public static let version = "1.1.0"

    /// Production ad server. Override via `Adx(baseURL:)`.
    public static let defaultBaseURL = "https://api.adx.theaimart.co"

    public static let serveAdPath = "/api/v1/serve/ad"
    public static let viewablePath = "/api/v1/serve/viewable"
    public static let clickPath = "/api/v1/serve/click"

    public static let defaultTimeout: TimeInterval = 10

    /// Auto-refresh floor (CONTRACT.md §9). Values below this are clamped up.
    public static let minRefreshSeconds = 30

    /// Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a).
    public static let maxRetrySeconds = 300

    /// X-Adx-Sdk observability header value (does not affect fraud scoring).
    static let sdkIdentifier = "theaimart-adx-ios/1.1.0"
}
