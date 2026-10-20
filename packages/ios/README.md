# Theaimart ADX iOS and tvOS SDK

The official **Theaimart ADX SDK for iOS and tvOS**, written in Swift.

`TheaimartAdx` allows Apple-platform developers to request, render, track, and monetize advertisements through the [Theaimart Ad Network](https://adx.theaimart.co).

The SDK is built entirely with Apple platform technologies:

* Swift
* `URLSession`
* `Foundation`
* `UIKit` for `BannerAdView`
* XCTest for unit testing

It has **zero third-party runtime dependencies** and implements version 1 of the [Theaimart ADX wire contract](../../CONTRACT.md).

> **Supported platforms:** iOS and tvOS
> **Minimum iOS version:** iOS 12 or later
> **Language:** Swift
> **Dependencies:** None
> **License:** Apache License 2.0

---

## Features

* Native Swift advertising SDK
* iOS application monetization
* tvOS advertising integration
* Zero third-party runtime dependencies
* Swift Package Manager support
* CocoaPods support
* Drop-in `BannerAdView`
* Direct advertisement-request API
* Automatic banner viewability tracking
* Automatic click handling where supported
* Internal demand support
* OpenRTB demand support
* House-ad support
* Safe no-fill responses
* Fraud-safe Apple-platform User-Agent
* SQL-filter-safe request encoding
* Typed four-way response parsing
* Fail-closed network and rendering behavior
* Main-thread completion delivery
* XCTest coverage for encoding and model parsing
* Compatibility with Theaimart ADX wire contract v1

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Supported Platforms](#supported-platforms)
* [Requirements](#requirements)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Banner Ad Integration](#banner-ad-integration)
* [Auto Layout Integration](#auto-layout-integration)
* [Direct Client Usage](#direct-client-usage)
* [Custom Creative Rendering](#custom-creative-rendering)
* [Viewability Tracking](#viewability-tracking)
* [Click Handling](#click-handling)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Union Parsing](#four-way-union-parsing)
* [User-Agent and Device Classification](#user-agent-and-device-classification)
* [Security and Request Encoding](#security-and-request-encoding)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [API Reference](#api-reference)
* [Application Lifecycle](#application-lifecycle)
* [iOS Integration Notes](#ios-integration-notes)
* [tvOS Integration Notes](#tvos-integration-notes)
* [Production Recommendations](#production-recommendations)
* [Build and Test](#build-and-test)
* [Testing Strategy](#testing-strategy)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for developers, publishers, and software businesses.

The `TheaimartAdx` Swift SDK connects an iOS or tvOS application to the Theaimart advertising infrastructure.

It enables an application to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Receive an eligible advertisement or a safe no-fill response.
4. Render the returned creative.
5. Track viewable impressions.
6. Use the registered advertisement click URL.
7. Identify the demand source behind the advertisement.
8. Monetize eligible traffic through Theaimart ADX.

The SDK supports both managed banner rendering and lower-level client access for applications that need a custom advertising interface.

---

## Supported Platforms

| Platform       | Support                                      |
| -------------- | -------------------------------------------- |
| iPhone         | Supported                                    |
| iPad           | Supported                                    |
| iOS Simulator  | Supported for integration testing            |
| Apple TV       | Supported through tvOS-compatible APIs       |
| tvOS Simulator | Supported for applicable integration testing |

`BannerAdView` depends on UIKit and therefore requires an Apple platform environment with UIKit availability.

Some interaction behavior can differ between touch-based iOS devices and focus-based tvOS devices. Applications should verify navigation, selection, and creative interaction behavior on every supported target.

---

## Requirements

### Application integration

* iOS 12 or later
* A Swift-compatible Xcode project
* A valid Theaimart ADX public publisher key
* A valid Theaimart ADX slot ID
* Network access to the configured Theaimart ADX endpoint

### SDK development

* macOS
* Xcode
* Swift toolchain
* Swift Package Manager or CocoaPods, depending on integration method

### Runtime dependencies

The SDK uses only Apple platform frameworks:

* `Foundation`
* `URLSession`
* `UIKit`, where banner rendering is used

No third-party HTTP, JSON, analytics, or rendering library is required by the SDK.

---

## Installation

Theaimart ADX can be integrated using Swift Package Manager or CocoaPods.

---

## Swift Package Manager

### Add through Xcode

In Xcode:

1. Open the application project.
2. Select **File → Add Package Dependencies**.
3. Enter the repository URL:

```text
https://github.com/theaimartco/theaimart-adx-sdks.git
```

4. Select version `1.1.0` or later compatible release.
5. Add the `TheaimartAdx` product to the required application target.

### Add through `Package.swift`

```swift
dependencies: [
    .package(
        url: "https://github.com/theaimartco/theaimart-adx-sdks.git",
        from: "1.1.0"
    )
]
```

Add the SDK product to the relevant target:

```swift
.target(
    name: "YourApplication",
    dependencies: [
        .product(
            name: "TheaimartAdx",
            package: "theaimart-adx-sdks"
        )
    ]
)
```

The sources live in `packages/ios`; the `Package.swift` SwiftPM reads is the one at the
repository root, and releases are SemVer tags at the root (`v1.1.0`). CocoaPods resolves the same
tag (`pod 'TheaimartAdx', '~> 1.1'`).

---

## CocoaPods

Add the following dependency to the application's `Podfile`:

```ruby
pod 'TheaimartAdx', '~> 1.0'
```

Install or update the dependency:

```bash
pod install
```

Open the generated workspace:

```bash
open YourApplication.xcworkspace
```

Import the package in Swift:

```swift
import TheaimartAdx
```

---

## Quick Start

Create an `Adx` client using the application's public publisher key:

```swift
import TheaimartAdx

let adx = Adx(
    apiKey: "pk_your_publisher_key"
)
```

Create an advertisement request using a configured slot ID:

```swift
let request = AdRequest(
    slotID: "8b1f2c3d-0000-0000-0000-000000000000"
)
```

You can then choose between:

* `BannerAdView` for managed banner rendering
* `requestAd` for direct request and custom rendering

---

## Banner Ad Integration

`BannerAdView` provides the simplest native iOS banner-ad integration.

```swift
import UIKit
import TheaimartAdx

let adx = Adx(
    apiKey: "pk_your_publisher_key"
)

let banner = BannerAdView(
    frame: CGRect(
        x: 0,
        y: 0,
        width: 300,
        height: 250
    )
)
banner.cornerRadius = 12
banner.elevated = true

let request = AdRequest(
    slotID: "8b1f2c3d-0000-0000-0000-000000000000"
)

banner.load(
    adx,
    request: request
)

view.addSubview(banner)
```

The managed banner handles the standard advertisement lifecycle, including:

* Sending the advertisement request
* Parsing the response
* Determining whether the response is filled
* Rendering supported creative content
* Measuring viewability
* Reporting a viewable impression
* Handling advertisement interaction
* Isolating rendering and network failures

Replace the sample publisher key and UUID before using the SDK in production.

---

## Banner Ad Callbacks

Where supported by the SDK API, configure loaded and failed callbacks to update the containing interface.

Example integration pattern:

```swift
let banner = BannerAdView(
    frame: CGRect(
        x: 0,
        y: 0,
        width: 300,
        height: 250
    )
)

banner.onAdLoaded = { ad in
    print("Loaded advertisement from \(ad.source)")
}

banner.onAdFailed = { reason in
    print("No fill: \(reason)")
}

banner.load(
    adx,
    request: AdRequest(
        slotID: "8b1f2c3d-0000-0000-0000-000000000000"
    )
)
```

Use the exact callback signatures exposed by the installed SDK version.

Recommended no-fill behavior includes:

* Hiding the banner
* Collapsing its height
* Removing it from the layout
* Replacing it with non-advertising application content

Do not leave an unnecessary blank region after a failed or no-fill response.

---

## Auto Layout Integration

`BannerAdView` can be integrated into a UIKit hierarchy using Auto Layout.

```swift
let banner = BannerAdView()
banner.translatesAutoresizingMaskIntoConstraints = false

view.addSubview(banner)

NSLayoutConstraint.activate([
    banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
    banner.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor
    ),
    banner.widthAnchor.constraint(equalToConstant: 300),
    banner.heightAnchor.constraint(equalToConstant: 250)
])

banner.load(
    adx,
    request: AdRequest(
        slotID: "8b1f2c3d-0000-0000-0000-000000000000"
    )
)
```

Explicit width and height constraints are recommended so that the application layout remains stable while the advertisement loads.

When no advertisement is returned, the application can deactivate or update the banner constraints.

---

## View Controller Example

```swift
import UIKit
import TheaimartAdx

final class MonetizedViewController: UIViewController {

    private let adx = Adx(
        apiKey: "pk_your_publisher_key"
    )

    private let banner = BannerAdView()

    override func viewDidLoad() {
        super.viewDidLoad()

        configureBanner()
        loadBanner()
    }

    private func configureBanner() {
        banner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(banner)

        NSLayoutConstraint.activate([
            banner.leadingAnchor.constraint(
                equalTo: view.leadingAnchor,
                constant: 16
            ),
            banner.trailingAnchor.constraint(
                equalTo: view.trailingAnchor,
                constant: -16
            ),
            banner.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -12
            ),
            banner.heightAnchor.constraint(equalToConstant: 250)
        ])
    }

    private func loadBanner() {
        banner.load(
            adx,
            request: AdRequest(
                slotID: "8b1f2c3d-0000-0000-0000-000000000000"
            )
        )
    }
}
```

Reuse the `Adx` client when multiple requests share the same configuration.

---

## Direct Client Usage

Use the direct client API when the application needs complete control over creative rendering and placement behavior.

```swift
import TheaimartAdx

let adx = Adx(
    apiKey: "pk_your_publisher_key"
)

let request = AdRequest(
    slotID: "8b1f2c3d-0000-0000-0000-000000000000"
)

adx.requestAd(request) { ad in
    guard ad.filled else {
        print("No fill: \(ad.reason)")
        return
    }

    print("Loaded advertisement from \(ad.source)")

    // Render ad.creative using the application's own UI.

    if ad.isTrackable {
        adx.reportViewable(ad.impID)
    }
}
```

The direct API is appropriate when building:

* A custom banner view
* A custom image-ad layout
* An HTML creative renderer
* A focus-aware tvOS interface
* A SwiftUI wrapper around the SDK
* A placement controlled by an application design system
* A reusable internal advertisement component

When rendering manually, the application becomes responsible for:

* Creative validation
* Creative sizing
* Viewability measurement
* Impression timing
* Click behavior
* Loading indicators
* No-fill layout behavior
* Lifecycle management

---

## Custom Creative Rendering

A filled `Ad` contains the creative data required by the application or managed banner renderer.

Example decision flow:

```swift
adx.requestAd(
    AdRequest(slotID: "your-slot-id")
) { ad in
    guard ad.filled else {
        return
    }

    switch ad.kind {
    case .image:
        // Render the image creative.

    case .html:
        // Render the HTML creative using a controlled renderer.

    case .noFill:
        // Hide or collapse the placement.
    }
}
```

Use the exact enum cases and creative fields defined by the installed SDK version.

A custom renderer should never assume that every filled response contains the same creative structure. Validate the creative kind before accessing creative-specific fields.

---

## Image Creative Integration

A custom image-ad implementation can:

1. Extract the creative image URL.
2. Load the image using `URLSession`, `UIImageView`, or an application image pipeline.
3. Display the image within explicit layout bounds.
4. Measure viewability.
5. Report the viewable impression.
6. Open the SDK-provided click destination after an intentional interaction.

Avoid:

* Stretching creatives beyond their intended aspect ratio
* Placing invisible interactive views above the advertisement
* Reporting an impression before image rendering succeeds
* Opening the click destination automatically
* Blocking the application while the image downloads

---

## HTML Creative Integration

HTML and OpenRTB creatives should be rendered inside a controlled web-content environment.

On iOS, this commonly means using `WKWebView`.

A secure renderer should consider:

* Restricting unexpected navigation
* Validating external URLs
* Limiting application-to-JavaScript bridges
* Enabling JavaScript only when required
* Preventing arbitrary window creation
* Applying explicit dimensions
* Handling failed page loads safely
* Avoiding access to private application data
* Preventing the creative from replacing the parent interface

The SDK should remain responsible for the registered impression and click-tracking flow. The host application should not replace the advertisement destination with an unrelated URL.

---

## Viewability Tracking

A viewable impression should be reported only after the creative satisfies the SDK or wire-contract viewability rules.

When using `BannerAdView`, viewability tracking is handled automatically.

```swift
banner.load(
    adx,
    request: AdRequest(
        slotID: "your-slot-id"
    )
)
```

When rendering the advertisement manually:

```swift
if ad.isTrackable {
    adx.reportViewable(ad.impID)
}
```

Do not call `reportViewable` immediately after receiving the network response unless the advertisement is actually visible according to the required policy.

A custom implementation may need to consider:

* The percentage of the advertisement visible on screen
* The duration for which it remains visible
* Whether the view controller is active
* Whether the application is in the foreground
* Whether the view is covered by another view
* Whether the containing window is visible
* Whether scrolling moved the creative off screen
* Whether the creative finished rendering

`reportViewable` is a best-effort tracking operation. A beacon failure should not crash the host application.

---

## Click Handling

`BannerAdView` handles advertisement click behavior automatically where the target platform and creative support it.

For custom rendering, the application should use the registered click URL associated with the impression.

The application should:

* Open only validated HTTP or HTTPS destinations
* Require an intentional user action
* Handle URL-opening failure safely
* Preserve the registered tracking flow
* Avoid opening multiple destinations for one interaction
* Avoid automatic redirect behavior outside the creative
* Use platform-appropriate navigation APIs

On iOS, external destinations can be opened using application-approved URL-handling behavior.

On tvOS, interaction should be designed around focus and selection rather than touch input.

---

## Ad Response Model

An advertisement request returns an `Ad` model describing the outcome.

Typical properties include:

| Property      | Description                                              |
| ------------- | -------------------------------------------------------- |
| `filled`      | Indicates whether an eligible advertisement was returned |
| `kind`        | Creative kind, such as image, HTML, or no-fill           |
| `source`      | Demand source associated with the response               |
| `impID`       | Impression identifier used for tracking                  |
| `creative`    | Creative payload                                         |
| `auction`     | Auction-related response data                            |
| `reason`      | No-fill or failure reason                                |
| `isTrackable` | Indicates whether a viewable impression can be reported  |

### Filled response

```swift
guard ad.filled else {
    return
}
```

### No-fill response

```swift
if !ad.filled {
    print("No fill: \(ad.reason)")
}
```

### Trackable response

```swift
if ad.isTrackable {
    adx.reportViewable(ad.impID)
}
```

### Demand-source inspection

```swift
print("Demand source: \(ad.source)")
```

The installed SDK source remains authoritative for exact property types and optionality.

---

## Demand Sources

The SDK supports contract-defined response sources including:

* `INTERNAL`
* `OPENRTB`
* `HOUSE`
* No-fill

### Internal demand

An advertisement served from demand managed directly within the Theaimart ADX platform.

### OpenRTB demand

An advertisement returned through an OpenRTB-compatible auction or demand integration.

### House advertisement

An advertisement supplied by the publisher or platform as internal fallback inventory.

### No-fill

A valid response indicating that no eligible advertisement was available for the request.

Applications should treat no-fill as a normal advertising outcome rather than an application error.

---

## Four-Way Union Parsing

The SDK parses the backend response as a bounded four-way union:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

This avoids treating all successful HTTP responses as though they contain the same payload structure.

The parser validates the response before exposing it to the rendering layer.

Unexpected, malformed, incomplete, or unsupported response data fails closed and produces safe no-fill behavior.

This protects the application from:

* Invalid creative access
* Unsafe forced casts
* Missing impression identifiers
* Unexpected response variants
* Partially initialized advertisement models
* Rendering unsupported payloads

---

## User-Agent and Device Classification

The SDK sends a purpose-built Apple-platform User-Agent.

The format follows this structure:

```text
theaimart-adx-ios/<version> (<device>; <operating-system>)
```

Example values can resemble:

```text
theaimart-adx-ios/1.0.0 (iPhone; iOS 18)
theaimart-adx-ios/1.0.0 (iPad; iOS 18)
```

The custom User-Agent:

* Identifies the official Theaimart ADX iOS SDK
* Communicates the SDK version
* Includes a recognizable Apple device token
* Includes the operating-system family and version
* Supports backend device classification
* Avoids generic networking-library identifiers
* Reduces false bot classification
* Prevents silent no-fill caused by blocked User-Agent patterns

The User-Agent behavior follows [CONTRACT.md section 6](../../CONTRACT.md).

Use the SDK-generated User-Agent unless a controlled development environment requires an override.

A custom User-Agent should preserve:

* The Theaimart ADX SDK identifier
* The SDK version
* A recognizable Apple platform token
* The relevant operating-system identity

---

## Why Zero Dependencies Matter

Theaimart ADX uses Apple's native networking stack:

```text
URLSession
```

Data modeling, encoding, and response parsing use:

```text
Foundation
```

The SDK does not require third-party runtime libraries such as:

* Alamofire
* Moya
* AFNetworking
* SwiftyJSON
* ObjectMapper
* External analytics packages
* External image-loading packages

This provides several benefits:

* Smaller dependency graph
* Lower risk of package-version conflicts
* Less transitive code in the application
* Predictable network behavior
* Controlled request headers
* Reduced supply-chain exposure
* Easier SDK auditing
* Simpler Swift Package Manager integration
* Simpler CocoaPods integration
* Fewer compatibility problems during Xcode upgrades

The host application can still use its preferred libraries independently.

---

## Security and Request Encoding

The SDK applies SQL-filter-safe encoding to free-text request values according to [CONTRACT.md section 7](../../CONTRACT.md).

This is important for legitimate values such as:

* Application URLs
* Page URLs
* Bundle-related metadata
* Placement descriptions
* Content identifiers
* Device and application metadata

The encoding layer is intended to:

* Preserve valid request values
* Prevent malformed query construction
* Produce deterministic request parameters
* Avoid valid URLs triggering Web Application Firewall rules
* Keep request values compatible with backend filters
* Reduce unsafe propagation of free-text data

### Public publisher keys

The API key embedded in an iOS or tvOS application must be a public publisher key intended for client distribution.

Example:

```text
pk_your_publisher_key
```

Do not embed:

* Administrative API keys
* Private service credentials
* Database passwords
* Signing certificates
* Infrastructure tokens
* Advertiser billing credentials
* Server-side authentication secrets

Application binaries can be inspected. A client application cannot safely conceal a server-side secret.

---

## Error and No-Fill Handling

Advertising should never destabilize the primary application experience.

The SDK follows a fail-closed policy.

Potential failure conditions include:

* DNS failure
* Network connection failure
* Request timeout
* Invalid HTTP status
* Malformed JSON
* Missing required fields
* Unsupported response variant
* Unsupported creative type
* Invalid impression identifier
* Creative rendering failure
* Viewability reporting failure
* Click navigation failure

Expected behavior:

```text
Unexpected failure → no-fill or ignored best-effort beacon
```

Unsafe behavior avoided by the SDK:

```text
Unexpected failure → application crash or unverified creative rendering
```

Recommended application handling:

```swift
adx.requestAd(
    AdRequest(slotID: "your-slot-id")
) { ad in
    guard ad.filled else {
        // Hide or collapse the placement.
        return
    }

    // Render the advertisement.
}
```

Do not prevent access to essential application functionality when no advertisement is available.

---

## Main-Thread UI Handling

Any UIKit operation must run on the main thread.

The SDK's asynchronous interface should deliver UI-facing completion behavior according to its documented contract.

When implementing custom integration code, explicitly return to the main queue before changing UIKit views when necessary:

```swift
adx.requestAd(
    AdRequest(slotID: "your-slot-id")
) { ad in
    DispatchQueue.main.async {
        guard ad.filled else {
            self.bannerContainer.isHidden = true
            return
        }

        self.bannerContainer.isHidden = false
        // Render the creative.
    }
}
```

Use the exact threading guarantees documented by the installed SDK version.

---

## API Reference

### `Adx`

Creates a Theaimart ADX client.

```swift
let adx = Adx(
    apiKey: "pk_your_publisher_key"
)
```

Depending on the SDK version, construction can also expose configuration such as:

* API base URL
* Request timeout
* User-Agent
* URL session
* Testing overrides

Use production defaults unless a controlled development or testing environment requires an override.

---

### `AdRequest`

Defines an advertisement request.

```swift
let request = AdRequest(
    slotID: "8b1f2c3d-0000-0000-0000-000000000000"
)
```

The slot ID connects the request to a configured publisher placement.

Use separate slot IDs for placements that need distinct configuration or reporting.

Examples:

* Home-screen banner
* Article banner
* Content-detail placement
* Dashboard advertisement
* Video-browse placement
* tvOS content-row placement
* Application footer
* Settings-screen placement

Do not use placeholder UUIDs in production.

---

### `requestAd`

Requests an advertisement asynchronously.

```swift
adx.requestAd(
    AdRequest(slotID: "your-slot-id")
) { ad in
    // Handle filled or no-fill response.
}
```

The completion receives a typed `Ad` result rather than requiring the application to parse raw JSON.

---

### `reportViewable`

Reports a viewable impression.

```swift
adx.reportViewable(ad.impID)
```

Use it only for a trackable advertisement:

```swift
if ad.isTrackable {
    adx.reportViewable(ad.impID)
}
```

The operation is best effort and should not interrupt the primary application flow if the beacon fails.

---

### `BannerAdView`

A UIKit-based managed banner view.

```swift
let banner = BannerAdView(
    frame: CGRect(
        x: 0,
        y: 0,
        width: 300,
        height: 250
    )
)

banner.load(
    adx,
    request: AdRequest(
        slotID: "your-slot-id"
    )
)
```

The managed view handles:

* Request execution
* Response parsing
* Supported creative rendering
* Viewability measurement
* Impression reporting
* Advertisement interaction
* Failure isolation
* Theme-aware surface, rounded clipping, elevation, and image fade-in

---

## Application Lifecycle

Keep the `Adx` client alive for as long as the owning advertisement service or interface requires it.

A reusable client is generally preferable when an application makes multiple requests with the same publisher configuration.

```swift
final class ApplicationAdService {

    static let shared = ApplicationAdService()

    let client = Adx(
        apiKey: "pk_your_publisher_key"
    )

    private init() {}
}
```

Usage:

```swift
let adx = ApplicationAdService.shared.client

banner.load(
    adx,
    request: AdRequest(
        slotID: "your-slot-id"
    )
)
```

Avoid creating uncontrolled duplicate clients during repeated view updates.

For banner views:

* Avoid loading repeatedly during every layout pass.
* Avoid starting multiple simultaneous loads for the same placement.
* Stop or ignore stale UI updates after the owning view controller is dismissed.
* Ensure retained closures do not create unnecessary reference cycles.
* Reload only according to the application's approved advertising policy.

---

## SwiftUI Integration

`BannerAdView` is a UIKit view. It can be wrapped for SwiftUI using `UIViewRepresentable`.

Example integration pattern:

```swift
import SwiftUI
import TheaimartAdx

struct TheaimartBannerView: UIViewRepresentable {

    let adx: Adx
    let slotID: String

    func makeUIView(context: Context) -> BannerAdView {
        let banner = BannerAdView()

        banner.load(
            adx,
            request: AdRequest(
                slotID: slotID
            )
        )

        return banner
    }

    func updateUIView(
        _ uiView: BannerAdView,
        context: Context
    ) {
        // Avoid reloading during every SwiftUI update unless required.
    }
}
```

Usage:

```swift
struct ContentView: View {

    private let adx = Adx(
        apiKey: "pk_your_publisher_key"
    )

    var body: some View {
        VStack {
            Text("Application content")

            Spacer()

            TheaimartBannerView(
                adx: adx,
                slotID: "8b1f2c3d-0000-0000-0000-000000000000"
            )
            .frame(height: 250)
        }
    }
}
```

Verify that the SDK's supported Apple-platform targets and UIKit availability match the SwiftUI application target.

---

## iOS Integration Notes

When integrating on iPhone or iPad:

* Use HTTPS production endpoints.
* Respect safe-area insets.
* Test portrait and landscape layouts.
* Test compact and regular size classes.
* Ensure the creative does not cover navigation controls.
* Verify behavior during application backgrounding.
* Verify behavior after returning to the foreground.
* Test on the minimum supported iOS version.
* Test on a recent iOS version.
* Test on a physical device and simulator.
* Verify click navigation.
* Verify no-fill layout collapse.
* Verify viewability during scrolling.
* Verify behavior when the containing view controller disappears.
* Review applicable App Store privacy and advertising requirements.

If HTML creatives use `WKWebView`, configure navigation and JavaScript behavior deliberately.

---

## tvOS Integration Notes

tvOS uses a focus engine rather than direct touch interaction.

For tvOS integrations:

* Ensure advertisements participate correctly in focus navigation when interaction is supported.
* Avoid trapping focus inside an advertisement.
* Provide predictable selection behavior.
* Test using the Siri Remote and tvOS simulator controls.
* Ensure the creative remains readable at television viewing distance.
* Apply appropriate spacing and dimensions.
* Verify viewability when the application moves between content screens.
* Verify behavior when the application enters the background.
* Test any external navigation behavior supported by the application.
* Do not assume iOS touch handling behaves identically on tvOS.

A custom renderer may be preferable when the application requires specialized focus behavior.

---

## Production Recommendations

For a reliable production integration:

1. Use only a public publisher key assigned to the application.
2. Create a separate slot ID for each meaningful placement.
3. Reuse the `Adx` client where practical.
4. Use `BannerAdView` for standard managed banner placements.
5. Use direct client access only when custom rendering is required.
6. Do not report an impression before the advertisement becomes viewable.
7. Preserve the SDK-generated User-Agent.
8. Keep platform and device tokens in any approved custom User-Agent.
9. Render HTML creatives inside a restricted `WKWebView`.
10. Validate external click destinations.
11. Hide or collapse the placement after no-fill.
12. Never block core functionality because an advertisement failed.
13. Avoid uncontrolled automatic reload loops.
14. Test malformed and incomplete responses.
15. Test timeout and offline behavior.
16. Test application lifecycle transitions.
17. Verify iPhone, iPad, and tvOS layouts independently.
18. Keep SDK and wire-contract versions compatible.
19. Never embed server-side credentials in the application.
20. Follow applicable platform, privacy, and advertising policies.

---

## Recommended Placement Practices

Good advertisement placement should:

* Remain clearly distinguishable from application controls
* Fit inside explicit layout bounds
* Avoid covering primary navigation
* Avoid causing accidental selection
* Remain usable after dynamic type or layout changes
* Collapse gracefully after no-fill
* Require intentional interaction
* Report impressions only after viewability requirements are met
* Preserve the application's primary experience

Avoid:

* Hidden advertisements
* One-pixel placements
* Invisible interaction layers
* Ads underneath opaque views
* Automatic click opening
* Ads directly above high-frequency controls
* Reporting impressions for off-screen views
* Reloading on every layout pass
* Unrestricted web-content navigation
* Misleading advertisements that imitate system UI

---

## Build and Test

Enter the iOS package directory:

```bash
cd packages/ios
```

Build the Swift package:

```bash
swift build
```

Run the unit-test suite:

```bash
swift test
```

Combined verification:

```bash
swift build
swift test
```

The build requires:

* macOS
* Xcode or a compatible Swift toolchain
* The platform SDKs required by the selected targets

`BannerAdView` depends on UIKit and requires an iOS or tvOS environment, simulator, or device for complete UI testing.

---

## Unit Test Coverage

The XCTest suite covers platform-independent SDK behavior including:

* Request-value encoding
* Ad-model parsing
* Internal-demand parsing
* OpenRTB response parsing
* House-ad parsing
* No-fill parsing
* Invalid-response handling
* Missing-field handling
* Trackability evaluation
* Creative-kind parsing

Run the tests with:

```bash
swift test
```

---

## UI and Integration Testing

Unit tests do not fully validate UIKit rendering or platform interaction.

Before releasing a new SDK version, test:

| Scenario                         | Expected behavior                          |
| -------------------------------- | ------------------------------------------ |
| Filled image advertisement       | Creative renders successfully              |
| Internal demand response         | Parsed and exposed correctly               |
| OpenRTB response                 | Parsed and rendered through supported flow |
| House advertisement              | Parsed and rendered correctly              |
| No-fill response                 | Placement hides or collapses               |
| Invalid JSON                     | Safe no-fill                               |
| Missing impression ID            | Response is not treated as trackable       |
| Network timeout                  | Application remains stable                 |
| Offline device                   | Safe failure                               |
| View becomes visible             | Impression reports according to policy     |
| View remains off screen          | Impression is not reported                 |
| Banner removed before completion | No invalid UI update                       |
| Application backgrounds          | Tracking and UI remain consistent          |
| Click interaction                | Registered destination is used             |
| Invalid destination              | Application remains stable                 |
| Rotation                         | Layout remains valid                       |
| iPad layout                      | Banner respects available space            |
| tvOS focus navigation            | Focus remains predictable                  |

Use XCTest UI tests, simulators, and physical devices for complete integration verification.

---

## Frequently Asked Questions

### What is `TheaimartAdx`?

`TheaimartAdx` is the official native Swift SDK for integrating Theaimart ADX advertisements into iOS and tvOS applications.

### Which platforms are supported?

The SDK supports iOS and tvOS according to the targets configured by the package.

### What is the minimum supported iOS version?

The SDK supports iOS 12 and later.

### Does the SDK have third-party dependencies?

No. It uses `URLSession`, `Foundation`, and UIKit-based APIs.

### Does it support Swift Package Manager?

Yes. Add the GitHub repository as a package dependency and include the `TheaimartAdx` product in the application target.

### Does it support CocoaPods?

Yes. Add:

```ruby
pod 'TheaimartAdx', '~> 1.0'
```

### Does the SDK provide a banner view?

Yes. `BannerAdView` provides a managed UIKit banner integration.

### Can I render advertisements myself?

Yes. Use `requestAd`, inspect the returned `Ad`, and render the creative through the application's own interface.

### Does the SDK support SwiftUI?

The SDK's UIKit banner can be wrapped using `UIViewRepresentable`.

### Does `BannerAdView` report viewability automatically?

Yes. Managed banner integration handles viewability and impression reporting automatically according to the SDK implementation.

### When should I call `reportViewable` manually?

Call it only when using custom rendering and after the advertisement satisfies the required viewability conditions.

### Does the SDK support OpenRTB demand?

Yes. The response parser supports OpenRTB as one of the contract-defined demand sources.

### What is a house advertisement?

A house advertisement is publisher- or platform-managed internal inventory used as a fallback or promotional creative.

### What happens when no ad is available?

The SDK returns a normal no-fill outcome. The application should hide or collapse the placement.

### Can a network failure crash the application?

The SDK is designed to fail closed. Network, parsing, and supported rendering failures should produce no-fill behavior rather than an uncaught application error.

### Why does the SDK use a custom User-Agent?

The custom User-Agent identifies the official SDK and Apple platform, supports backend device classification, and avoids generic identifiers that may be classified as bot traffic.

### Can I customize the User-Agent?

Use a custom User-Agent only for a verified requirement. It should preserve the SDK identifier, version, and device or platform token required by the wire contract.

### Can I place a private API key in the application?

No. Only public publisher keys intended for client-side use should be embedded in the application.

### Does `BannerAdView` require UIKit?

Yes. The banner view depends on UIKit and requires a compatible Apple platform environment.

### Can I build the package on Linux?

The model and encoding code may be portable Swift, but complete iOS and tvOS development, UIKit compilation, simulator testing, and distribution require macOS and Xcode.

### How should HTML advertisements be rendered?

Use a controlled renderer such as a carefully configured `WKWebView`, subject to the exact creative model and platform requirements.

---

## Apple App Monetization with Theaimart ADX

The Theaimart ADX Swift SDK is intended for developers building:

* iPhone applications
* iPad applications
* Apple TV applications
* Swift applications
* UIKit applications
* SwiftUI applications with UIKit wrappers
* AI-powered applications
* Productivity applications
* Utility applications
* Content applications
* Media applications
* Developer tools
* Publisher applications
* Subscription companion applications
* Consumer software
* Cross-platform products with a native Apple client

The SDK provides a native connection between Apple applications and the Theaimart advertising infrastructure while keeping networking, parsing, and production failure behavior predictable.

Learn more about Theaimart ADX:

https://adx.theaimart.co

---

## Wire Contract

The SDK implements version 1 of the Theaimart ADX wire contract:

```text
../../CONTRACT.md
```

Relevant contract areas include:

* Advertisement request structure
* Publisher authentication
* Response variants
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill behavior
* User-Agent requirements
* Device classification
* Free-text encoding
* Impression identifiers
* Viewability reporting
* Click tracking
* Creative representation
* Error handling

The SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response payloads, demand-source representation, creative formats, or tracking behavior should be introduced through an explicit contract-version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
