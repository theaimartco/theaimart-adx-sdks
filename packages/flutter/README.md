# Theaimart ADX Flutter SDK

The official **Theaimart ADX Flutter SDK** for integrating advertisements and monetizing Flutter applications across **Android, iOS, web, Windows, macOS, and Linux**.

Built for cross-platform Flutter developers, `theaimart_adx` provides a lightweight API for requesting, rendering, tracking, and managing advertisements through the [Theaimart Ad Network](https://adx.theaimart.co).

The SDK implements version 1 of the [Theaimart ADX wire contract](../../CONTRACT.md).

```yaml
dependencies:
  theaimart_adx: ^1.0.0
```

## Highlights

* Cross-platform Flutter ad SDK
* Android and iOS app monetization
* Flutter web advertising support
* Windows, macOS, and Linux support
* Drop-in `BannerAd` widget
* Direct `AdxClient` API
* Automatic image-ad rendering
* Automatic click handling
* Automatic viewability tracking
* Custom HTML and OpenRTB creative rendering
* Fraud-safe platform User-Agent generation
* SQL-filter-safe request encoding
* Fail-closed response handling
* Typed ad-response models
* Testable HTTP client architecture
* Compatibility with the Theaimart ADX wire contract v1

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Supported Platforms](#supported-platforms)
* [Features](#features)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Banner Ad Integration](#banner-ad-integration)
* [Image Ads](#image-ads)
* [HTML and OpenRTB Creatives](#html-and-openrtb-creatives)
* [Direct Client Usage](#direct-client-usage)
* [Viewability Tracking](#viewability-tracking)
* [Click Handling](#click-handling)
* [User-Agent and Device Classification](#user-agent-and-device-classification)
* [Security and Request Encoding](#security-and-request-encoding)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [Ad Response Model](#ad-response-model)
* [API Reference](#api-reference)
* [Application Lifecycle](#application-lifecycle)
* [Production Integration](#production-integration)
* [Testing](#testing)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for developers, publishers, and software businesses.

The Theaimart ADX Flutter SDK connects a Flutter application to the Theaimart advertising infrastructure. It allows an application to:

1. Request an advertisement for a configured ad slot.
2. Receive a filled ad or a safe no-fill response.
3. Render image, HTML, or supported OpenRTB creatives.
4. Track viewable impressions.
5. Open registered advertisement click URLs.
6. Identify the demand source behind an advertisement.
7. Monetize application traffic across supported Flutter platforms.

The package is designed for applications that need a consistent advertising API across mobile, web, and desktop environments.

---

## Supported Platforms

The SDK is designed for Flutter applications targeting:

| Platform | Support   |
| -------- | --------- |
| Android  | Supported |
| iOS      | Supported |
| Web      | Supported |
| Windows  | Supported |
| macOS    | Supported |
| Linux    | Supported |

Platform-specific capabilities can vary.

For example:

* Image rendering uses Flutter's network-image support.
* External click navigation depends on the URL-launching implementation available for the target platform.
* HTML creatives require an application-provided `htmlBuilder`.
* WebView availability and configuration differ between mobile, web, and desktop platforms.

Applications should test their selected creative renderer on every platform they intend to release.

---

## Features

### Cross-platform Flutter integration

Use one SDK API across Android, iOS, web, and desktop Flutter applications.

### Drop-in banner widget

The `BannerAd` widget manages the standard advertisement lifecycle:

* Sending the ad request
* Parsing the response
* Rendering supported image creatives
* Detecting ad viewability
* Reporting viewable impressions
* Handling clicks
* Reporting loaded and failed states

### Direct API access

Applications that require custom interfaces can use `AdxClient` directly and render the returned advertisement themselves.

### Automatic image rendering

Image creatives can be rendered through Flutter's `Image.network`.

### Automatic click navigation

Supported banner creatives can open their registered click destination using the configured URL-launching implementation.

### Automatic viewability measurement

The managed banner tracks viewability and reports the impression after the advertisement remains at least 50% visible for at least one second.

### Custom HTML creative rendering

HTML and OpenRTB creatives can be rendered through an application-provided `htmlBuilder`.

This gives the host application control over:

* WebView selection
* WebView security policy
* Navigation behavior
* JavaScript configuration
* Cookie handling
* Platform-specific rendering
* Creative dimensions

### Safe response parsing

The SDK handles the supported wire-response variants through typed union parsing.

### Fail-closed behavior

Malformed responses, unsupported creatives, network failures, and rendering errors result in no-fill behavior instead of destabilizing the host application.

### Platform-aware User-Agent

`platformUserAgent()` generates a User-Agent containing a recognizable platform token for backend device classification.

### Request-value encoding

Free-text request parameters are encoded according to the Theaimart ADX wire contract before being sent to the backend.

---

## Installation

Add `theaimart_adx` to your Flutter application's `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter

  theaimart_adx: ^1.0.0
```

Fetch the package:

```bash
flutter pub get
```

Import it into your Dart code:

```dart
import 'package:theaimart_adx/theaimart_adx.dart';
```

Depending on the creative types and platforms used by your application, you may also need packages for URL launching or WebView rendering.

For example:

```yaml
dependencies:
  url_launcher: ^6.0.0
  webview_flutter: ^4.0.0
```

Use versions compatible with your application's current Flutter toolchain.

---

## Quick Start

Add a drop-in banner advertisement to your widget tree:

```dart
import 'package:flutter/material.dart';
import 'package:theaimart_adx/theaimart_adx.dart';

class MonetizedScreen extends StatelessWidget {
  const MonetizedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My App'),
      ),
      body: Column(
        children: [
          const Expanded(
            child: Center(
              child: Text('Application content'),
            ),
          ),
          BannerAd(
            apiKey: 'pk_your_publisher_key',
            slotId: '8b1f2c3d-0000-0000-0000-000000000000',
            onAdLoaded: (ad) {
              debugPrint('Ad filled from ${ad.source}');
            },
            onAdFailed: (reason) {
              debugPrint('No fill: $reason');
            },
          ),
        ],
      ),
    );
  }
}
```

Replace:

* `pk_your_publisher_key` with your public Theaimart ADX publisher key
* The example UUID with the slot ID configured for your placement

Do not place private server credentials or administrative API keys inside a Flutter application.

---

## Banner Ad Integration

`BannerAd` is the recommended integration for standard banner placements.

```dart
BannerAd(
  apiKey: 'pk_your_publisher_key',
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
  onAdLoaded: (ad) {
    debugPrint(
      'Loaded ${ad.kind} advertisement from ${ad.source}',
    );
  },
  onAdFailed: (reason) {
    debugPrint('Advertisement unavailable: $reason');
  },
)
```

The widget manages:

* Client creation
* Ad request execution
* Response parsing
* Filled/no-fill state
* Image creative rendering
* Impression viewability
* Viewability reporting
* Click handling
* Failure isolation

### Placement inside a layout

```dart
Column(
  children: [
    const Expanded(
      child: AppContent(),
    ),
    SafeArea(
      top: false,
      child: BannerAd(
        apiKey: 'pk_your_publisher_key',
        slotId: 'footer-banner-slot-id',
      ),
    ),
  ],
)
```

### Placement inside a scrollable screen

```dart
ListView(
  children: [
    const ContentSection(),
    const SizedBox(height: 16),
    BannerAd(
      apiKey: 'pk_your_publisher_key',
      slotId: 'content-banner-slot-id',
      onAdFailed: (reason) {
        debugPrint('Content banner returned no fill: $reason');
      },
    ),
    const SizedBox(height: 16),
    const MoreContentSection(),
  ],
)
```

Ensure that the advertisement is not obscured, clipped unexpectedly, or placed in a layout that prevents viewability from being measured correctly.

---

## User Identity and Frequency Capping

The ad server identifies a user by its `_an_id` cookie. `package:http` has no cookie jar, so
`BannerAd` keeps that value itself and sends it with every request — without it, every request
is a new user to the server, frequency caps never hold, and the same ad can repeat without limit.

By default the identity lives for the life of the process (`AdxIdentityStore.memory`, shared by
every banner). To keep it across launches — which is what daily frequency caps need — back it
with your own storage:

```dart
class PrefsIdentityStore extends AdxIdentityStore {
  const PrefsIdentityStore();

  @override
  Future<String?> load() async =>
      (await SharedPreferences.getInstance()).getString('theaimart_adx_an_id');

  @override
  Future<void> save(String value) async =>
      (await SharedPreferences.getInstance()).setString('theaimart_adx_an_id', value);
}

BannerAd(apiKey: 'pk_...', slotId: '...', identityStore: const PrefsIdentityStore());
```

The value is opaque and signed by the server — store it as-is. On Flutter Web the browser owns
cookies and the store is not used.

## Image Ads

Image creatives are rendered using Flutter's network-image support.

Conceptually, the managed widget performs behavior equivalent to:

```dart
Image.network(
  imageUrl,
  fit: BoxFit.contain,
)
```

When a user taps the advertisement, the SDK opens the registered click URL using the configured URL-launching behavior.

The managed banner is responsible for:

* Loading the creative
* Displaying the image
* Preserving the advertisement interaction
* Triggering the registered click
* Reporting the impression after the viewability threshold is met

### Custom image rendering

Applications using `AdxClient` directly can render an image creative themselves:

```dart
final adx = AdxClient(
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
);

final ad = await adx.requestAd(
  const AdRequest(
    slotId: '8b1f2c3d-0000-0000-0000-000000000000',
  ),
);

if (ad.filled && ad.kind == AdKind.image) {
  final creative = ad.creative;

  // Extract and render the image URL according to the creative model.
}
```

Custom renderers are responsible for implementing correct click and viewability behavior.

---

## HTML and OpenRTB Creatives

The SDK does not force a single WebView dependency on every Flutter application, so for
HTML/OpenRTB creatives you supply an `htmlBuilder`. That makes the sandbox **yours to get right** —
this is the one rendering path the SDK cannot secure on your behalf, because it never creates the
WebView.

An OpenRTB creative is third-party markup from a DSP. Treat it as hostile. A renderer that simply
drops `html` into a WebView and follows whatever it navigates to will follow `intent://`,
`market://`, `tel:` or a custom app scheme straight into another app on the device.

The SDK exports the navigation rule so you do not have to invent one — `adNavigation(url)` is the
same decision the Web, Android and React Native SDKs apply internally, and it is unit-tested here.

Add `webview_flutter` and `url_launcher` to *your* app, then:

```dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:theaimart_adx/theaimart_adx.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Renders an OpenRTB creative under CONTRACT.md §4e.
class AdHtmlRenderer extends StatefulWidget {
  const AdHtmlRenderer({
    super.key,
    required this.html,
    required this.width,
    required this.height,
  });

  final String html;
  final int width;
  final int height;

  @override
  State<AdHtmlRenderer> createState() => _AdHtmlRendererState();
}

class _AdHtmlRendererState extends State<AdHtmlRenderer> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      // Ads need scripts. This is why every other control below matters.
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            // The creative's own markup loads as `about:blank` (no base URL). Some platform
            // implementations route that initial load through here, so let it through —
            // it is our own content, not a navigation the creative chose.
            if (request.url == 'about:blank') return NavigationDecision.navigate;

            switch (adNavigation(request.url)) {
              case AdNavigation.openExternally:
                // A click-through leaves the ad surface for the browser. The banner itself is
                // never navigated away from, so the creative cannot replace it with a page of
                // its own choosing.
                unawaited(launchUrl(
                  Uri.parse(request.url.trim()),
                  mode: LaunchMode.externalApplication,
                ));
                return NavigationDecision.prevent;
              case AdNavigation.block:
                return NavigationDecision.prevent;
            }
          },
        ),
      )
      // No base URL: the creative gets an opaque origin and can reach nothing of yours.
      ..loadHtmlString(widget.html);
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.width.toDouble(),
        height: widget.height.toDouble(),
        child: WebViewWidget(controller: _controller),
      );
}
```

Wire it up:

```dart
BannerAd(
  apiKey: 'pk_your_publisher_key',
  slotId: 'html-banner-slot-id',
  htmlBuilder: (context, html, width, height) =>
      AdHtmlRenderer(html: html, width: width, height: height),
  onAdLoaded: (ad) => debugPrint('Loaded HTML advertisement'),
  onAdFailed: (reason) => debugPrint('HTML advertisement unavailable: $reason'),
)
```

Two things not to add, whatever a creative or a vendor asks for:

* **No JavaScript channel.** `addJavaScriptChannel` hands third-party markup a callable bridge into
  your Dart code. It is the primary native-WebView RCE vector; no ad needs one.
* **No file or content access.** If you configure the platform WebView directly
  (`AndroidWebViewController`), leave file and content access off — a remote creative has no
  business reading local files.

If you do not supply an `htmlBuilder`, `BannerAd` refuses OpenRTB fills outright (§9c): it reports
`onAdFailed`, does not fire a viewability beacon, and backs off and refills. That is a safe default,
not a silent one — but it means you serve no OpenRTB demand at all until you add a renderer.

### Adapting the renderer

The renderer above targets `webview_flutter`. If you use a different WebView package or support
desktop, the package-specific API changes but the rules do not:

* route every navigation the creative starts through `adNavigation(url)`;
* open an `AdNavigation.openExternally` result *outside* the ad surface and prevent the in-WebView
  navigation;
* load the markup with **no base URL**, so the creative gets an opaque origin;
* expose **no** JavaScript bridge, and leave file/content access off.

Do not ship a renderer that only constrains size. A creative that is the right size and still gets
to choose where the WebView navigates is not contained.

### Why `htmlBuilder` is application-provided

This architecture avoids forcing a heavy or platform-limited WebView dependency into every application.

It also allows developers to choose:

* `webview_flutter`
* A desktop-compatible WebView package
* A web-specific renderer
* A sandboxed custom renderer
* A platform-specific widget implementation

---

## Direct Client Usage

Use `AdxClient` when the application needs complete control over ad requests and creative rendering.

```dart
final adx = AdxClient(
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
);

try {
  final ad = await adx.requestAd(
    const AdRequest(
      slotId: '8b1f2c3d-0000-0000-0000-000000000000',
    ),
  );

  if (!ad.filled) {
    debugPrint('No fill: ${ad.reason}');
    return;
  }

  debugPrint('Filled ad from ${ad.source}');

  if (ad.isTrackable && ad.impId != null) {
    await adx.reportViewable(ad.impId!);
  }
} finally {
  adx.close();
}
```

### Important lifecycle rule

Always close an `AdxClient` that is no longer needed:

```dart
adx.close();
```

Closing the client releases the underlying HTTP resources owned by that instance.

### Reusable client

For applications making multiple requests, create a reusable client and close it when the owning service is disposed.

```dart
class AppAdService {
  AppAdService({
    required String apiKey,
  }) : _client = AdxClient(
          apiKey: apiKey,
          userAgent: platformUserAgent(),
        );

  final AdxClient _client;

  Future<Ad> requestBanner(String slotId) {
    return _client.requestAd(
      AdRequest(slotId: slotId),
    );
  }

  Future<void> reportViewable(String impressionId) {
    return _client.reportViewable(impressionId);
  }

  void dispose() {
    _client.close();
  }
}
```

---

## Viewability Tracking

The managed `BannerAd` widget automatically reports an impression when the advertisement is:

* At least 50% visible
* Continuously visible for at least one second
* Associated with a trackable impression ID

This helps prevent impressions from being counted before an advertisement has actually entered a viewable state.

### Managed banner behavior

```dart
BannerAd(
  apiKey: 'pk_your_publisher_key',
  slotId: 'banner-slot-id',
)
```

No manual `reportViewable` call is required when using the standard widget.

### Custom renderer behavior

When using `AdxClient` directly, report the impression only after your own renderer has confirmed that the advertisement meets the required viewability conditions.

```dart
if (ad.filled && ad.isTrackable && ad.impId != null) {
  await adx.reportViewable(ad.impId!);
}
```

Do not report an advertisement immediately after receiving the response unless it has actually satisfied the viewability requirement.

Possible custom measurement approaches include:

* Visibility-detection widgets
* Render-object bounds
* Scroll-position tracking
* Application lifecycle awareness
* Window visibility checks
* Route visibility checks

---

## Click Handling

For managed image banners, click behavior is handled automatically.

The SDK associates the user interaction with the impression and opens the registered destination through the platform's URL-launching mechanism.

For custom creative rendering, use the SDK-provided click information rather than opening an unregistered destination independently.

Applications should:

* Validate that the destination is a supported URI
* Use external application mode where appropriate
* Handle launch failures safely
* Avoid intercepting the click for unrelated application actions
* Prevent repeated accidental activations
* Preserve the advertisement's registered tracking flow

A click-navigation failure should not crash the application.

---

## User-Agent and Device Classification

Theaimart ADX uses the request User-Agent as one signal for SDK identification and device classification.

Create the client using:

```dart
final adx = AdxClient(
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
);
```

`platformUserAgent()` generates a User-Agent with a structure similar to:

```text
theaimart-adx-flutter/<version> (<platform-token>)
```

Examples may include recognizable platform tokens such as:

```text
theaimart-adx-flutter/1.0.0 (Android)
theaimart-adx-flutter/1.0.0 (iPhone)
theaimart-adx-flutter/1.0.0 (Windows)
theaimart-adx-flutter/1.0.0 (macOS)
theaimart-adx-flutter/1.0.0 (Linux)
```

The platform-aware User-Agent:

* Identifies the official Flutter SDK
* Communicates the SDK version
* Includes a recognizable device or operating-system token
* Supports backend traffic classification
* Avoids generic HTTP-client identifiers
* Reduces false bot classification
* Helps prevent silent no-fill caused by blocked User-Agent patterns

The User-Agent rules are defined in [CONTRACT.md section 6](../../CONTRACT.md).

### Custom User-Agent

Only override the generated User-Agent when you have a controlled and verified reason.

A custom value should continue to include:

* The Theaimart ADX Flutter SDK identifier
* The SDK version
* A supported platform token

Removing the platform token can prevent the backend from classifying the request correctly.

---

## Security and Request Encoding

The SDK encodes free-text request values according to the rules defined in [CONTRACT.md section 7](../../CONTRACT.md).

This protects normal values such as URLs and application metadata from being misclassified by backend filtering or Web Application Firewall rules.

The encoding layer is designed to:

* Preserve valid free-text values
* Produce deterministic request parameters
* Prevent malformed query construction
* Avoid raw values unexpectedly triggering security filters
* Keep requests compatible with SQL-backed targeting filters
* Reduce unsafe input propagation

### Public publisher keys

The API key used in a Flutter application must be a public publisher key intended for client-side distribution:

```text
pk_your_publisher_key
```

Never embed the following inside a Flutter application:

* Administrative credentials
* Secret backend keys
* Database passwords
* Private signing keys
* Advertiser billing credentials
* Internal service tokens
* Infrastructure access credentials

Flutter mobile and desktop application bundles can be inspected by end users. Flutter web application code and configuration are delivered directly to the browser.

---

## Error and No-Fill Handling

Advertising failures should never interrupt the application's primary functionality.

The SDK therefore uses fail-closed behavior.

Examples of conditions that can produce a safe no-fill result include:

* Network connection failure
* DNS failure
* Request timeout
* Invalid HTTP response
* Malformed JSON
* Missing response fields
* Unsupported response variant
* Unsupported creative type
* Invalid impression identifier
* Creative-rendering failure
* Viewability-report failure
* Click-launch failure

Expected behavior:

```text
Error → no fill or ignored best-effort tracking failure
```

Unsafe behavior avoided by the SDK:

```text
Error → uncaught exception that crashes the application
```

Use `onAdFailed` to collapse or replace the placement:

```dart
BannerAd(
  apiKey: 'pk_your_publisher_key',
  slotId: 'banner-slot-id',
  onAdFailed: (reason) {
    debugPrint('Ad unavailable: $reason');
  },
)
```

For direct client usage:

```dart
final ad = await adx.requestAd(
  const AdRequest(
    slotId: 'banner-slot-id',
  ),
);

if (!ad.filled) {
  debugPrint('No fill: ${ad.reason}');
}
```

Do not block access to essential application content when an advertisement is unavailable.

---

## Ad Response Model

`requestAd` returns a typed `Ad` object.

An advertisement response can describe:

* Whether an advertisement was filled
* Creative kind
* Demand source
* Impression identifier
* Creative payload
* Auction metadata
* No-fill reason
* Trackability status

Common properties include:

| Property      | Description                                       |
| ------------- | ------------------------------------------------- |
| `filled`      | Whether an eligible advertisement was returned    |
| `kind`        | Creative type such as image, HTML, or no-fill     |
| `source`      | Demand source such as internal, OpenRTB, or house |
| `impId`       | Impression identifier used for tracking           |
| `creative`    | Creative payload returned by the backend          |
| `auction`     | Auction-related response data                     |
| `reason`      | No-fill or failure reason, when available         |
| `isTrackable` | Whether viewability can be reported               |

### Filled response

```dart
if (ad.filled) {
  debugPrint('Advertisement available');
}
```

### No-fill response

```dart
if (!ad.filled) {
  debugPrint('No fill: ${ad.reason}');
}
```

### Trackable response

```dart
if (ad.isTrackable && ad.impId != null) {
  await adx.reportViewable(ad.impId!);
}
```

### Demand-source inspection

```dart
debugPrint('Demand source: ${ad.source}');
```

Typical demand-source values represent:

* Internal demand
* OpenRTB demand
* House advertisements

---

## Four-Way Union Parsing

The SDK parses the response as a bounded union rather than assuming every successful HTTP response contains the same creative structure.

The supported response paths cover the contract-defined outcomes, including:

1. Filled image advertisement
2. Filled HTML or OpenRTB advertisement
3. House or internal fallback advertisement
4. No-fill or failure response

The parser validates the response before exposing it to the rendering layer.

Unexpected or incomplete response shapes fail closed and are treated as no-fill rather than being passed into application UI code as an unsafe partially initialized model.

---

## API Reference

### `BannerAd`

A Flutter widget that manages advertisement loading and rendering.

```dart
BannerAd(
  apiKey: 'pk_your_publisher_key',
  slotId: 'your-slot-id',
  borderRadius: 12,
  elevated: true,
  onAdLoaded: (ad) {},
  onAdFailed: (reason) {},
  htmlBuilder: (context, html, width, height) {
    return YourHtmlRenderer(
      html: html,
      width: width,
      height: height,
    );
  },
)
```

Important inputs:

| Parameter     | Description                                              |
| ------------- | -------------------------------------------------------- |
| `apiKey`      | Public Theaimart ADX publisher key                       |
| `slotId`      | Identifier of the configured ad placement                |
| `onAdLoaded`  | Called after an advertisement is successfully loaded     |
| `onAdFailed`  | Called after no-fill or rendering failure                |
| `htmlBuilder` | Application-provided renderer for HTML/OpenRTB creatives |
| `borderRadius`, `surfaceColor`, `elevated` | Visual-only premium surface controls |
| `transitionDuration` | Image fade duration; reduced-motion preferences take precedence |

The exact available constructor fields should be treated as authoritative from the installed package API.

---

### `AdxClient`

Creates a reusable API client.

```dart
final client = AdxClient(
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
);
```

Depending on the package API, client construction can also expose configuration such as:

* API base URL
* Request timeout
* HTTP client
* User-Agent
* Testing overrides

Use production defaults unless a controlled development or testing environment requires an override.

---

### `requestAd`

Requests an advertisement asynchronously:

```dart
final ad = await client.requestAd(
  const AdRequest(
    slotId: 'your-slot-id',
  ),
);
```

The returned future resolves to a typed `Ad` result.

---

### `reportViewable`

Reports a viewable impression:

```dart
await client.reportViewable(impressionId);
```

This operation is best effort. A beacon failure should not invalidate an already rendered advertisement or break the primary application flow.

---

### `close`

Releases resources owned by the client:

```dart
client.close();
```

Call this when a reusable client or ad service is permanently disposed.

---

### `platformUserAgent`

Creates the recommended platform-aware SDK User-Agent:

```dart
final userAgent = platformUserAgent();
```

Use it when creating `AdxClient` directly.

---

### `AdRequest`

Defines an advertisement request:

```dart
const request = AdRequest(
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
);
```

The slot ID should correspond to a real placement configured in the publisher account.

Use separate slot IDs for placements that require distinct reporting or configuration.

Examples:

* Home-screen banner
* Article banner
* Dashboard placement
* Search-results banner
* Desktop sidebar
* Web footer
* Content-detail advertisement

---

## Application Lifecycle

A Flutter application can rebuild widgets frequently.

Avoid creating unnecessary long-lived HTTP clients inside repeated build operations unless the managed widget owns and disposes them correctly.

For direct usage, manage the client inside a service, state object, provider, or dependency-injection container.

### Stateful lifecycle example

```dart
class AdClientOwner extends StatefulWidget {
  const AdClientOwner({super.key});

  @override
  State<AdClientOwner> createState() => _AdClientOwnerState();
}

class _AdClientOwnerState extends State<AdClientOwner> {
  late final AdxClient _adx;

  @override
  void initState() {
    super.initState();

    _adx = AdxClient(
      apiKey: 'pk_your_publisher_key',
      userAgent: platformUserAgent(),
    );
  }

  @override
  void dispose() {
    _adx.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return const Placeholder();
  }
}
```

Do not call `close()` while requests that still need the client are expected to continue.

---

## Production Integration

For a stable production integration:

1. Use a public publisher API key assigned to the application.
2. Create separate slot IDs for independently managed placements.
3. Use `BannerAd` for standard image-banner integrations.
4. Supply an audited `htmlBuilder` for HTML or OpenRTB creatives.
5. Use `platformUserAgent()` with direct clients.
6. Keep the SDK identifier and device token in custom User-Agents.
7. Do not report impressions before the viewability threshold is met.
8. Close manually created `AdxClient` instances.
9. Collapse or replace placements after no-fill.
10. Do not block core application functionality when advertising fails.
11. Test filled, no-fill, timeout, malformed-response, and click scenarios.
12. Verify every target platform independently.
13. Restrict WebView navigation and application bridges.
14. Never embed server-side credentials in Flutter code.
15. Keep package and wire-contract versions compatible.

### Recommended placement behavior

Good placement behavior:

* The advertisement is clearly visible.
* The ad does not cover essential controls.
* The ad does not imitate application navigation.
* The layout remains usable after no-fill.
* The creative fits inside explicit size constraints.
* User taps are intentional.
* The advertisement does not trigger automatically.

Avoid:

* Hidden or one-pixel advertisements
* Ads underneath opaque widgets
* Accidental-click layouts
* Ads placed directly over primary buttons
* Automatic click opening
* Reporting non-viewable impressions
* Repeated uncontrolled reload loops
* Unrestricted WebView navigation

---

## Flutter Web Considerations

Flutter web applications operate inside the browser security model.

Consider:

* Browser CORS policy
* Content Security Policy
* Pop-up and external-navigation restrictions
* Browser visibility state
* Tab backgrounding
* Responsive banner dimensions
* Web-specific HTML-rendering behavior
* URL-launching restrictions
* Public visibility of publisher configuration

A Flutter web application cannot keep an embedded key secret. Only client-safe publisher keys should be used.

Test the package against the production domain from which the Flutter web application will be served.

---

## Android Considerations

For Android applications:

* Ensure internet access is available.
* Test on the minimum supported Android version.
* Test on recent Android versions.
* Verify external click navigation.
* Verify that application network-security configuration permits the required HTTPS endpoints.
* Test lifecycle changes such as backgrounding and rotation.
* Ensure ad widgets are not duplicated during rebuilds.
* Validate WebView settings when rendering HTML creatives.

Use HTTPS endpoints in production.

---

## iOS Considerations

For iOS applications:

* Test external click navigation.
* Verify App Transport Security compatibility.
* Validate application lifecycle transitions.
* Test creative rendering on iPhone and iPad layouts where applicable.
* Review WebView navigation and JavaScript policy.
* Ensure your integration follows applicable App Store rules and privacy disclosures.

Use secure production endpoints.

---

## Desktop Considerations

For Windows, macOS, and Linux applications:

* Confirm the selected URL launcher supports the target desktop platform.
* Confirm the selected WebView package supports the target operating system.
* Test window resizing.
* Test high-DPI displays.
* Test application minimization and restoration.
* Verify viewability when the window is obscured or inactive.
* Apply explicit creative size constraints.
* Validate external-browser behavior.

The core client can request advertisements independently of the widget renderer, but rendering capabilities depend on the packages and native implementations included in the host application.

---

## Testing

Enter the Flutter package directory:

```bash
cd packages/flutter
```

Fetch dependencies:

```bash
flutter pub get
```

Run the unit-test suite:

```bash
flutter test
```

The tests cover platform-independent SDK behavior, including:

* Free-text request encoding
* Ad-model parsing
* Filled-response parsing
* No-fill parsing
* Union-response handling
* Invalid-response handling
* HTTP client behavior
* Mocked network responses
* Trackability behavior

The client tests use a mock HTTP client, allowing request and response behavior to be verified without contacting the production advertising backend.

### Recommended verification command

```bash
flutter pub get
flutter analyze
flutter test
```

### Recommended production test matrix

Test at least the following cases:

| Test case                        | Expected behavior                          |
| -------------------------------- | ------------------------------------------ |
| Filled image ad                  | Image renders successfully                 |
| Image tap                        | Registered click destination opens         |
| Viewable for at least one second | Impression beacon fires once               |
| Less than 50% visible            | Impression is not reported                 |
| No-fill response                 | Placement collapses or remains unobtrusive |
| Network timeout                  | Safe failure without application crash     |
| Invalid JSON                     | Safe no-fill                               |
| Missing impression ID            | Ad is not treated as trackable             |
| HTML creative without builder    | Safe failure or no-fill                    |
| HTML creative with builder       | Custom renderer displays the creative      |
| URL-launch failure               | Application remains stable                 |
| Widget disposal                  | No invalid post-disposal update            |
| Client disposal                  | HTTP resources are released                |
| Repeated rebuild                 | No uncontrolled duplicate requests         |

For UI and viewability verification, use integration tests or physical/emulated target devices in addition to unit tests.

---

## Frequently Asked Questions

### What is `theaimart_adx`?

`theaimart_adx` is the official Flutter SDK for requesting, rendering, and tracking advertisements from Theaimart ADX.

### Which Flutter platforms are supported?

The SDK is designed for Android, iOS, web, Windows, macOS, and Linux applications.

Some rendering features require platform-compatible URL-launcher or WebView packages.

### Does the SDK include a banner widget?

Yes. `BannerAd` provides a drop-in Flutter widget for standard advertising placements.

### Does the SDK render image ads automatically?

Yes. Managed image creatives are rendered through Flutter's network-image functionality.

### How are advertisement clicks handled?

Managed image ads use tap-to-open behavior through the configured URL-launching implementation.

### Does it support HTML creatives?

Yes. Supply an `htmlBuilder` to render HTML or OpenRTB creatives using your preferred WebView or custom rendering package.

### Why is a WebView dependency not included automatically?

Different Flutter platforms require different WebView implementations. Keeping the renderer application-provided avoids forcing an unnecessary or unsupported dependency into every integration.

### Does the SDK track viewability automatically?

`BannerAd` automatically reports a trackable impression after the advertisement remains at least 50% visible for at least one second.

### Do I need to call `reportViewable` manually?

Not when using the managed `BannerAd` widget.

When using `AdxClient` directly, your application must measure viewability and report the impression manually.

### What happens when a request fails?

The SDK fails closed. Errors result in no-fill behavior rather than an uncaught exception escaping into the host application.

### Why should I use `platformUserAgent()`?

It generates a fraud-safe User-Agent containing the SDK identity and a recognizable platform token. This helps the backend classify the request correctly and avoids generic blocked User-Agent patterns.

### Can I use a custom User-Agent?

Yes, but it should preserve the SDK identifier, version, and platform token required by the wire contract.

### Should I close `AdxClient`?

Yes. Close manually created clients when they are no longer needed.

### Can I create one client for multiple ad requests?

Yes. A reusable client is generally preferable for multiple direct requests. Dispose it through your application's lifecycle-management mechanism.

### Can advertising errors crash my Flutter application?

The SDK is designed to convert networking, parsing, and supported rendering failures into safe no-fill behavior. Application-provided custom renderers should follow the same principle.

### Can I put my secret server key in the Flutter application?

No. Use only public publisher keys intended for client-side distribution.

### Does the SDK work with OpenRTB demand?

The response model can represent OpenRTB-sourced advertisements. HTML or OpenRTB creative rendering requires an appropriate `htmlBuilder`.

### What should happen after no-fill?

Hide, collapse, or gracefully replace the advertising placement. Do not leave a disruptive empty region or block access to application content.

---

## Flutter App Monetization with Theaimart ADX

The Theaimart ADX Flutter SDK can be used by developers building:

* Android Flutter applications
* iOS Flutter applications
* Flutter web applications
* Windows desktop applications
* macOS desktop applications
* Linux desktop applications
* AI applications
* Productivity tools
* Utility applications
* Content platforms
* Developer tools
* SaaS companion applications
* Cross-platform consumer products
* Publisher applications
* Local-first desktop software

The package provides a common monetization layer across Flutter platforms while allowing each application to retain control over creative rendering, lifecycle management, WebView security, and user experience.

Learn more about Theaimart ADX:

https://adx.theaimart.co

---

## Wire Contract

The SDK implements version 1 of the Theaimart ADX wire contract:

```text
../../CONTRACT.md
```

Relevant contract areas include:

* Request structure
* Response variants
* Publisher authentication
* User-Agent requirements
* Device classification
* Free-text input encoding
* Impression identifiers
* Viewability reporting
* Click tracking
* Creative representation
* No-fill behavior
* Failure handling

The Flutter SDK and backend must remain compatible with the same contract version.

Breaking changes to request fields, response models, creative payloads, or tracking behavior should be introduced through an explicit wire-contract version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this package except in compliance with the License. Refer to the repository's `LICENSE` file for the complete license terms.
