import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Ad request parameters. Exactly one of `slotID` (preferred) / `slotName` is required.
public struct AdRequest {
    public var slotID: String?
    public var slotName: String?
    public var pageURL: String?
    public var pageKeywords: String?
    public var usPrivacy: String?
    public var euconsentV2: String?
    /// Previously stored `_an_id` value, for stable identity / frequency capping.
    public var identityCookie: String?
    /// IAB GPP string. Passed through; the backend does not parse it yet.
    public var gpp: String?
    /// IAB GPP applicable section ids, e.g. `"7"` or `"7,8"`. Any US section (7–12) makes the
    /// request contextual-only, like a CCPA opt-out (CONTRACT.md §3).
    public var gppSID: String?

    public init(
        slotID: String? = nil,
        slotName: String? = nil,
        pageURL: String? = nil,
        pageKeywords: String? = nil,
        usPrivacy: String? = nil,
        euconsentV2: String? = nil,
        identityCookie: String? = nil,
        gpp: String? = nil,
        gppSID: String? = nil
    ) {
        self.slotID = slotID
        self.slotName = slotName
        self.pageURL = pageURL
        self.pageKeywords = pageKeywords
        self.usPrivacy = usPrivacy
        self.euconsentV2 = euconsentV2
        self.identityCookie = identityCookie
        self.gpp = gpp
        self.gppSID = gppSID
    }
}

/// Client for the theaimart Ad Network. Zero third-party dependencies (URLSession + Foundation).
///
/// ```swift
/// let adx = Adx(apiKey: "pk_...")
/// adx.requestAd(AdRequest(slotID: "8b1f-uuid")) { ad in
///     if ad.filled { /* render ad.creative */ }
/// }
/// // Only once the creative is actually drawn AND ≥50% on screen for ≥1s (CONTRACT.md §9c):
/// adx.deliverViewable(impID, retryable: ad.source == .internal)
/// ```
///
/// `BannerAdView` does all of this for you. The `_an_id` identity cookie is kept by
/// `HTTPCookieStorage` through the session, so pass a session that stores cookies.
public final class Adx {
    private let apiKey: String
    private let baseURL: String
    private let timeout: TimeInterval
    private let userAgent: String
    private let session: URLSession
    private let requestGuard: AdxRequestGuard

    /// Why this client refuses to send anything, or nil when it is correctly configured
    /// (CONTRACT.md §12). An app must never crash because of an ad SDK, so an unsafe key or base
    /// URL disables the client instead of trapping: every request is a no-fill with reason
    /// `invalid_config`, and nothing is sent.
    public let configError: String?

    public init(
        apiKey: String,
        baseURL: String = AdxConstants.defaultBaseURL,
        timeout: TimeInterval = AdxConstants.defaultTimeout,
        userAgent: String? = nil,
        session: URLSession? = nil
    ) {
        precondition(!apiKey.isEmpty, "apiKey is required and must be non-empty")
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = AdxGuard.normalizeBaseURL(baseURL)
        let error: String?
        if !AdxGuard.isPublishableKey(key) {
            error = "apiKey must be a publishable site key (pk_…); never ship an account token or secret"
        } else if normalized == nil {
            error = "baseURL must be https:// (http only for a local host), with no credentials, query or fragment"
        } else {
            error = nil
        }
        if let error = error { NSLog("[theaimart-adx] %@", error) }
        self.configError = error
        self.apiKey = key
        var trimmed = normalized ?? baseURL
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        self.baseURL = trimmed
        self.timeout = timeout
        self.userAgent = userAgent.map(AdxGuard.safeHeaderValue) ?? Adx.defaultUserAgent()
        // The default session refuses redirects on every iOS version (the per-task delegate below
        // only exists on iOS 15+). It uses the shared cookie storage, so `_an_id` still persists.
        self.session = session ?? Adx.defaultSession
        self.requestGuard = AdxGuard.requestGuard(baseURL: trimmed, apiKey: key)
    }

    /// Never follows a redirect: no serve endpoint redirects, and following one would replay the
    /// request — `_an_id` cookie included — to whatever host it named.
    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        static let shared = NoRedirect()
        func urlSession(
            _ session: URLSession, task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping (URLRequest?) -> Void
        ) {
            completionHandler(nil)
        }
    }

    private static let defaultSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        return URLSession(configuration: config, delegate: NoRedirect.shared, delegateQueue: nil)
    }()

    private func send(_ req: URLRequest, _ done: @escaping (Data?, HTTPURLResponse?) -> Void) {
        let task = session.dataTask(with: req) { data, response, _ in
            // Bounded body (CONTRACT.md §12): anything larger is treated as no response.
            let body = (data?.count ?? 0) > AdxGuard.maxResponseBytes ? nil : data
            done(body, response as? HTTPURLResponse)
        }
        if #available(iOS 15.0, tvOS 15.0, macOS 12.0, *) {
            task.delegate = NoRedirect.shared
        }
        task.resume()
    }

    private static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    /// Request an ad. The completion is delivered on the main queue. Never fails for a no-fill.
    public func requestAd(_ request: AdRequest, completion: @escaping (Ad) -> Void) {
        func finish(_ ad: Ad) { DispatchQueue.main.async { completion(ad) } }
        if configError != nil {
            return finish(Ad.noFill(httpStatus: 0, reason: AdxGuard.reasonInvalidConfig))
        }
        // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server. An
        // invalid request (no slot, a slotID that is not a UUID) is a local no-fill — it used to
        // be a preconditionFailure, which crashed the host app.
        guard let params = AdxGuard.guardServeParams(apiKey: apiKey, request: request) else {
            return finish(Ad.noFill(httpStatus: 0, reason: AdxGuard.reasonInvalidRequest))
        }
        if let wait = requestGuard.acquire(nowMs: Adx.nowMs()) {
            return finish(Ad.noFill(httpStatus: 0, reason: AdxGuard.reasonRateLimited, retryAfterSeconds: wait))
        }
        let query = AdxEncoding.buildServeQuery(params)
        guard let url = URL(string: "\(baseURL)\(AdxConstants.serveAdPath)?\(query)") else {
            DispatchQueue.main.async { completion(Ad.noFill(httpStatus: 0)) }
            return
        }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = "GET"
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(AdxConstants.sdkIdentifier, forHTTPHeaderField: "X-Adx-Sdk")
        if let cookie = request.identityCookie, AdxGuard.isSafeIdentityCookie(cookie) {
            req.setValue("_an_id=\(cookie)", forHTTPHeaderField: "Cookie")
        }

        let requestGuard = self.requestGuard
        send(req) { data, http in
            let status = http?.statusCode ?? 0
            let retryAfter = (http?.value(forHTTPHeaderField: "Retry-After")).flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            requestGuard.record(status: status, retryAfterSeconds: retryAfter, nowMs: Adx.nowMs())
            let cookie = Adx.extractIdentityCookie(http?.value(forHTTPHeaderField: "Set-Cookie"))
            finish(Ad.fromJSON(httpStatus: status, data: data, retryAfterSeconds: retryAfter, setIdentityCookie: cookie))
        }
    }

    /// Fire the viewability beacon once (best-effort). No-ops for a nil/empty `impID`.
    public func reportViewable(_ impID: String?) {
        reportViewableOutcome(impID) { _ in }
    }

    /// Send the viewability beacon once and classify the answer (CONTRACT.md §5). `.retry` means
    /// the view was NOT counted — typically the beacon beat the impression into the database —
    /// and resending the same `impID` is safe. The completion runs on a background queue.
    public func reportViewableOutcome(_ impID: String?, completion: @escaping (ViewableOutcome) -> Void) {
        // Only an id the server could have issued is echoed back to it (CONTRACT.md §12).
        guard configError == nil, let impID = impID, AdxGuard.isSafeImpID(impID),
              let url = URL(string: "\(baseURL)\(AdxConstants.viewablePath)")
        else {
            completion(.drop)
            return
        }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.setValue(AdxConstants.sdkIdentifier, forHTTPHeaderField: "X-Adx-Sdk")
        let payload = ["imp_id": impID]
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        send(req) { data, http in
            completion(viewableOutcome(status: http?.statusCode ?? 0, body: data))
        }
    }

    /// Deliver a measured view: send the beacon and, while the server answers `.retry`, resend
    /// after 1 s, 2 s and 4 s, then give up (CONTRACT.md §5). Pass `retryable: false` for
    /// anything but an internal impression — an OpenRTB win is sent once.
    public func deliverViewable(_ impID: String?, retryable: Bool) {
        guard let impID = impID, !impID.isEmpty else { return }
        deliverWithRetry(
            retryable: retryable,
            send: { done in self.reportViewableOutcome(impID, completion: done) },
            after: { seconds, work in
                DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + seconds, execute: work)
            }
        )
    }

    /// Build a click-tracker URL. Rarely needed — prefer `ad.creative.clickURL`.
    public func clickURL(_ impID: String) -> String {
        "\(baseURL)\(AdxConstants.clickPath)?id=\(AdxEncoding.percentEncodeAll(impID))"
    }

    /// Fraud-safe User-Agent (CONTRACT.md §6): avoids every backend bot substring and includes an
    /// `iPhone`/`iPad` token so the server classifies the device correctly.
    public static func defaultUserAgent() -> String {
        #if canImport(UIKit)
        let os = UIDevice.current.systemVersion
        let token = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        return "theaimart-adx-ios/\(AdxConstants.version) (\(token); iOS \(os))"
        #else
        return "theaimart-adx-ios/\(AdxConstants.version) (iPhone)"
        #endif
    }

    static func extractIdentityCookie(_ setCookie: String?) -> String? {
        guard let setCookie = setCookie else { return nil }
        for segment in setCookie.split(separator: ";") {
            let trimmed = segment.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("_an_id=") {
                let value = String(trimmed.dropFirst("_an_id=".count))
                return AdxGuard.isSafeIdentityCookie(value) ? value : nil
            }
        }
        return nil
    }
}
