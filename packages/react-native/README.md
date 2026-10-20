# Theaimart ADX React Native SDK

The official **Theaimart ADX SDK for React Native**, designed for monetizing cross-platform Android and iOS applications with native image ads, HTML creatives, OpenRTB demand, viewability tracking, and click handling.

`@theaimart/adx-react-native` provides:

* A drop-in React Native `<BannerAd>` component
* A framework-agnostic `AdxClient`
* Native Android and iOS support
* Automatic image-ad rendering
* Optional HTML and OpenRTB rendering
* Automatic viewability tracking
* Platform-aware User-Agent generation
* Safe no-fill behavior
* TypeScript declarations
* Compatibility with Theaimart ADX wire contract v1

```bash
npm install @theaimart/adx-react-native
```

Install `react-native-webview` only when your application expects HTML or OpenRTB creatives:

```bash
npm install react-native-webview
```

> **Platforms:** Android and iOS
> **Language:** TypeScript and JavaScript
> **Peer dependencies:** `react`, `react-native`
> **Optional dependency:** `react-native-webview`
> **Wire contract:** Theaimart ADX v1
> **License:** Apache License 2.0

---

## Features

* Official Theaimart ADX React Native SDK
* Android app monetization
* iOS app monetization
* Cross-platform advertising component
* TypeScript-first API
* Bundled TypeScript declarations
* Drop-in `<BannerAd>` component
* Framework-agnostic `AdxClient`
* Native image-ad rendering
* Click handling with React Native `Linking`
* Optional HTML creative rendering
* Optional OpenRTB creative rendering
* Sandboxed WebView integration
* Automatic viewability measurement
* 50% visibility for one-second threshold
* Viewability reporting
* Click-tracking URL support
* Internal-demand support
* OpenRTB-demand support
* House-ad support
* Safe no-fill handling
* Platform-specific User-Agent
* Android OkHttp bot-blocklist protection
* SQL-filter-safe request encoding
* Typed response normalization
* Fail-closed network behavior
* Client-side custom rendering support
* Off-device unit-testable request logic
* Compatibility with the Theaimart ADX wire contract v1

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the React Native SDK?](#why-use-the-react-native-sdk)
* [Supported Platforms](#supported-platforms)
* [Requirements](#requirements)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Banner Ad Integration](#banner-ad-integration)
* [Image Ads](#image-ads)
* [HTML and OpenRTB Creatives](#html-and-openrtb-creatives)
* [Direct Client Usage](#direct-client-usage)
* [Viewability Tracking](#viewability-tracking)
* [Click Handling](#click-handling)
* [User-Agent and Device Classification](#user-agent-and-device-classification)
* [SQL-Filter-Safe Encoding](#sql-filter-safe-encoding)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Union Parsing](#four-way-union-parsing)
* [API Reference](#api-reference)
* [React Native Lifecycle](#react-native-lifecycle)
* [Android Integration Notes](#android-integration-notes)
* [iOS Integration Notes](#ios-integration-notes)
* [Expo Considerations](#expo-considerations)
* [Production Integration](#production-integration)
* [Security Guidance](#security-guidance)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for developers, publishers, mobile applications, websites, software products, and cross-platform applications.

The React Native SDK connects Android and iOS applications to the Theaimart advertising infrastructure.

It allows an application to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Receive an internal, OpenRTB, house, or no-fill response.
4. Render image advertisements using React Native components.
5. Render HTML or OpenRTB creatives using an optional WebView.
6. Measure advertisement viewability.
7. Report viewable impressions.
8. Open registered click destinations.
9. Handle network and parsing failures safely.
10. Monetize eligible mobile application traffic.

The SDK provides both a managed React component and a lower-level client API.

Use `<BannerAd>` for a standard integration.

Use `AdxClient` when your application requires complete control over requests, rendering, viewability, and layout behavior.

---

## Why use the React Native SDK?

React Native applications share JavaScript logic across Android and iOS, but networking and rendering still depend on native platform behavior.

A direct custom integration can encounter several production issues:

* Android networking may send a generic OkHttp User-Agent.
* Generic HTTP-client identifiers may be classified as bot traffic.
* The backend may return a silent no-fill response.
* Free-text query values may trigger Web Application Firewall rules.
* Internal, OpenRTB, house, and no-fill responses can use different payload shapes.
* HTML creative rendering can introduce WebView security risks.
* Impression tracking can fire before the advertisement is actually viewable.
* Network or parsing failures can destabilize the host application.

`@theaimart/adx-react-native` handles these concerns through:

* A platform-aware SDK User-Agent
* Contract-compliant free-text encoding
* Typed response normalization
* Automatic viewability detection
* Managed image rendering
* Optional sandboxed WebView rendering
* Safe failure behavior
* Direct client access for advanced integrations

---

## Supported Platforms

| Platform                         | Support                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| Android                          | Supported                                                         |
| iPhone                           | Supported                                                         |
| iPad                             | Supported where the React Native application supports it          |
| Android emulator                 | Supported for integration testing                                 |
| iOS simulator                    | Supported for integration testing                                 |
| React Native New Architecture    | Verify against the installed package version                      |
| React Native Legacy Architecture | Verify against the installed package version                      |
| React Native Web                 | Not the primary target unless explicitly supported by the package |

The package is designed primarily for native Android and iOS applications built with React Native.

Rendering behavior depends on the capabilities of:

* React Native `Image`
* React Native `Pressable`
* React Native `Linking`
* React Native layout measurement
* `react-native-webview`, when HTML creatives are enabled

Test every application target independently.

---

## Requirements

The package requires:

* React
* React Native
* A valid Theaimart ADX public publisher key
* A valid Theaimart ADX slot ID or supported slot name
* Network connectivity
* A supported Android or iOS React Native application

Peer dependencies:

```json
{
  "react": "*",
  "react-native": "*"
}
```

Optional HTML-rendering dependency:

```bash
npm install react-native-webview
```

The exact supported React Native, React, Android, iOS, TypeScript, and Node.js versions should be confirmed from the package metadata for the released version.

---

## Installation

Install the SDK using npm:

```bash
npm install @theaimart/adx-react-native
```

Using pnpm:

```bash
pnpm add @theaimart/adx-react-native
```

Using Yarn:

```bash
yarn add @theaimart/adx-react-native
```

Install the optional WebView dependency when HTML or OpenRTB creatives are expected:

```bash
npm install react-native-webview
```

For iOS projects, install CocoaPods after adding native dependencies:

```bash
cd ios
pod install
cd ..
```

Import the package:

```tsx
import {
  BannerAd,
  AdxClient,
  platformUserAgent,
} from '@theaimart/adx-react-native';
```

---

## Quick Start

Add a managed banner advertisement to a React Native screen:

```tsx
import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BannerAd } from '@theaimart/adx-react-native';

export function MonetizedScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text>Application content</Text>
      </View>

      <BannerAd
        apiKey="pk_your_publisher_key"
        slotId="8b1f2c3d-0000-0000-0000-000000000000"
        onLoad={(ad) => {
          console.log('Advertisement filled by', ad.source);
        }}
        onError={(error) => {
          console.log('Advertisement unavailable', error.message);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Replace:

* `pk_your_publisher_key` with your public publisher key
* The sample UUID with the slot ID configured in Theaimart ADX

Do not embed administrative or server-side secrets inside a React Native application.

---

## Banner Ad Integration

`BannerAd` is the recommended integration for standard mobile banner placements.

```tsx
import { BannerAd } from '@theaimart/adx-react-native';

export function FooterAd() {
  return (
    <BannerAd
      apiKey="pk_your_publisher_key"
      slotId="footer-banner-slot-id"
      onLoad={(ad) => {
        console.log({
          filled: ad.filled,
          source: ad.source,
          kind: ad.kind,
          impressionId: ad.impId,
        });
      }}
      onError={(error) => {
        console.log('No fill or rendering failure:', error.message);
      }}
    />
  );
}
```

The managed component handles the standard advertising lifecycle:

* Creating or configuring an ADX client
* Sending the ad request
* Parsing the response
* Determining filled or no-fill state
* Rendering supported image creatives
* Rendering HTML creatives when WebView support is available
* Measuring advertisement visibility
* Reporting a viewable impression
* Handling advertisement presses
* Opening the registered destination
* Isolating network and rendering errors

---

## Placement Inside a Screen

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BannerAd } from '@theaimart/adx-react-native';

export function ArticleScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Article Title</Text>

      <Text style={styles.paragraph}>
        Your application content appears here.
      </Text>

      <View style={styles.adContainer}>
        <BannerAd
          apiKey="pk_your_publisher_key"
          slotId="article-inline-banner"
          onError={(error) => {
            console.log('Inline ad unavailable:', error.message);
          }}
        />
      </View>

      <Text style={styles.paragraph}>
        Additional content continues below the advertisement.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
  adContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
});
```

Ensure that the placement:

* Has enough layout space
* Is not clipped by parent containers
* Is not hidden behind overlays
* Is not covered by navigation controls
* Can be measured using `measureInWindow`
* Does not create accidental taps
* Collapses or remains unobtrusive after no-fill

---

## Conditional Banner Rendering

An application can track loaded and failed states:

```tsx
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BannerAd,
  type Ad,
} from '@theaimart/adx-react-native';

export function ManagedAdSlot() {
  const [loadedAd, setLoadedAd] = useState<Ad | null>(null);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <View style={styles.container}>
      <BannerAd
        apiKey="pk_your_publisher_key"
        slotId="managed-banner-slot"
        onLoad={(ad) => {
          setLoadedAd(ad);
          setFailed(false);
        }}
        onError={() => {
          setLoadedAd(null);
          setFailed(true);
        }}
      />

      {loadedAd ? null : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Use the exact exported `Ad` type and component callback signatures from the installed package version.

---

## Image Ads

Image creatives are rendered with native React Native primitives.

The managed component uses behavior equivalent to:

```tsx
<Pressable onPress={handleAdPress}>
  <Image
    source={{ uri: imageUrl }}
    resizeMode="contain"
  />
</Pressable>
```

The SDK is responsible for:

* Extracting the image creative
* Loading the remote image
* Applying the supported size or layout rules
* Associating the press action with the impression
* Opening the registered click destination
* Measuring viewability
* Reporting the impression when eligible
* Handling image-load failure safely

### Custom image rendering

When using `AdxClient` directly:

```tsx
import React from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  AdxClient,
  platformUserAgent,
} from '@theaimart/adx-react-native';

const client = new AdxClient({
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
});

export async function loadCustomAd() {
  const ad = await client.requestAd({
    slotId: 'custom-image-slot',
  });

  if (!ad.filled || ad.kind !== 'image') {
    return null;
  }

  return ad;
}
```

A custom renderer must implement:

* Creative validation
* Correct image sizing
* Viewability timing
* Impression deduplication
* Click handling
* Missing-data behavior
* Error isolation
* Accessibility labels where appropriate

---

## HTML and OpenRTB Creatives

HTML and OpenRTB creatives require `react-native-webview`.

Install it:

```bash
npm install react-native-webview
```

For iOS:

```bash
cd ios
pod install
cd ..
```

The managed banner can render compatible HTML creatives using a sandboxed WebView implementation.

Conceptually:

```tsx
import { WebView } from 'react-native-webview';

<WebView
  source={{ html: creativeHtml }}
  javaScriptEnabled
  originWhitelist={['https://*']}
  onShouldStartLoadWithRequest={handleNavigation}
/>
```

The exact WebView configuration is controlled by the SDK implementation.

### Why WebView support is optional

Many applications only need image advertisements.

Making `react-native-webview` optional provides several benefits:

* Smaller dependency graph
* Fewer native modules
* Reduced application size
* Simpler Android builds
* Simpler iOS CocoaPods configuration
* Fewer platform compatibility risks
* No unnecessary WebView dependency for image-only integrations

Install the optional package only when your demand configuration can return HTML or OpenRTB creatives.

---

## WebView Security

HTML advertisements should run inside a restricted environment.

A secure WebView configuration should consider:

* Restricting navigation
* Validating external destinations
* Disabling unnecessary native bridges
* Avoiding unrestricted `postMessage` handling
* Preventing file-system access
* Preventing local resource access
* Restricting origin patterns
* Applying explicit dimensions
* Preventing pop-up abuse
* Handling failed loads safely
* Avoiding broad mixed-content policies
* Avoiding unrestricted JavaScript injection

The exact security posture depends on the creative format and React Native WebView version.

Do not expose privileged application functions to advertisement JavaScript.

---

## Direct Client Usage

Use `AdxClient` for custom interfaces and framework-independent request logic.

```ts
import {
  AdxClient,
  platformUserAgent,
} from '@theaimart/adx-react-native';

const client = new AdxClient({
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
});

const ad = await client.requestAd({
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
});

if (!ad.filled) {
  console.log('No fill:', ad.reason);
} else {
  console.log('Advertisement source:', ad.source);
}

if (ad.filled && ad.isTrackable && ad.impId) {
  await client.reportViewable(ad.impId);
}
```

The direct client is suitable for:

* Custom banner components
* Custom design-system components
* Redux or Zustand-managed ad state
* React Context-based ad services
* Placement preloading
* Custom viewability logic
* Custom HTML rendering
* Application-specific retry behavior
* Ad-debugging tools
* Automated testing
* Non-React request workflows

---

## Reusable Ad Service

```ts
import {
  AdxClient,
  platformUserAgent,
} from '@theaimart/adx-react-native';

class ApplicationAdService {
  private readonly client: AdxClient;

  constructor(apiKey: string) {
    this.client = new AdxClient({
      apiKey,
      userAgent: platformUserAgent(),
    });
  }

  requestBanner(slotId: string) {
    return this.client.requestAd({
      slotId,
    });
  }

  reportViewable(impressionId: string) {
    return this.client.reportViewable(impressionId);
  }

  clickUrl(impressionId: string) {
    return this.client.clickUrl(impressionId);
  }
}

export const applicationAds = new ApplicationAdService(
  'pk_your_publisher_key',
);
```

Use the exact methods exported by the installed `AdxClient` implementation.

---

## Viewability Tracking

The managed `<BannerAd>` component automatically reports a trackable impression when the advertisement remains:

* At least 50% visible
* For at least one continuous second

The component measures its position through React Native layout APIs such as `measureInWindow`.

Conceptual measurement flow:

```text
Banner renders
    ↓
Component measures screen-relative bounds
    ↓
Visible area is calculated
    ↓
Visibility reaches at least 50%
    ↓
One-second timer begins
    ↓
Visibility remains eligible
    ↓
Viewability beacon is reported
```

If visibility drops below the threshold before one second completes, the timer should be cancelled.

### Managed viewability

```tsx
<BannerAd
  apiKey="pk_your_publisher_key"
  slotId="viewable-banner-slot"
/>
```

No manual call is required when the managed component handles tracking.

### Manual viewability

When using `AdxClient` directly:

```ts
if (
  ad.filled &&
  ad.isTrackable &&
  ad.impId
) {
  await client.reportViewable(ad.impId);
}
```

Do not call `reportViewable` immediately after receiving the ad unless your custom UI has confirmed that the creative is actually viewable.

---

## Viewability Considerations

A custom viewability implementation should account for:

* Screen dimensions
* Advertisement bounds
* Parent clipping
* Scroll position
* Navigation transitions
* Modal overlays
* Application background state
* Screen focus
* Tab visibility
* Component unmounting
* Orientation changes
* Keyboard overlays
* Split-screen mode
* Repeated measurement
* Impression deduplication

An advertisement should not be counted as viewable when:

* It is off screen
* It is mostly clipped
* The screen is not active
* The application is backgrounded
* Another opaque view covers it
* The component unmounted
* The creative failed to render
* Less than 50% is visible
* The visibility period is shorter than one second

---

## Click Handling

Image-ad clicks are handled using React Native `Linking`.

Conceptual flow:

```ts
import { Linking } from 'react-native';

const supported = await Linking.canOpenURL(clickUrl);

if (supported) {
  await Linking.openURL(clickUrl);
}
```

The managed component associates the click with the impression and opens the registered destination.

A custom renderer should:

* Require an intentional user press
* Use the SDK-generated click URL
* Validate URL availability
* Handle `Linking.canOpenURL`
* Handle `Linking.openURL` failures
* Prevent duplicate navigation
* Avoid automatic redirects
* Avoid opening unrelated destinations
* Preserve the registered tracking relationship
* Avoid placing invisible press targets over the ad

Click failures should not crash the application.

---

## User-Agent and Device Classification

The SDK sends a platform-aware User-Agent.

The format follows this family:

```text
theaimart-adx-reactnative/<version> (<platform>)
```

Examples:

```text
theaimart-adx-reactnative/1.0.0 (android)
theaimart-adx-reactnative/1.0.0 (iPhone)
```

The User-Agent:

* Identifies the official React Native SDK
* Communicates the SDK version
* Includes a platform token
* Supports Android and iOS classification
* Avoids generic HTTP-client identifiers
* Reduces false bot classification
* Prevents silent no-fill caused by blocked User-Agents
* Helps the backend distinguish Android and Apple traffic

Generate the recommended value with:

```ts
import {
  platformUserAgent,
} from '@theaimart/adx-react-native';

const userAgent = platformUserAgent();
```

Pass it to the client:

```ts
const client = new AdxClient({
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
});
```

The behavior follows [CONTRACT.md section 6](../../CONTRACT.md).

---

## Why the Explicit User-Agent Matters

React Native Android networking commonly uses OkHttp internally.

A default request can use a User-Agent similar to:

```text
okhttp/<version>
```

The Theaimart ADX backend bot-protection policy may classify this generic User-Agent as automated traffic.

The result can be:

* HTTP rejection
* Silent no-fill
* Incorrect device classification
* Reduced fill rate
* Fraud-risk scoring
* Incorrect analytics
* Unusable Android monetization

The official SDK avoids this by always sending a purpose-built Theaimart ADX React Native User-Agent.

Do not remove the platform token unless a verified contract-compatible override is required.

---

## Custom User-Agent

Use the generated value by default:

```ts
const client = new AdxClient({
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
});
```

Only provide a custom User-Agent when required by a controlled environment.

A custom value should preserve:

* The Theaimart ADX React Native identifier
* The package version
* The Android or Apple platform token

Example structure:

```text
theaimart-adx-reactnative/1.0.0 (android; custom-app-context)
```

A malformed or generic value may reduce fill or cause traffic misclassification.

---

## SQL-Filter-Safe Encoding

The backend applies security filtering to query parameters.

Real URLs and page metadata can contain SQL-like text such as:

```text
end
open
cast
select
@
```

These sequences can appear legitimately inside:

* Page URLs
* Application routes
* Search queries
* Email-like values
* Campaign parameters
* Content descriptions
* Page keywords
* Deep links
* Referral URLs

A strict Web Application Firewall can reject raw parameters containing these strings.

The SDK byte-percent-encodes contract-defined free-text fields before transmission.

Example input:

```text
https://example.com/open-source/react-native?author=user@example.com
```

The SDK applies the wire-contract encoding before sending the request.

This behavior:

* Preserves legitimate URLs
* Prevents malformed query construction
* Avoids WAF false positives
* Supports reserved-looking text in application routes
* Produces deterministic request values
* Prevents normal URLs from causing HTTP 403 responses
* Keeps backend filtering compatible with application traffic

The encoding rules follow [CONTRACT.md section 7](../../CONTRACT.md).

Do not manually pre-encode values unless the contract explicitly requires it.

Double encoding can change the original value.

---

## Error and No-Fill Handling

The SDK follows a fail-closed policy.

Operational failures are converted into safe no-fill behavior instead of destabilizing the React Native application.

Potential failure conditions include:

* DNS failure
* No network connection
* Request timeout
* HTTP 403
* HTTP 500
* Invalid JSON
* Missing response fields
* Unsupported response shape
* Invalid creative kind
* Invalid demand source
* Missing image URL
* Image-load failure
* WebView-load failure
* Invalid click URL
* Viewability-report failure
* Component unmounting during a request

Expected behavior:

```text
Unexpected failure → no fill or managed error callback
```

Unsafe behavior avoided:

```text
Unexpected failure → uncaught exception or application crash
```

Managed component example:

```tsx
<BannerAd
  apiKey="pk_your_publisher_key"
  slotId="safe-banner-slot"
  onError={(error) => {
    console.log('Advertisement unavailable:', error.message);
  }}
/>
```

Direct-client example:

```ts
const ad = await client.requestAd({
  slotId: 'safe-banner-slot',
});

if (!ad.filled) {
  console.log('No fill:', ad.reason);
}
```

Advertising failure should not prevent access to the application's primary functionality.

---

## No-Fill Handling

No-fill is a normal advertising outcome.

Possible causes include:

* No eligible campaign
* Targeting mismatch
* Geographic restrictions
* Frequency limits
* Privacy state
* Fraud-risk classification
* Temporary demand shortage
* Auction timeout
* Unsupported creative configuration
* Publisher-slot configuration
* Backend protection rules

Recommended behavior:

```tsx
function AdPlacement() {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return null;
  }

  return (
    <BannerAd
      apiKey="pk_your_publisher_key"
      slotId="banner-slot"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
```

Avoid:

* Repeated immediate reloads
* Infinite request loops
* Blocking the screen
* Showing a permanent empty frame
* Replacing no-fill with misleading UI
* Reporting an impression for an unavailable ad

---

## Ad Response Model

`AdxClient.requestAd` returns a normalized `Ad` object.

Conceptually:

```ts
type Ad = {
  filled: boolean;
  kind: 'image' | 'html' | 'no_fill';
  source: 'internal' | 'openrtb' | 'house';
  impId?: string;
  identityId?: string;
  creative?: unknown;
  auction?: unknown;
  reason?: string;
  retryAfterSeconds?: number;
  isTrackable: boolean;
  raw?: unknown;
};
```

The installed package declarations are authoritative.

### Fields

| Field               | Description                                    |
| ------------------- | ---------------------------------------------- |
| `filled`            | Whether an eligible advertisement was returned |
| `kind`              | Normalized creative kind                       |
| `source`            | Normalized demand source                       |
| `impId`             | Impression identifier                          |
| `identityId`        | Identity value returned by the backend         |
| `creative`          | Creative payload                               |
| `auction`           | Auction-related metadata                       |
| `reason`            | No-fill or failure reason                      |
| `retryAfterSeconds` | Suggested retry delay                          |
| `isTrackable`       | Whether viewability can be reported            |
| `raw`               | Original response data                         |

### Filled response

```ts
if (ad.filled) {
  console.log(ad.creative);
}
```

### No-fill response

```ts
if (!ad.filled) {
  console.log(ad.reason);
}
```

### Trackable response

```ts
if (ad.isTrackable && ad.impId) {
  await client.reportViewable(ad.impId);
}
```

### Retry guidance

```ts
if (
  !ad.filled &&
  ad.retryAfterSeconds
) {
  console.log(
    `Retry after ${ad.retryAfterSeconds} seconds`,
  );
}
```

Do not implement uncontrolled automatic retries.

---

## Demand Sources

The SDK normalizes backend demand sources into:

* `internal`
* `openrtb`
* `house`

No-fill is represented through:

```ts
ad.filled === false
```

and commonly:

```ts
ad.kind === 'no_fill'
```

### Internal demand

```ts
if (ad.source === 'internal') {
  console.log('Internal Theaimart ADX demand');
}
```

An advertisement supplied through demand managed directly within Theaimart ADX.

### OpenRTB demand

```ts
if (ad.source === 'openrtb') {
  console.log('OpenRTB demand');
}
```

An advertisement returned through an OpenRTB-compatible demand integration or auction.

### House advertisement

```ts
if (ad.source === 'house') {
  console.log('House advertisement');
}
```

A publisher- or platform-managed fallback advertisement.

House ads may not contain a trackable impression ID.

Always check:

```ts
ad.isTrackable && ad.impId
```

before reporting viewability.

---

## Four-Way Union Parsing

The backend can return four logical outcomes:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The SDK normalizes all four into one `Ad` interface.

```ts
const ad = await client.requestAd({
  slotId: 'your-slot-id',
});

if (!ad.filled) {
  handleNoFill(ad);
} else {
  switch (ad.source) {
    case 'internal':
      handleInternalAd(ad);
      break;

    case 'openrtb':
      handleOpenRtbAd(ad);
      break;

    case 'house':
      handleHouseAd(ad);
      break;
  }
}
```

Malformed or incomplete responses fail closed.

The SDK does not expose unsupported payloads as valid filled advertisements.

This protects the application from:

* Invalid property access
* Unsupported creative rendering
* Missing impression IDs
* Incorrect viewability reporting
* Unsafe type assumptions
* Partially initialized models
* Unverified click behavior

---

## API Reference

## `BannerAd`

A managed React Native advertisement component.

```tsx
<BannerAd
  apiKey="pk_your_publisher_key"
  slotId="your-slot-id"
  appearance={{ borderRadius: 12, elevated: true, transitionMs: 180 }}
  onLoad={(ad) => {}}
  onError={(error) => {}}
/>
```

Common properties include:

| Property  | Description                              |
| --------- | ---------------------------------------- |
| `apiKey`  | Public Theaimart ADX publisher key       |
| `slotId`  | Configured advertisement-slot identifier |
| `onLoad`  | Called when an advertisement loads       |
| `onError` | Called for no-fill or managed failure    |
| `appearance` | Visual-only radius, surface color, elevation, and transition options |

Depending on the package implementation, the component may expose additional props for:

* Slot name
* Page context
* Style
* Creative dimensions
* User-Agent override
* WebView behavior
* Retry policy
* Test configuration
* Client injection

Use the installed TypeScript declarations as the source of truth.

---

## `AdxClient`

Creates a reusable client:

```ts
const client = new AdxClient({
  apiKey: 'pk_your_publisher_key',
  userAgent: platformUserAgent(),
});
```

Depending on the released package API, supported options can include:

* `apiKey`
* `baseUrl`
* `timeoutMs`
* `userAgent`
* `fetchImpl`
* `raiseOnError`

Use production defaults unless a controlled environment requires an override.

---

## `requestAd`

Requests an advertisement:

```ts
const ad = await client.requestAd({
  slotId: 'your-slot-id',
});
```

A more complete request can include contract-supported fields:

```ts
const ad = await client.requestAd({
  slotId: 'your-slot-id',
  slotName: 'homepage-banner',
  pageUrl: 'https://example.com/mobile-page',
  pageKeywords: 'react-native,mobile,development',
  usPrivacy: '1YNN',
  euconsentV2: consentString,
  identityCookie: identityValue,
});
```

The exact request type is defined by the exported package declarations.

---

## `reportViewable`

Reports a viewable impression:

```ts
const success = await client.reportViewable(
  impressionId,
);
```

Returns a Boolean or promise result according to the package API.

Only report a valid impression returned by the SDK.

---

## `clickUrl`

Generates the registered click URL:

```ts
const url = client.clickUrl(impressionId);
```

Use the exact method name and return type exposed by the installed SDK.

---

## `platformUserAgent`

Returns the recommended React Native platform-aware User-Agent:

```ts
const userAgent = platformUserAgent();
```

Use it when constructing `AdxClient` manually.

---

## React Native Lifecycle

React Native components can mount, unmount, rerender, and move between navigation screens frequently.

A production integration should:

* Avoid creating uncontrolled duplicate requests
* Cancel or ignore stale UI updates
* Avoid setting state after unmount
* Clear viewability timers on unmount
* Stop measuring detached views
* Avoid reloading on every render
* Reuse clients where practical
* Reset state when the slot ID changes
* Handle application backgrounding
* Handle navigation focus changes
* Prevent duplicate viewability beacons

### Reusable client with React Context

```tsx
import React, {
  createContext,
  useContext,
  useMemo,
} from 'react';
import {
  AdxClient,
  platformUserAgent,
} from '@theaimart/adx-react-native';

const AdxContext = createContext<AdxClient | null>(null);

export function AdxProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(
    () =>
      new AdxClient({
        apiKey: 'pk_your_publisher_key',
        userAgent: platformUserAgent(),
      }),
    [],
  );

  return (
    <AdxContext.Provider value={client}>
      {children}
    </AdxContext.Provider>
  );
}

export function useAdxClient() {
  const client = useContext(AdxContext);

  if (!client) {
    throw new Error(
      'useAdxClient must be used inside AdxProvider',
    );
  }

  return client;
}
```

Use lifecycle and cleanup methods exposed by the actual client implementation.

---

## Navigation Integration

When using React Navigation, an advertisement may remain mounted while the screen loses focus.

A custom integration should account for screen focus:

```tsx
import { useIsFocused } from '@react-navigation/native';

export function FocusAwareAdSlot() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return null;
  }

  return (
    <BannerAd
      apiKey="pk_your_publisher_key"
      slotId="focused-screen-banner"
    />
  );
}
```

This can prevent:

* Off-screen impression reporting
* Unnecessary requests
* Viewability measurement on inactive screens
* Duplicate placement behavior

Choose the approach that matches the managed component's lifecycle guarantees.

---

## Application Background State

A custom renderer can use `AppState`:

```tsx
import React from 'react';
import {
  AppState,
  type AppStateStatus,
} from 'react-native';

export function useApplicationActive() {
  const [state, setState] = React.useState<AppStateStatus>(
    AppState.currentState,
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      setState,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return state === 'active';
}
```

Do not report an advertisement as viewable while the application is backgrounded.

---

## Android Integration Notes

On Android:

* React Native networking commonly uses OkHttp.
* The SDK must preserve the explicit Theaimart ADX User-Agent.
* Test on the minimum supported Android API.
* Test on recent Android versions.
* Verify `Linking` behavior.
* Verify HTTPS network access.
* Test image loading under slow networks.
* Test application background and foreground transitions.
* Test orientation changes.
* Test split-screen mode.
* Verify viewability inside `ScrollView` and `FlatList`.
* Test release builds, not only debug builds.
* Verify ProGuard or R8 does not affect optional native dependencies.
* Verify `react-native-webview` setup when HTML ads are enabled.

Use secure HTTPS endpoints in production.

---

## Android Network Security

Ensure the application permits access to the required Theaimart ADX HTTPS endpoints.

Avoid using cleartext HTTP production endpoints.

When using a custom API base URL for development, Android network-security configuration may need to explicitly permit the environment.

Do not weaken the production network-security configuration unnecessarily.

---

## iOS Integration Notes

On iOS:

* Run `pod install` after adding native dependencies.
* Test on iPhone and iPad where applicable.
* Verify App Transport Security compatibility.
* Test `Linking.openURL`.
* Verify layout around safe areas.
* Test portrait and landscape orientation.
* Test application backgrounding.
* Test navigation transitions.
* Verify viewability inside scrollable views.
* Test the optional WebView dependency.
* Test release builds.
* Review applicable App Store privacy and advertising requirements.

Use secure HTTPS endpoints.

---

## iOS CocoaPods

After installing `react-native-webview` or updating native package dependencies:

```bash
cd ios
pod install
cd ..
```

Open the workspace generated by CocoaPods when building through Xcode.

For a standard React Native project:

```text
ios/YourApplication.xcworkspace
```

---

## Expo Considerations

The SDK's client-side TypeScript logic can be compatible with React Native environments that provide the required networking and platform APIs.

However, support for managed Expo workflows depends on whether the package and optional native dependencies require custom native configuration.

Consider:

* Whether the package includes native modules
* Whether `react-native-webview` is available in the selected Expo SDK
* Whether a development build is required
* Whether Expo Go includes the required native dependency
* Whether configuration plugins are needed
* Whether the package supports the New Architecture used by the project

For Expo applications, verify the released package against the exact Expo SDK and build workflow.

---

## Production Integration

For a stable production integration:

1. Use a public publisher key assigned to the application.
2. Use a separate slot ID for each meaningful placement.
3. Use `<BannerAd>` for standard managed banners.
4. Use `AdxClient` only when custom behavior is needed.
5. Preserve `platformUserAgent()`.
6. Install `react-native-webview` only when required.
7. Restrict HTML creative navigation.
8. Do not expose native application bridges to ad JavaScript.
9. Report impressions only after the viewability threshold is met.
10. Prevent duplicate impression reports.
11. Collapse or remove no-fill placements.
12. Avoid immediate retry loops.
13. Handle offline and timeout behavior.
14. Verify Android and iOS independently.
15. Test real devices and simulators.
16. Test debug and release builds.
17. Test scrolling and navigation transitions.
18. Never embed server-side credentials.
19. Keep the package compatible with wire contract v1.
20. Follow applicable platform, privacy, and advertising policies.

---

## Recommended Placement Practices

Good advertisement placement should:

* Remain visually distinct from application controls
* Fit inside explicit layout bounds
* Avoid covering navigation
* Avoid creating accidental taps
* Remain usable with accessibility features
* Collapse after no-fill
* Remain viewable before reporting an impression
* Require intentional interaction
* Preserve the primary application experience
* Avoid interrupting essential workflows

Avoid:

* Hidden advertisements
* Invisible press targets
* One-pixel placements
* Ads under opaque views
* Automatic click opening
* Reporting off-screen impressions
* Ads directly beside high-frequency controls
* Reloading during every rerender
* Unrestricted WebView navigation
* Misleading creatives that imitate system UI
* Blocking access to content after no-fill

---

## Security Guidance

### Use only public publisher keys

React Native application bundles can be inspected.

Only embed a key intended for client-side publisher use:

```text
pk_your_publisher_key
```

Do not embed:

* Administrative API keys
* Database passwords
* Cloud-provider secrets
* Private signing keys
* Billing credentials
* Infrastructure tokens
* Server-side authentication secrets

---

## Environment Configuration

A React Native project can load environment-specific publisher configuration through its existing configuration system.

Conceptual example:

```ts
const publisherKey = configuration.theaimartPublisherKey;

if (!publisherKey) {
  throw new Error(
    'Theaimart ADX publisher key is missing',
  );
}
```

Do not treat a value embedded in the mobile bundle as a true secret.

Environment configuration helps separate:

* Development
* Staging
* Production
* Test publisher accounts
* Test slot IDs
* Production slot IDs

---

## Privacy Signals

When supported by the request type, forward accurate privacy signals:

```ts
const ad = await client.requestAd({
  slotId: 'privacy-aware-slot',
  usPrivacy: '1YNN',
  euconsentV2: consentString,
});
```

The application remains responsible for:

* Determining applicable legal requirements
* Collecting consent
* Respecting opt-out choices
* Forwarding accurate values
* Maintaining a privacy policy
* Configuring identity behavior
* Avoiding ad requests that conflict with user preferences

Do not fabricate consent strings.

---

## Identity Values

When supported by the request model, an identity value can be forwarded:

```ts
const ad = await client.requestAd({
  slotId: 'identity-enabled-slot',
  identityCookie: identityValue,
});
```

Treat identity values as untrusted data.

Applications should:

* Validate length and format
* Avoid unnecessary logging
* Respect privacy choices
* Store values securely
* Avoid exposing them to unrelated components
* Follow the wire contract
* Avoid treating identity values as authentication tokens

---

## Accessibility

A production banner should consider:

* Screen-reader labels
* Accessible press behavior
* Adequate touch target size
* Avoiding unexpected navigation
* Contrast and visibility
* Focus order
* Dynamic text and layout
* Reduced-motion preferences where applicable
* Clear distinction between ad and application content

The exact accessibility behavior depends on the managed component implementation and creative format.

Custom renderers should apply suitable React Native accessibility properties.

---

## Performance

To minimize performance impact:

* Reuse `AdxClient`
* Avoid requesting on every rerender
* Avoid duplicate banner instances
* Use bounded network timeouts
* Constrain image dimensions
* Avoid unnecessarily large creatives
* Clear viewability timers
* Stop measurement after reporting
* Avoid uncontrolled WebView creation
* Avoid mounting HTML renderers when not needed
* Test low-memory Android devices
* Test scrolling performance
* Test image caching behavior

Advertising should not materially block the primary application interface.

---

## Retry Behavior

Do not immediately retry every no-fill response.

Respect `retryAfterSeconds` when exposed:

```ts
if (
  !ad.filled &&
  ad.retryAfterSeconds
) {
  scheduleNextRequest(
    ad.retryAfterSeconds,
  );
}
```

Avoid:

* Recursive retries
* Multiple simultaneous requests
* Tight polling loops
* Reloading after every rerender
* Ignoring retry guidance
* Duplicate impressions
* Network usage while the screen is inactive

---

## Testing

The client and encoding logic can be tested outside a device environment.

Recommended scenarios:

| Scenario                      | Expected behavior                |
| ----------------------------- | -------------------------------- |
| Internal filled response      | Normalized as `internal`         |
| OpenRTB response              | Normalized as `openrtb`          |
| House response                | Normalized as `house`            |
| No-fill response              | `filled === false`               |
| Invalid JSON                  | Safe no-fill                     |
| HTTP 403                      | Safe no-fill                     |
| HTTP 500                      | Safe no-fill                     |
| Timeout                       | Safe no-fill                     |
| Trackable response            | Valid impression ID              |
| Missing impression ID         | Not trackable                    |
| SQL-like URL text             | Correctly encoded                |
| Android User-Agent            | Includes Android token           |
| iOS User-Agent                | Includes Apple token             |
| Image creative                | Rendered by managed component    |
| HTML creative without WebView | Safe failure                     |
| HTML creative with WebView    | Rendered through controlled flow |
| Less than 50% visible         | No impression                    |
| 50% visible for one second    | Impression reported once         |
| Component unmounts            | Timer and measurement stop       |
| Click URL unsupported         | Application remains stable       |
| No network                    | Application remains stable       |

---

## Component Testing

The `<BannerAd>` component requires a React Native runtime.

Test it through:

* Android emulator
* Android physical device
* iOS simulator
* iPhone physical device
* React Native testing utilities
* End-to-end tools used by the application
* Debug builds
* Release builds

Verify:

* Image rendering
* WebView rendering
* Scroll viewability
* Navigation transitions
* Orientation changes
* Application backgrounding
* Click handling
* No-fill collapse
* Slow network behavior
* Component disposal
* Duplicate request prevention

---

## Development

Enter the React Native package directory:

```bash
cd packages/react-native
```

Install development dependencies:

```bash
npm install
```

Run the unit-test suite:

```bash
npm test
```

Run TypeScript checking:

```bash
npm run typecheck
```

Build the package:

```bash
npm run build
```

Recommended verification:

```bash
npm test
npm run typecheck
npm run build
```

The build emits compiled package output into:

```text
dist/
```

The exact emitted files depend on the package configuration and can include:

* JavaScript
* TypeScript declarations
* Source maps
* Package metadata

---

## Off-Device Unit Tests

The client and encoding logic can be tested using Node.js without launching an Android emulator or iOS simulator.

The test suite can cover:

* Request construction
* User-Agent generation
* Free-text encoding
* Response normalization
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill behavior
* Timeout handling
* Transport behavior
* Viewability-beacon requests
* Click URL generation
* WAF regression cases

Run:

```bash
npm test
```

The managed `<BannerAd>` component still requires an actual React Native environment for complete validation.

---

## Local Mock Testing

A mock server or injected transport can reproduce:

* Filled image responses
* HTML creatives
* OpenRTB responses
* House advertisements
* No-fill
* HTTP 403
* HTTP 500
* Slow responses
* Invalid JSON
* Missing fields
* Viewability beacons
* Click URLs
* WAF-sensitive page URLs

Conceptual test:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test(
  'encodes WAF-sensitive page URLs',
  async () => {
    const client = new AdxClient({
      apiKey: 'pk_test',
      baseUrl: mockServerUrl,
      userAgent:
        'theaimart-adx-reactnative/1.0.0 (android)',
    });

    const ad = await client.requestAd({
      slotId: 'test-slot',
      pageUrl:
        'https://example.com/open-source?author=user@example.com',
    });

    assert.equal(ad.filled, true);
  },
);
```

Use the exact constructor, transport, and test APIs exposed by the package implementation.

---

## Frequently Asked Questions

### What is `@theaimart/adx-react-native`?

It is the official Theaimart ADX SDK for monetizing Android and iOS applications built with React Native.

### Does it support Android?

Yes.

### Does it support iOS?

Yes.

### Does it include a banner component?

Yes. Use `<BannerAd>` for managed advertisement loading, rendering, viewability, and click behavior.

### Does it support TypeScript?

Yes. The package ships TypeScript declarations.

### Which peer dependencies are required?

React and React Native.

### Is `react-native-webview` required?

Only when the application expects HTML or OpenRTB creatives.

Image-only integrations do not need it.

### How are image ads rendered?

Using React Native `Image` and `Pressable`.

### How are advertisement clicks opened?

Using React Native `Linking`.

### How are HTML ads rendered?

Through an optional sandboxed `react-native-webview` integration.

### Does the SDK track viewability automatically?

The managed `<BannerAd>` component reports a trackable impression after the advertisement remains at least 50% visible for at least one second.

### How is viewability measured?

The component uses React Native layout measurement such as `measureInWindow`.

### Do I need to call `reportViewable` manually?

Not when using the managed banner component.

When using `AdxClient` directly, your application must measure viewability and report the impression.

### Why is the User-Agent important on Android?

React Native Android networking commonly uses OkHttp. Its generic User-Agent can match the backend bot blocklist and produce silent no-fill responses.

### What User-Agent does the SDK send?

A value in the following family:

```text
theaimart-adx-reactnative/<version> (<platform>)
```

### Should I override the User-Agent?

Use `platformUserAgent()` unless a verified contract-compatible override is required.

### Why does the SDK encode free-text parameters?

Normal URLs can contain SQL-like words that trigger backend WAF rules. The SDK applies contract-compliant encoding to prevent false-positive rejections.

### Should I manually encode `pageUrl`?

Normally, no. Pass the original value and allow the SDK to perform the required encoding.

### What happens when the request fails?

The SDK fails closed and returns no-fill behavior or invokes the managed error callback.

### Does the SDK throw on every network error?

The normal production behavior is designed to fail closed. Verify optional strict-error settings against the installed client API.

### Does it support OpenRTB?

Yes. OpenRTB responses are normalized into the shared `Ad` model.

### What is a house advertisement?

A house advertisement is publisher- or platform-managed fallback inventory.

### Do house ads have impression IDs?

Not necessarily. Always check `ad.isTrackable` and `ad.impId`.

### Can I render an ad myself?

Yes. Use `AdxClient.requestAd` and implement your own creative renderer.

### Can I use the client without React components?

Yes. `AdxClient` is framework-agnostic.

### Can I use it with Redux or Zustand?

Yes. The direct client can be integrated into application state-management systems.

### Can I use it with Expo?

Compatibility depends on the exact package version, Expo SDK, build workflow, and optional native dependencies.

### Do I need to run `pod install`?

Run it after adding or updating iOS native dependencies such as `react-native-webview`.

### Can no-fill crash my application?

No-fill should be handled as a normal advertising outcome.

### How should I handle no-fill?

Hide or collapse the placement and preserve the application's primary user experience.

### Should I retry immediately after no-fill?

No. Respect retry guidance when provided and avoid uncontrolled loops.

### Can I embed a private backend key?

No. Use only a public publisher key intended for client-side distribution.

### Should I create a new `AdxClient` on every render?

No. Reuse a client where practical.

### Does the component work inside a `ScrollView`?

It can, but viewability and clipping should be tested carefully.

### What happens when the application enters the background?

A correct integration should stop treating the advertisement as viewable while the application is inactive.

### Can I use a custom WebView renderer?

Use the APIs exposed by the installed package version. Any custom renderer must maintain navigation restrictions, viewability, and click integrity.

---

## React Native App Monetization with Theaimart ADX

The Theaimart ADX React Native SDK is intended for developers building:

* Android React Native applications
* iOS React Native applications
* Cross-platform mobile applications
* AI applications
* Productivity applications
* Utility applications
* Content applications
* News applications
* Media applications
* Developer tools
* SaaS companion applications
* Social applications
* Marketplace applications
* Publisher applications
* Consumer applications
* Mobile dashboards
* Local-first mobile software

The package provides a consistent advertising API across Android and iOS while preserving native rendering, platform-aware networking, safe viewability tracking, and application control.

Learn more about Theaimart ADX:

https://adx.theaimart.co

---

## Wire Contract

The SDK implements version 1 of the Theaimart ADX wire contract:

```text
../../CONTRACT.md
```

Relevant contract areas include:

* Publisher authentication
* Advertisement request structure
* Slot identifiers
* Page context
* User-Agent behavior
* Device classification
* Free-text encoding
* Privacy signals
* Identity values
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill responses
* Creative representation
* Impression identifiers
* Viewability reporting
* Click tracking
* Retry guidance
* Error handling

The React Native SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response variants, creative formats, encoding behavior, viewability rules, or tracking semantics should be introduced through an explicit contract-version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
