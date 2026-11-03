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
  /// Let the WebView load it in place. Only ever a sub-frame inside the creative (an OpenRTB
  /// tag's own iframe), which never leaves the ad's box.
  allow,

  /// A click-through. Open it *outside* the ad surface — `url_launcher`'s `launchUrl` with
  /// `LaunchMode.externalApplication` — and refuse the in-WebView navigation, so the creative
  /// cannot replace the banner with a page of its own choosing.
  openExternally,

  /// Refuse it and do nothing.
  block,
}

/// How long after the user's last tap on the creative a top-level navigation still counts as
/// theirs. Ad click handlers commonly fire a tracker and redirect a few hundred ms later.
const Duration creativeGestureWindow = Duration(seconds: 2);

/// Decide what to do with a navigation an html/openrtb creative initiates.
///
/// Call this from the navigation callback of whatever WebView the `htmlBuilder` supplies
/// (`NavigationDelegate(onNavigationRequest:)` for `webview_flutter`, passing
/// `request.isMainFrame`).
///
/// * **Nothing leaves the app without a tap.** A top-level navigation with no user gesture
///   behind it ([userGesture] false) is a forced redirect — the creative throwing the user into
///   a scam page or an app store the moment it loads. It is blocked, not opened. The WebView
///   does not report gestures, so record the time of the last pointer-up on the creative and pass
///   whether it was within [creativeGestureWindow].
/// * **The banner itself is never navigated.** A tapped top-level http/https navigation is a
///   click-through; any other scheme is dropped.
/// * A sub-frame may load http/https/about content in place, but never another scheme.
AdNavigation adNavigation(
  String? url, {
  required bool isMainFrame,
  required bool userGesture,
}) {
  if (url == null) return AdNavigation.block;
  final safe = isSafeHttpUrl(url);
  if (!isMainFrame) {
    return safe || url.trim().toLowerCase().startsWith('about:')
        ? AdNavigation.allow
        : AdNavigation.block;
  }
  return safe && userGesture ? AdNavigation.openExternally : AdNavigation.block;
}

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
