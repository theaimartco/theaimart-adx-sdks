# Theaimart ADX Android SDK

The official **Theaimart ADX Android SDK** for integrating advertisements and monetizing Android applications with the [Theaimart Ad Network](https://adx.theaimart.co).

Built natively in **Kotlin**, the SDK provides a lightweight, reliable, and privacy-conscious way for Android developers and publishers to request, render, track, and monetize ads inside mobile applications.

The SDK has:

* Zero third-party runtime dependencies
* Native Android networking through `HttpURLConnection`
* Native JSON parsing through `org.json`
* Automatic banner rendering
* Viewability and click tracking
* Internal, OpenRTB, and house-ad support
* Main-thread callbacks
* Safe no-fill behavior
* Android API 21+ compatibility
* Full compatibility with the Theaimart ADX wire contract v1

> **Minimum Android SDK:** API 21
> **Language:** Kotlin
> **Java requirement:** JDK 17 for building
> **License:** Apache License 2.0

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Theaimart Android Ad SDK?](#why-use-the-theaimart-android-ad-sdk)
* [Features](#features)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Banner Ad Integration](#banner-ad-integration)
* [Custom Ad Rendering](#custom-ad-rendering)
* [Blocking and Coroutine Usage](#blocking-and-coroutine-usage)
* [Viewability Tracking](#viewability-tracking)
* [Click Tracking](#click-tracking)
* [Ad Request Configuration](#ad-request-configuration)
* [Ad Response Model](#ad-response-model)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [Zero-Dependency Architecture](#zero-dependency-architecture)
* [User-Agent and Device Classification](#user-agent-and-device-classification)
* [Security and Input Encoding](#security-and-input-encoding)
* [API Reference](#api-reference)
* [Build and Test](#build-and-test)
* [Requirements](#requirements)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and app-monetization platform designed to help developers, publishers, and software businesses monetize applications across supported platforms.

The **Theaimart ADX Android SDK** connects an Android application to the Theaimart advertising infrastructure. It allows the application to:

1. Send an ad request for a configured placement or slot.
2. Receive an eligible advertisement or a safe no-fill response.
3. Render the returned advertisement.
4. Report viewable impressions.
5. Direct users through the associated click-tracking URL.
6. Monetize eligible application traffic through Theaimart ADX.

This repository contains the official native Android integration for applications written in Kotlin or Java-compatible Android projects.

---

## Why use the Theaimart Android Ad SDK?

The SDK is designed for Android developers who need a small and predictable ad-network integration without adding large networking or serialization libraries to their applications.

Unlike many mobile advertising SDKs, the Theaimart ADX Android SDK does not depend on OkHttp, Retrofit, Gson, Moshi, or another third-party HTTP or JSON stack.

This provides several practical advantages:

* Smaller dependency surface
* Reduced risk of dependency-version conflicts
* Native compatibility with Android networking
* Predictable request headers
* Controlled User-Agent behavior
* Safe handling of malformed responses
* Fewer transitive dependencies
* Simple integration into existing Android projects
* Reduced chance of an advertising failure crashing the host application

The SDK fails closed: networking errors, parsing errors, invalid responses, or tracking failures result in a no-fill or ignored best-effort beacon rather than an application crash.

---

## Features

### Native Kotlin Android SDK

The SDK is implemented for native Android applications and can be consumed from Kotlin-based Android projects.

### Zero third-party dependencies

Runtime networking and response parsing use Android platform APIs:

* `HttpURLConnection`
* `org.json`

No external HTTP client or JSON library is required.

### Drop-in banner ad view

`BannerAdView` provides a managed banner implementation that handles:

* Ad loading
* Creative rendering
* Viewability detection
* Impression tracking
* Click handling
* Success and failure callbacks

### Custom rendering support

Applications that require complete control over their interface can request an ad directly and render the returned creative themselves.

### Multiple demand sources

The ad response can identify demand from:

* `INTERNAL`
* `OPENRTB`
* `HOUSE`

### Image and HTML creatives

The SDK recognizes the following creative types:

* `IMAGE`
* `HTML`
* `NO_FILL`

### Main-thread callbacks

Asynchronous ad-request callbacks are delivered on the Android main thread, making it easier to update application views safely.

### Viewability reporting

Trackable advertisements expose an impression identifier that can be used with `reportViewable`.

### Safe no-fill behavior

Errors are converted into a controlled no-fill result instead of propagating unsafe exceptions through the application.

### Backend-compatible User-Agent

The SDK sends a purpose-built Android User-Agent instead of the default OkHttp User-Agent.

### Input-safe request encoding

Free-text request parameters are encoded according to the Theaimart ADX contract before being transmitted.

---

## Installation

Theaimart ADX Android is distributed as a Maven artifact.

### Maven Central

Ensure that Maven Central is enabled inside `settings.gradle.kts`:

```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)

    repositories {
        google()
        mavenCentral()
    }
}
```

Add the SDK dependency to your application module:

```kotlin
dependencies {
    implementation("co.theaimart:adx-android:1.0.0")
}
```

After adding the dependency, synchronize the Gradle project.

### Groovy Gradle

For projects using `build.gradle` instead of `build.gradle.kts`:

```groovy
dependencies {
    implementation "co.theaimart:adx-android:1.0.0"
}
```

---

## Quick Start

Import the primary SDK classes:

```kotlin
import co.theaimart.adx.Adx
import co.theaimart.adx.AdRequest
import co.theaimart.adx.AdKind
import co.theaimart.adx.AdSource
import co.theaimart.adx.BannerAdView
```

Create a reusable `Adx` client with your public publisher API key:

```kotlin
val adx = Adx(
    apiKey = "pk_your_publisher_key"
)
```

Create an ad request using the slot ID configured in your Theaimart ADX publisher account:

```kotlin
val request = AdRequest(
    slotId = "8b1f2c3d-0000-0000-0000-000000000000"
)
```

You can then either use the managed `BannerAdView` or request and render the advertisement yourself.

---

## Banner Ad Integration

The simplest way to integrate a banner advertisement is to use `BannerAdView`.

### Programmatic integration

```kotlin
val adx = Adx(
    apiKey = "pk_your_publisher_key"
)

val request = AdRequest(
    slotId = "8b1f2c3d-0000-0000-0000-000000000000"
)

val banner = BannerAdView(context)
banner.cornerRadiusDp = 12f
banner.elevated = true

banner.onAdLoaded = {
    // The advertisement was loaded and rendered successfully.
}

banner.onAdFailed = {
    // The request returned no fill or could not be rendered.
}

banner.load(adx, request)

container.addView(banner)
```

The managed banner view handles the normal advertisement lifecycle, including:

* Sending the request
* Processing the response
* Rendering the supported creative
* Detecting viewability
* Reporting the impression
* Opening the click URL

### Activity example

```kotlin
class MainActivity : AppCompatActivity() {

    private lateinit var adx: Adx

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        adx = Adx(
            apiKey = "pk_your_publisher_key"
        )

        val container = findViewById<ViewGroup>(R.id.adContainer)

        val banner = BannerAdView(this)

        banner.onAdLoaded = {
            banner.visibility = View.VISIBLE
        }

        banner.onAdFailed = {
            banner.visibility = View.GONE
        }

        banner.load(
            adx = adx,
            request = AdRequest(
                slotId = "8b1f2c3d-0000-0000-0000-000000000000"
            )
        )

        container.addView(banner)
    }
}
```

---

## Custom Ad Rendering

Developers who need a custom UI can request the advertisement directly.

```kotlin
val adx = Adx(
    apiKey = "pk_your_publisher_key"
)

val request = AdRequest(
    slotId = "8b1f2c3d-0000-0000-0000-000000000000"
)

adx.requestAd(request) { ad ->
    if (!ad.filled) {
        // No eligible advertisement was returned.
        return@requestAd
    }

    when (ad.kind) {
        AdKind.IMAGE -> {
            // Render the image creative using your own UI.
        }

        AdKind.HTML -> {
            // Render the HTML creative using an appropriate controlled view.
        }

        AdKind.NO_FILL -> {
            // Hide or collapse the ad placement.
        }
    }

    if (ad.isTrackable) {
        adx.reportViewable(ad.impId)
    }
}
```

The callback from `requestAd` is delivered on the Android main thread.

This makes it suitable for:

* Showing or hiding views
* Updating a banner container
* Rendering a creative
* Modifying application UI state

---

## Blocking and Coroutine Usage

The SDK also exposes a blocking request method:

```kotlin
val ad = adx.requestAdBlocking(
    AdRequest(
        slotId = "8b1f2c3d-0000-0000-0000-000000000000"
    )
)
```

Do not call `requestAdBlocking` on the Android main thread.

Use it from:

* A background thread
* An executor
* A worker
* A coroutine using an I/O dispatcher

### Coroutine example

```kotlin
lifecycleScope.launch {
    val ad = withContext(Dispatchers.IO) {
        adx.requestAdBlocking(
            AdRequest(
                slotId = "8b1f2c3d-0000-0000-0000-000000000000"
            )
        )
    }

    if (ad.filled) {
        // Render the advertisement on the main thread.
    }
}
```

The blocking API is useful when integrating the SDK into an existing coroutine-based or synchronous data flow.

---

## Viewability Tracking

A filled advertisement may provide an impression ID that can be reported after the advertisement becomes viewable.

```kotlin
if (ad.isTrackable) {
    adx.reportViewable(ad.impId)
}
```

`reportViewable` is a best-effort operation.

A tracking failure does not crash the application and does not invalidate the already-rendered advertisement.

When using `BannerAdView`, viewability reporting is handled automatically.

When implementing custom rendering, the application is responsible for calling `reportViewable` only when the advertisement satisfies its viewability requirements.

---

## Click Tracking

Generate the click-tracking URL for a valid impression:

```kotlin
val url = adx.clickUrl(ad.impId)
```

The resulting URL can be opened through an Android intent:

```kotlin
val clickIntent = Intent(
    Intent.ACTION_VIEW,
    Uri.parse(adx.clickUrl(ad.impId))
)

context.startActivity(clickIntent)
```

When using `BannerAdView`, click handling is performed automatically.

For custom rendering, the application should use the SDK-generated click URL rather than bypassing the registered impression.

---

## Ad Request Configuration

Create a request with an ad-slot identifier:

```kotlin
val request = AdRequest(
    slotId = "8b1f2c3d-0000-0000-0000-000000000000"
)
```

The slot ID connects the SDK request to the corresponding publisher placement configured in Theaimart ADX.

Use a different slot ID for placements that require independent reporting or configuration, such as:

* Home-screen banner
* Article banner
* Dashboard banner
* Content-detail placement
* Application footer placement

Do not use placeholder UUIDs in production builds.

---

## Ad Response Model

An ad request returns an `Ad` model.

The model exposes the following properties:

| Property      | Description                                              |
| ------------- | -------------------------------------------------------- |
| `filled`      | Indicates whether an eligible advertisement was returned |
| `kind`        | Creative type: `IMAGE`, `HTML`, or `NO_FILL`             |
| `source`      | Demand source: `INTERNAL`, `OPENRTB`, or `HOUSE`         |
| `impId`       | Impression identifier used for tracking                  |
| `creative`    | Creative payload returned by the ad server               |
| `auction`     | Auction-related response information                     |
| `reason`      | No-fill or failure reason, when available                |
| `isTrackable` | Indicates whether viewability can be reported            |

### Filled advertisement

```kotlin
if (ad.filled) {
    // An eligible creative was returned.
}
```

### No-fill response

```kotlin
if (!ad.filled) {
    val reason = ad.reason

    // Hide the placement or continue without an advertisement.
}
```

### Creative-type handling

```kotlin
when (ad.kind) {
    AdKind.IMAGE -> {
        // Handle an image advertisement.
    }

    AdKind.HTML -> {
        // Handle an HTML advertisement.
    }

    AdKind.NO_FILL -> {
        // No creative is available.
    }
}
```

### Demand-source inspection

```kotlin
when (ad.source) {
    AdSource.INTERNAL -> {
        // Advertisement supplied by internal demand.
    }

    AdSource.OPENRTB -> {
        // Advertisement supplied through OpenRTB demand.
    }

    AdSource.HOUSE -> {
        // House advertisement.
    }
}
```

---

## Error and No-Fill Handling

Advertising must never destabilize the host application.

The SDK therefore treats failures as safe no-fill outcomes whenever possible.

Potential failure conditions include:

* Network timeouts
* Connection failures
* Invalid HTTP responses
* Invalid JSON
* Missing response fields
* Unsupported creative types
* Malformed tracking identifiers
* Rendering failures

Recommended application behavior:

```kotlin
adx.requestAd(request) { ad ->
    if (!ad.filled) {
        adContainer.visibility = View.GONE
        return@requestAd
    }

    adContainer.visibility = View.VISIBLE

    // Render the creative.
}
```

Applications should not reserve a permanently empty area when the request produces no fill. Collapse or hide the placement where appropriate.

---

## Zero-Dependency Architecture

The Theaimart ADX Android SDK intentionally avoids third-party runtime dependencies.

Networking is implemented using:

```text
java.net.HttpURLConnection
```

JSON parsing is implemented using:

```text
org.json
```

This design prevents the SDK from introducing runtime dependencies such as:

* OkHttp
* Retrofit
* Gson
* Moshi
* Jackson

A zero-dependency Android ad SDK can reduce:

* Dependency conflicts
* Application method count
* Transitive package exposure
* Library-version incompatibilities
* Unexpected networking behavior
* User-Agent inconsistencies

It also allows the SDK to control the complete ad-request path and maintain compatibility with the Theaimart ADX backend contract.

---

## User-Agent and Device Classification

Some HTTP clients automatically send a generic User-Agent.

For example, an OkHttp-based request commonly uses a User-Agent similar to:

```text
okhttp/<version>
```

The Theaimart ADX backend bot-protection policy may classify this generic identifier as automated traffic, which can result in silent no-fill responses.

The official SDK avoids this issue by using `HttpURLConnection` and sending a purpose-built User-Agent:

```text
theaimart-adx-android/<version> (Android <os-version>; <device-model>)
```

Example:

```text
theaimart-adx-android/1.0.0 (Android 15; Pixel 9)
```

This identifier:

* Identifies the official Theaimart Android SDK
* Includes an explicit Android platform token
* Communicates the SDK version
* Supports backend device classification
* Avoids the blocked generic OkHttp User-Agent pattern

The User-Agent behavior follows the requirements defined in `CONTRACT.md` section 6.

---

## Security and Input Encoding

The SDK encodes free-text request parameters before transmitting them to the advertising backend.

This behavior follows the input-handling rules defined in `CONTRACT.md` section 7.

The encoding layer is designed to:

* Preserve valid application-supplied values
* Prevent malformed query construction
* Keep request values compatible with backend filtering
* Reduce the risk of unsafe free-text values reaching SQL-backed filters
* Produce deterministic request parameters

The SDK also follows a fail-closed policy:

```text
Unexpected error → no fill
```

It does not follow an unsafe fail-open policy:

```text
Unexpected error → crash or unverified creative
```

Publisher API keys embedded inside an Android application must be public publisher keys intended for client-side use.

Do not place administrative credentials, private backend secrets, database credentials, or server-side API keys inside an Android application.

---

## API Reference

### `Adx`

Creates an SDK client.

```kotlin
Adx(
    apiKey: String,
    baseUrl: String = ...,
    timeoutMs: Int = ...,
    userAgent: String = ...
)
```

#### Parameters

| Parameter   | Description                                           |
| ----------- | ----------------------------------------------------- |
| `apiKey`    | Public publisher key used to authenticate ad requests |
| `baseUrl`   | Theaimart ADX API base URL                            |
| `timeoutMs` | Network timeout in milliseconds                       |
| `userAgent` | User-Agent sent with SDK requests                     |

For standard production integrations, use the default `baseUrl` and generated User-Agent unless a controlled environment requires an override.

---

### `requestAd`

Sends an asynchronous advertisement request.

```kotlin
adx.requestAd(
    request = AdRequest(...),
    callback = { ad ->
        // Handle response.
    }
)
```

The callback is delivered on the Android main thread.

---

### `requestAdBlocking`

Sends a synchronous advertisement request.

```kotlin
val ad = adx.requestAdBlocking(
    AdRequest(...)
)
```

This method must be called from a background thread or coroutine I/O dispatcher.

---

### `reportViewable`

Reports a viewable impression.

```kotlin
adx.reportViewable(ad.impId)
```

The operation is best effort and does not throw tracking failures into normal application flow.

---

### `clickUrl`

Returns the click-tracking URL associated with an impression.

```kotlin
val clickUrl = adx.clickUrl(ad.impId)
```

---

### `BannerAdView`

Managed Android view for requesting and rendering a banner advertisement.

```kotlin
val banner = BannerAdView(context)

banner.onAdLoaded = {
    // Advertisement successfully loaded.
}

banner.onAdFailed = {
    // Advertisement unavailable or could not be rendered.
}

banner.load(
    adx = adx,
    request = AdRequest(
        slotId = "your-slot-id"
    )
)
```

The view handles:

* Request execution
* Creative rendering
* Viewability tracking
* Click handling
* Loaded callback
* Failed callback
* Theme-aware loading surface, rounded clipping, elevation, and image fade-in

---

## Build and Test

Clone the repository and enter the Android package directory:

```bash
cd packages/android
```

Run JVM unit tests:

```bash
./gradlew :adx:test
```

Build the release artifact:

```bash
./gradlew :adx:assembleRelease
```

Publish the SDK to the local Maven repository:

```bash
./gradlew :adx:publishToMavenLocal
```

The local Maven artifact can then be consumed from another project by enabling `mavenLocal()`:

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenLocal()
        mavenCentral()
    }
}
```

Run all relevant verification tasks before publishing a new SDK version:

```bash
./gradlew :adx:test :adx:assembleRelease :adx:publishToMavenLocal
```

---

## Test Coverage

The JVM unit-test suite covers the platform-independent SDK behavior, including:

* Request-value encoding
* Ad-response model parsing
* Filled-ad parsing
* No-fill parsing
* Creative-type handling
* Demand-source handling
* Malformed-response behavior

Run the tests with:

```bash
./gradlew :adx:test
```

`BannerAdView` depends on Android framework behavior and therefore requires an Android device, emulator, or appropriate Android instrumentation environment for complete UI verification.

Before publishing a release, test the banner integration on representative Android environments, including:

* Minimum supported Android API
* Recent Android API version
* Physical Android device
* Android emulator
* Filled-ad response
* No-fill response
* Network timeout
* Invalid creative response
* Viewability reporting
* Click handling

---

## Requirements

### Application integration

* Android `minSdk` 21 or later
* Kotlin-compatible Android project
* Internet connectivity
* Valid Theaimart ADX publisher key
* Valid Theaimart ADX slot ID

### SDK development

* Android SDK
* JDK 17
* Gradle wrapper included with the project

---

## Wire Contract

The SDK implements version 1 of the Theaimart ADX wire contract:

```text
../../CONTRACT.md
```

Relevant contract sections include:

* Request and response structure
* Authentication behavior
* User-Agent requirements
* Device classification
* Input encoding
* Impression tracking
* Click tracking
* Error and no-fill behavior

The SDK and backend contract should remain version-compatible. Any breaking change to request fields, response fields, tracking behavior, or creative representation should be introduced through an explicit contract-version update.

---

## Recommended Production Integration

For a stable Android application integration:

1. Create one reusable `Adx` client.
2. Use the public publisher key assigned to the application.
3. Configure a separate slot ID for each meaningful ad placement.
4. Use `BannerAdView` for standard banner rendering.
5. Use direct requests only when custom rendering is necessary.
6. Do not call `requestAdBlocking` from the main thread.
7. Report custom-rendered impressions only after the creative becomes viewable.
8. Use `clickUrl` for advertisement click navigation.
9. Hide or collapse placements after no-fill responses.
10. Never allow an advertising error to block the primary application experience.

Example reusable client:

```kotlin
object AppAds {

    val client: Adx by lazy {
        Adx(
            apiKey = "pk_your_publisher_key"
        )
    }
}
```

Usage:

```kotlin
banner.load(
    adx = AppAds.client,
    request = AdRequest(
        slotId = "8b1f2c3d-0000-0000-0000-000000000000"
    )
)
```

---

## Frequently Asked Questions

### Does the SDK require OkHttp?

No. The SDK uses `HttpURLConnection` and has zero third-party runtime dependencies.

### Why does the SDK not use the default OkHttp User-Agent?

Generic OkHttp User-Agents can match the backend bot blocklist and produce silent no-fill responses. The official SDK sends a platform-specific Theaimart ADX Android User-Agent.

### What is the minimum supported Android version?

The SDK supports Android API 21 and later.

### Can I render advertisements myself?

Yes. Use `requestAd` or `requestAdBlocking`, inspect the returned `Ad`, and render the creative through your own application UI.

### Does the SDK support automatic banner rendering?

Yes. Use `BannerAdView` for managed loading, rendering, viewability tracking, and click handling.

### What happens when an ad request fails?

The SDK fails closed. Errors are converted into safe no-fill behavior rather than crashing the host application.

### Is the asynchronous callback executed on the main thread?

Yes. The callback from `requestAd` is delivered on the Android main thread.

### Can I call `requestAdBlocking` from the UI thread?

No. Call it from a background thread or coroutine using `Dispatchers.IO`.

### Does the SDK support impression tracking?

Yes. Use `reportViewable` for a trackable advertisement. `BannerAdView` handles this automatically.

### Which creative types are supported?

The response model supports image, HTML, and no-fill creative types.

### Which demand sources are represented?

The response model identifies internal, OpenRTB, and house-ad sources.

---

## Android App Monetization with Theaimart ADX

Theaimart ADX Android SDK is intended for developers building:

* Android mobile applications
* Kotlin applications
* Utility applications
* Productivity applications
* Content applications
* Developer tools
* AI-powered applications
* Publisher applications
* Consumer applications
* Android products requiring native ad monetization

The SDK provides the Android-side connection between these applications and the Theaimart advertising platform while keeping integration lightweight and operational failures isolated from the primary user experience.

To learn more about Theaimart ADX, visit:

https://adx.theaimart.co

---

## License

```text
Apache License 2.0
```

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this project except in compliance with the License. See the repository license file for the complete license terms.
