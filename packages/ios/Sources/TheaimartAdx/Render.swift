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
