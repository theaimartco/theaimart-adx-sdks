import Foundation

/// The §9c render gate, as a pure decision — CONTRACT.md §9c.
///
/// Every SDK asks this one question before it draws anything, and the answer is the *only* thing
/// allowed to arm the viewability beacon. `RenderPlan.none` means this surface cannot draw the
/// creative, so it is not an impression: no beacon, and the slot backs off and refills (§9a).
///
/// Deliberately UIKit-free so the rule is exercised by unit tests on every platform.
public enum RenderPlan: Equatable {
    /// Draw `creative.html` in a sandboxed `WKWebView`.
    case html
    /// Draw `creative.assetURL` as an image.
    case image
    /// Nothing can be drawn — not an impression.
    case none
}

/// Only http/https URLs may be loaded or opened — rejects `javascript:`/`file:`/`data:`/`intent:`.
public func isSafeHTTPURL(_ url: String?) -> Bool {
    guard let url = url else { return false }
    let lowered = url.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return lowered.hasPrefix("http://") || lowered.hasPrefix("https://")
}

/// - Parameter canRenderHTML: Whether this surface actually has a WebView available right now.
public func renderPlan(_ ad: Ad?, canRenderHTML: Bool) -> RenderPlan {
    guard let ad = ad, ad.filled, let creative = ad.creative else { return RenderPlan.none }
    if ad.kind == .html {
        // An OpenRTB creative with no WebView to put it in is a fill we cannot show.
        if let html = creative.html, !html.isEmpty, canRenderHTML { return RenderPlan.html }
        return RenderPlan.none
    }
    // §4e: a hostile asset URL is dropped, and a dropped creative is not an impression.
    return isSafeHTTPURL(creative.assetURL) ? RenderPlan.image : RenderPlan.none
}

/// What to do with a navigation an html/openrtb creative starts — CONTRACT.md §4e.
public enum CreativeNavigation: Equatable {
    /// Let the WebView load it. Only ever a sub-frame inside the creative.
    case allow
    /// A click-through: open it in the browser and refuse the in-WebView navigation.
    case openExternally
    /// Refuse it and do nothing.
    case block
}

/// How long after the user's last tap on the creative a top-level navigation still counts as
/// theirs. Ad click handlers commonly fire a tracker and redirect a few hundred ms later.
public let creativeGestureWindow: TimeInterval = 2.0

/// The §4e navigation rule — identical on every platform that renders html creatives.
///
///  * **Nothing leaves the app without a tap.** A top-level navigation with no user gesture
///    behind it is a forced redirect (the creative throwing the user into a scam page or an app
///    store the moment it loads). It is blocked, not opened.
///  * **The banner itself is never navigated.** A tapped top-level http/https navigation is a
///    click-through and opens outside the ad surface; any other scheme is dropped.
///  * A sub-frame inside the creative may load http/https/about content in place — that never
///    leaves the ad's box — but never another scheme.
public func creativeNavigation(_ url: String?, isMainFrame: Bool, userGesture: Bool) -> CreativeNavigation {
    guard let url = url else { return .block }
    let safe = isSafeHTTPURL(url)
    if !isMainFrame {
        let lowered = url.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return safe || lowered.hasPrefix("about:") ? .allow : .block
    }
    return safe && userGesture ? .openExternally : .block
}
