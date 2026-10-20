// The §9c render gate, as a pure decision — CONTRACT.md §9c.
//
// Every SDK asks this one question before it draws anything, and the answer is the *only* thing
// allowed to arm the viewability beacon. [RenderPlan.none] means this surface cannot draw the
// creative, so it is not an impression: no beacon, and the slot backs off and refills (§9a).

import 'models.dart';

/// Only http/https URLs may be loaded or opened — rejects `javascript:`/`file:`/`data:`/`intent:`.
///
/// The value is trimmed first. `Uri.tryParse` returns `null` for a string with leading
/// whitespace, so without the trim a creative URL that merely arrived padded — which every
/// other SDK accepts, because they all compare against a trimmed value — was dropped here
/// alone. That failed closed (lost fill, never an unsafe render), but it made this the one
/// platform where a valid creative would not draw.
bool isSafeHttpUrl(String? url) {
  if (url == null) return false;
  final scheme = Uri.tryParse(url.trim())?.scheme.toLowerCase();
  return scheme == 'http' || scheme == 'https';
}

/// What an integrator's `BannerAd.htmlBuilder` must do with a navigation that an
/// html/openrtb creative starts from inside its own WebView — CONTRACT.md §4e.
///
/// This SDK deliberately does not depend on a WebView package, so unlike the Web, Android and
/// React Native SDKs it cannot enforce this itself: the WebView belongs to the application.
/// What it can do is carry the rule, tested and identical to the other platforms, so an
/// `htmlBuilder` does not have to invent one.
///
/// It matters because an OpenRTB creative is third-party markup. A WebView that follows
/// whatever the creative navigates to will follow `intent://`, `market://`, `tel:` or a custom
/// app scheme straight into another app on the device.
enum AdNavigation {
  /// A click-through. Open it *outside* the ad surface — `url_launcher`'s `launchUrl` with
  /// `LaunchMode.externalApplication` — and refuse the in-WebView navigation, so the creative
  /// cannot replace the banner with a page of its own choosing.
  openExternally,

  /// Refuse it and do nothing. No legitimate creative needs any other scheme.
  block,
}

/// Decide what to do with a navigation an html/openrtb creative initiates.
///
/// Call this from the navigation callback of whatever WebView the `htmlBuilder` supplies
/// (`NavigationDelegate(onNavigationRequest:)` for `webview_flutter`). The creative's own
/// markup is loaded from a string with no base URL and its sub-resources are not navigations,
/// so only a top-level navigation the creative starts reaches this decision.
AdNavigation adNavigation(String? url) =>
    isSafeHttpUrl(url) ? AdNavigation.openExternally : AdNavigation.block;

enum RenderPlan {
  /// Draw `creative.html` in a sandboxed WebView.
  html,

  /// Draw `creative.assetUrl` as an image.
  image,

  /// Nothing can be drawn — not an impression.
  none,
}

/// [canRenderHtml] — whether this surface actually has a WebView available right now.
RenderPlan renderPlan(Ad? ad, bool canRenderHtml) {
  if (ad == null || !ad.filled || ad.creative == null) return RenderPlan.none;
  final c = ad.creative!;
  if (ad.kind == AdKind.html) {
    // An OpenRTB creative with no WebView to put it in is a fill we cannot show.
    final html = c.html;
    if (html != null && html.isNotEmpty && canRenderHtml)
      return RenderPlan.html;
    return RenderPlan.none;
  }
  // §4e: a hostile asset URL is dropped, and a dropped creative is not an impression.
  if (isSafeHttpUrl(c.assetUrl)) return RenderPlan.image;
  return RenderPlan.none;
}
