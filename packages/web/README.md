# Theaimart ADX Web SDK

The official **Theaimart ADX JavaScript SDK for browsers**, websites, web applications, publisher platforms, blogs, and browser-based software.

`@theaimart/adx-web` provides two integration layers:

* **`TaimAds`** — an automatic banner-ad loader and renderer
* **`AdxWebClient`** — a framework-agnostic client for React, Vue, Svelte, Angular, and custom JavaScript applications

The SDK has **zero runtime dependencies** and implements version 1 of the [Theaimart ADX wire contract](../../CONTRACT.md).

```bash
npm install @theaimart/adx-web
```

> **Environment:** Modern web browsers
> **Package:** `@theaimart/adx-web`
> **Dependencies:** None
> **Module formats:** ESM, TypeScript declarations, and browser IIFE bundle
> **License:** Apache License 2.0

---

## Features

* Official Theaimart ADX browser SDK
* Website and web-app monetization
* Zero runtime dependencies
* Auto-rendering banner API
* Framework-agnostic JavaScript client
* TypeScript declarations
* npm installation
* CDN `<script>` installation
* Automatic image-ad rendering
* Sandboxed HTML and OpenRTB creatives
* Lazy advertisement loading
* Configurable banner refresh
* Automatic click wrapping
* Automatic viewability measurement
* 50% visibility for one-second threshold
* `IntersectionObserver`-based lifecycle handling
* Internal-demand support
* OpenRTB-demand support
* House-ad support
* Safe no-fill normalization
* CORS-preflight avoidance
* Browser identity-cookie support
* WAF-safe request encoding
* Keepalive-fetch viewability beacons, resent when the server asks
* Lazy loading by default
* Fail-closed production behavior
* Theaimart ADX wire contract v1 compatibility

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Web SDK?](#why-use-the-web-sdk)
* [Browser Support](#browser-support)
* [CORS and Publisher Origins](#cors-and-publisher-origins)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Automatic Banner Rendering](#automatic-banner-rendering)
* [CDN Script Integration](#cdn-script-integration)
* [Container Selection](#container-selection)
* [Lazy Loading](#lazy-loading)
* [Automatic Refresh](#automatic-refresh)
* [Viewability Tracking](#viewability-tracking)
* [Image Creative Rendering](#image-creative-rendering)
* [HTML and OpenRTB Creatives](#html-and-openrtb-creatives)
* [Framework-Agnostic Client](#framework-agnostic-client)
* [React Integration](#react-integration)
* [Vue Integration](#vue-integration)
* [Custom JavaScript Integration](#custom-javascript-integration)
* [Click Tracking](#click-tracking)
* [Browser Identity](#browser-identity)
* [Privacy Signals](#privacy-signals)
* [WAF-Safe Encoding](#waf-safe-encoding)
* [CORS-Preflight Avoidance](#cors-preflight-avoidance)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Response Parsing](#four-way-response-parsing)
* [API Reference](#api-reference)
* [Content Security Policy](#content-security-policy)
* [Security Guidance](#security-guidance)
* [Performance](#performance)
* [Single-Page Applications](#single-page-applications)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for publishers, developers, websites, applications, and digital products.

The Web SDK connects browser-based applications to the Theaimart advertising infrastructure.

It allows a website to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Receive an internal, OpenRTB, house, or no-fill response.
4. Render supported image or HTML creatives.
5. Delay loading until the placement approaches the viewport.
6. Measure advertisement viewability.
7. Report viewable impressions.
8. Route clicks through the registered tracking endpoint.
9. Preserve browser identity where permitted.
10. Handle network and rendering failures safely.

The package is designed for:

* Publisher websites
* Blogs and news sites
* SaaS products
* Web applications
* React applications
* Vue applications
* Svelte applications
* Angular applications
* Server-rendered websites with browser hydration
* Static websites
* Browser-based AI applications
* Custom JavaScript frontends

---

## Why use the Web SDK?

A production browser-advertising integration must handle more than a basic `fetch` request.

Common implementation risks include:

* CORS failures
* Unnecessary preflight requests
* WAF rejection of legitimate URLs
* Unsafe HTML creative insertion
* Duplicate impression reporting
* Ads loading far outside the viewport
* Aggressive refresh behavior
* Browser teardown before beacon delivery
* Missing identity cookies
* Multiple backend response formats
* Unhandled promise rejections
* Advertisement errors affecting the host page

`@theaimart/adx-web` provides standardized behavior for:

* Request construction
* Contract-compliant encoding
* Response normalization
* Lazy loading
* Creative rendering
* Sandboxed HTML execution
* Viewability tracking
* Click handling
* Refresh limits
* Identity-cookie transmission
* Safe tracking beacons
* No-fill and error isolation

---

## Browser Support

The SDK is intended for modern browsers that support the web APIs used by the selected integration mode.

Important browser capabilities include:

* `fetch`
* Promises
* `URL`
* `IntersectionObserver`
* `fetch` with `keepalive`
* `HTMLIFrameElement`
* ES modules for the ESM package

When targeting older browsers, include application-level compatibility tooling only where required by your supported-browser policy.

---

## CORS and Publisher Origins

### Current origin restriction

The Theaimart ADX backend currently permits cross-origin browser requests only from approved Theaimart origins such as:

```text
https://adx.theaimart.co
https://theaimart.co
```

A browser integration running on an arbitrary publisher domain can be blocked by CORS unless the backend or edge layer has been configured to allow that origin.

For example, this publisher domain requires explicit support:

```text
https://publisher-example.com
```

### Supporting arbitrary publisher domains

To support ads directly on external publisher websites, the deployment must use one of these approaches:

1. Add approved publisher origins to the backend CORS policy.
2. Dynamically reflect validated publisher origins.
3. Front `/api/v1/serve/*` with an origin-aware edge service.
4. Proxy the browser ad request through publisher-controlled server infrastructure. Note that the ad server then attributes every request to that server's IP — it ignores `X-Forwarded-For` values a client writes — so all visitors share one per-IP limit (60/min by default) and geo sees the server (CONTRACT.md §6).
5. Use a deployment-specific API endpoint whose CORS rules include the publisher domain.

The origin-reflecting implementation must validate origins against an approved publisher list. It must not blindly reflect every incoming `Origin` value.

### Native and server SDKs

This browser-origin restriction does not affect integrations that are not governed by browser CORS enforcement, including:

* Android SDK
* iOS SDK
* Flutter native applications
* React Native applications
* Unity applications
* Node.js SDK
* Python SDK
* Rust SDK
* Other server-to-server SDKs

See [CONTRACT.md §1, "Browser CORS"](../../CONTRACT.md) for the authoritative origin and CORS requirements, including the live status as last probed.

---

## Installation

### npm

```bash
npm install @theaimart/adx-web
```

### pnpm

```bash
pnpm add @theaimart/adx-web
```

### Yarn

```bash
yarn add @theaimart/adx-web
```

Import the package:

```ts
import {
  TaimAds,
  AdxWebClient,
  AdKind,
} from '@theaimart/adx-web';
```

---

## Quick Start

Create a container for the advertisement:

```html
<div id="taim-ad-homepage-banner"></div>
```

Initialize the SDK and create a banner:

```html
<script type="module">
  import { TaimAds } from '@theaimart/adx-web';

  TaimAds.init({
    apiKey: 'pk_your_publisher_key',
  });

  TaimAds.createBanner({
    slotId: '8b1f2c3d-0000-0000-0000-000000000000',
    container: 'taim-ad-homepage-banner',
    lazy: true,
    onLoad: (ad) => {
      console.log('Advertisement filled by', ad.source);
    },
    onError: (error) => {
      console.log('Advertisement unavailable', error.message);
    },
  });
</script>
```

Replace:

* `pk_your_publisher_key` with your public publisher key
* The example UUID with the slot ID configured in Theaimart ADX

Do not embed administrative or server-side credentials in browser code.

---

## Automatic Banner Rendering

`TaimAds` provides the highest-level browser integration.

```ts
import { TaimAds } from '@theaimart/adx-web';

TaimAds.init({
  apiKey: 'pk_your_publisher_key',
});

TaimAds.createBanner({
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
  lazy: true,
  refresh: 60,
  appearance: { borderRadius: 12, elevated: true, transitionMs: 180 },
  onLoad: (ad) => {
    console.log('Filled', ad.source);
  },
  onError: (error) => {
    console.log('No fill', error.message);
  },
});
```

The managed banner lifecycle includes:

* Finding the advertisement container
* Waiting for viewport proximity when lazy loading is enabled
* Sending the ad request
* Parsing the response
* Rendering supported image creatives
* Rendering HTML creatives in a sandboxed iframe
* Wrapping supported creatives with click behavior
* Measuring viewability
* Reporting a viewable impression
* Refreshing the placement when configured
* Handling no-fill and failures without affecting the page

---

## CDN Script Integration

The package also ships a browser-ready IIFE bundle.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@theaimart/adx-web/dist/taimads.global.js"
  data-api-key="pk_your_publisher_key"
></script>
```

The script automatically attaches:

```js
window.TaimAds
```

Example:

```html
<div id="taim-ad-8b1f2c3d"></div>

<script
  src="https://cdn.jsdelivr.net/npm/@theaimart/adx-web/dist/taimads.global.js"
  data-api-key="pk_your_publisher_key"
></script>

<script>
  window.TaimAds.createBanner({
    slotId: '8b1f2c3d',
    container: 'taim-ad-8b1f2c3d',
    lazy: true,
    refresh: 60,
    onLoad: function (ad) {
      console.log('Filled by', ad.source);
    },
    onError: function (error) {
      console.log('No fill', error.message);
    },
  });
</script>
```

### Pin the CDN version

For production websites, pin a specific package version:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@theaimart/adx-web@1.0.0/dist/taimads.global.js"
  data-api-key="pk_your_publisher_key"
></script>
```

Pinning prevents an unexpected future package release from changing production behavior without review.

---

## Container Selection

By default, `TaimAds.createBanner` derives the container ID from the slot ID:

```text
taim-ad-<slotId>
```

For a slot ID such as:

```text
8b1f2c3d
```

the default container is:

```html
<div id="taim-ad-8b1f2c3d"></div>
```

You can also provide an explicit container:

```ts
TaimAds.createBanner({
  slotId: 'homepage-banner-slot',
  container: 'homepage-ad',
});
```

```html
<div id="homepage-ad"></div>
```

Use a dedicated container for each placement.

Avoid rendering multiple independently managed banners into the same element.

---

## Lazy Loading

Banners are **lazy by default**: the request waits until the container is within 200px of the
viewport. A slot that is already on screen requests immediately, so above-the-fold ads are not
delayed.

This is the default because the ad server bills an advertiser when it *serves* an ad, not when
it is seen, and a site's whole audience shares one budget of 100 ad requests per minute. A slot
far down the page that requests on load spends both on an ad nobody may ever scroll to.

To request on load regardless of position:

```ts
TaimAds.createBanner({
  slotId: 'article-inline-banner',
  lazy: false,
});
```

Lazy loading can reduce:

* Unnecessary ad requests
* Off-screen creative downloads
* Initial page network activity
* Image bandwidth
* Browser rendering work
* Requests for users who never scroll to the placement

Lazy loading does not mean that the advertisement is immediately viewable after loading. The separate viewability threshold must still be satisfied.

---

## Automatic Refresh

Configure refresh in seconds:

```ts
TaimAds.createBanner({
  slotId: 'dashboard-banner',
  refresh: 60,
});
```

The SDK clamps refresh intervals to a minimum of 30 seconds.

Values below the minimum should not result in a refresh period shorter than:

```text
30 seconds
```

Example:

```ts
TaimAds.createBanner({
  slotId: 'dashboard-banner',
  refresh: 10,
});
```

This should be treated as a 30-second refresh interval by the managed implementation.

### Refresh recommendations

Only enable refresh for placements where it is appropriate.

Avoid:

* Refreshing hidden tabs
* Refreshing off-screen placements
* Refreshing after the container is removed
* Refreshing during page teardown
* Creating multiple overlapping timers
* Using refresh to bypass no-fill guidance
* Refreshing while a previous request is still active

Respect `retryAfterSeconds` or equivalent backend guidance when exposed.

---

## Viewability Tracking

A filled advertisement is not automatically considered viewable.

The managed banner reports an impression only after the creative is:

* At least 50% visible
* For at least one continuous second

The SDK can use `IntersectionObserver` and an eligibility timer to enforce this threshold.

Conceptual flow:

```text
Creative renders
      ↓
At least 50% enters the viewport
      ↓
One-second timer begins
      ↓
Visibility stays at or above 50%
      ↓
Viewability beacon fires once
```

If visibility falls below 50% before one second completes, the timer is cancelled.

### Managed viewability

```ts
TaimAds.createBanner({
  slotId: 'viewable-banner',
});
```

No manual `reportViewable` call is needed when the managed banner owns the viewability lifecycle.

### Manual viewability

When using `AdxWebClient` directly:

```ts
if (ad.filled && ad.isTrackable && ad.impId) {
  await client.reportViewable(ad.impId);
}
```

Call it only after your application has independently verified the viewability threshold.

---

## Image Creative Rendering

Image advertisements are rendered using standard browser elements.

The managed implementation follows a structure conceptually similar to:

```html
<a href="registered-click-url">
  <img
    src="creative-image-url"
    alt="Advertisement"
    loading="lazy"
  />
</a>
```

The SDK is responsible for:

* Resolving the creative asset
* Creating the image element
* Applying click tracking
* Handling image-load failure
* Measuring viewability
* Reporting the impression
* Preventing unsupported creative data from affecting the page

Custom integrations should preserve the creative aspect ratio and avoid layout shifts where possible.

### Example placement CSS

```css
.theaimart-ad-slot {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.theaimart-ad-slot img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
```

---

## HTML and OpenRTB Creatives

HTML and OpenRTB creatives are rendered inside a sandboxed iframe.

A sandboxed iframe isolates creative content from the publisher's main page.

Conceptual structure:

```html
<iframe
  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer-when-downgrade"
  title="Advertisement"
></iframe>
```

The exact sandbox policy is defined by the SDK implementation.

### Why iframe isolation matters

Directly inserting arbitrary creative HTML into the publisher DOM can expose the host page to:

* DOM mutation
* Global CSS collisions
* Script access to page state
* Navigation takeover
* Cookie access
* Event interception
* JavaScript namespace conflicts
* Untrusted form submission
* Application-state manipulation

A sandboxed iframe provides a stronger isolation boundary.

### Application responsibilities

Publishers should still review:

* Content Security Policy
* Allowed creative origins
* Frame dimensions
* Navigation behavior
* Pop-up policy
* Referrer policy
* Third-party resource permissions
* Applicable consent requirements

---

## Framework-Agnostic Client

Use `AdxWebClient` when the application needs complete control over rendering and component lifecycle.

```ts
import {
  AdxWebClient,
  AdKind,
} from '@theaimart/adx-web';

const client = new AdxWebClient({
  apiKey: 'pk_your_publisher_key',
});

const ad = await client.requestAd({
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
  pageUrl: window.location.href,
});

if (!ad.filled) {
  console.log('No fill', ad.reason);
} else if (ad.kind === AdKind.Image) {
  // Render an image creative.
} else if (ad.kind === AdKind.Html) {
  // Render inside a sandboxed iframe.
}
```

The direct client is suitable for:

* React components
* Vue components
* Svelte components
* Angular services
* Custom web components
* Design-system integrations
* State-management libraries
* Server-hydrated applications
* Custom viewability implementations
* Publisher-specific rendering systems

---

## React Integration

```tsx
import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AdKind,
  AdxWebClient,
  type Ad,
} from '@theaimart/adx-web';

const client = new AdxWebClient({
  apiKey: 'pk_your_publisher_key',
});

export function TheaimartBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const result = await client.requestAd({
        slotId: 'homepage-banner',
        pageUrl: window.location.href,
      });

      if (active) {
        setAd(result.filled ? result : null);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (!ad) {
    return null;
  }

  if (ad.kind === AdKind.Image) {
    return (
      <div ref={containerRef} className="theaimart-ad-slot">
        {/* Render the validated creative fields exposed by the SDK. */}
      </div>
    );
  }

  if (ad.kind === AdKind.Html) {
    return (
      <iframe
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        title="Advertisement"
      />
    );
  }

  return null;
}
```

The exact creative fields and enum values exported by the package remain authoritative.

A production React component must also:

* Measure viewability
* Avoid reporting twice
* Cancel timers on unmount
* Handle route changes
* Avoid stale async state updates
* Validate click destinations
* Collapse after no-fill

---

## Vue Integration

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  AdxWebClient,
  type Ad,
} from '@theaimart/adx-web';

const ad = ref<Ad | null>(null);

const client = new AdxWebClient({
  apiKey: 'pk_your_publisher_key',
});

let active = true;

onMounted(async () => {
  const result = await client.requestAd({
    slotId: 'article-banner',
    pageUrl: window.location.href,
  });

  if (active && result.filled) {
    ad.value = result;
  }
});

onBeforeUnmount(() => {
  active = false;
});
</script>

<template>
  <div
    v-if="ad"
    class="theaimart-ad-slot"
  >
    <!-- Render validated creative content here. -->
  </div>
</template>
```

Use a sandboxed iframe for HTML creatives and implement viewability before calling `reportViewable`.

---

## Custom JavaScript Integration

```ts
import {
  AdKind,
  AdxWebClient,
} from '@theaimart/adx-web';

const client = new AdxWebClient({
  apiKey: 'pk_your_publisher_key',
});

async function loadAd() {
  const container =
    document.querySelector<HTMLElement>('#custom-ad');

  if (!container) {
    return;
  }

  const ad = await client.requestAd({
    slotId: 'custom-banner',
    pageUrl: location.href,
    pageKeywords: 'technology,javascript,web',
  });

  if (!ad.filled) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }

  container.hidden = false;

  if (ad.kind === AdKind.Image) {
    // Build an image and click wrapper using validated creative fields.
  }

  if (ad.kind === AdKind.Html) {
    // Render the HTML creative inside a sandboxed iframe.
  }
}

void loadAd();
```

Do not insert untrusted HTML directly into the host document using unrestricted `innerHTML`.

---

## Click Tracking

Managed banners wrap supported creatives with the registered click path automatically.

A custom renderer should use the click URL associated with the impression rather than linking directly to an unrelated destination.

Safe click handling should:

* Require an intentional user action
* Allow only HTTP and HTTPS URLs
* Avoid automatic navigation
* Prevent duplicate navigation
* Avoid invisible click layers
* Preserve the registered impression relationship
* Use appropriate `rel` attributes for new-window links

Example:

```html
<a
  href="https://registered-click-url.example"
  target="_blank"
  rel="noopener noreferrer sponsored"
>
  <img src="https://creative.example/banner.png" alt="Advertisement" />
</a>
```

Use the exact click helper exposed by the installed package when rendering manually.

---

## Browser Identity

Browser requests use:

```ts
credentials: 'include'
```

This allows the browser to send and receive the Theaimart ADX identity cookie where permitted.

The identity cookie is referred to by the wire contract as:

```text
_an_id
```

Identity continuity can support:

* Frequency handling
* Repeated-impression recognition
* Reporting continuity
* Fraud analysis
* Campaign eligibility

Cookie behavior remains subject to:

* Browser third-party-cookie policy
* `SameSite` attributes
* `Secure` attributes
* User privacy settings
* Tracking prevention
* Consent state
* Publisher and ADX origin relationships

Applications should not assume that browser identity cookies are always available.

---

## Privacy Signals

Where supported by the request type, pass accurate privacy values:

```ts
const ad = await client.requestAd({
  slotId: 'privacy-aware-banner',
  pageUrl: window.location.href,
  usPrivacy: '1YNN',
  euconsentV2: consentString,
});
```

The publisher remains responsible for:

* Determining applicable privacy requirements
* Collecting valid consent
* Respecting opt-out choices
* Forwarding accurate privacy signals
* Avoiding ad requests that violate user preferences
* Maintaining an appropriate privacy policy
* Configuring identity behavior correctly

Do not fabricate consent values.

---

## WAF-Safe Encoding

Real page URLs, keywords, and consent values can contain strings that resemble SQL keywords or security-sensitive text.

Examples include:

```text
end
open
cast
select
@
```

These sequences can occur naturally in:

* Page paths
* Query parameters
* Email-like values
* Article slugs
* Search terms
* Campaign parameters
* Consent strings
* Publisher keywords

A strict Web Application Firewall may reject raw query values containing these strings.

The SDK applies contract-defined byte-percent encoding to free-text parameters before transmission.

Example input:

```text
https://example.com/open-source/frontend?author=user@example.com
```

The SDK encodes the free-text value according to [CONTRACT.md section 7](../../CONTRACT.md).

This behavior:

* Preserves legitimate URLs
* Avoids WAF false positives
* Prevents normal page URLs from producing HTTP 403 responses
* Produces deterministic request values
* Prevents malformed query construction
* Keeps backend filtering compatible with real publisher traffic

Do not manually pre-encode values unless the wire contract explicitly requires it.

Double encoding can change the original value.

---

## CORS-Preflight Avoidance

The SDK uses a header-less simple GET request for browser ad decisions.

Conceptually:

```ts
fetch(url, {
  method: 'GET',
  credentials: 'include',
});
```

The request intentionally avoids custom headers that would force the browser to send an `OPTIONS` preflight.

This improves:

* Request latency
* CDN compatibility
* Browser simplicity
* Failure isolation
* Identity-cookie behavior
* Publisher integration reliability

The public publisher key and request context are transmitted according to the wire contract rather than through a custom authentication header.

A simple request still requires the response's CORS policy to permit the publisher origin.

Avoid adding custom headers to the ad-serving request unless the backend and CORS policy explicitly support them.

---

## Error and No-Fill Handling

The SDK follows a fail-closed policy.

Operational failures become no-fill behavior rather than uncaught errors escaping into the publisher page.

Possible failure conditions include:

* CORS rejection
* DNS failure
* Offline browser
* Request timeout
* HTTP 403
* HTTP 500
* Invalid JSON
* Missing fields
* Unsupported response variant
* Invalid creative
* Image-load failure
* Iframe-rendering failure
* Viewability-beacon failure
* Removed container
* Page teardown

Managed example:

```ts
TaimAds.createBanner({
  slotId: 'safe-banner',
  onError: (error) => {
    console.debug('Ad unavailable', error.message);
  },
});
```

Direct-client example:

```ts
const ad = await client.requestAd({
  slotId: 'safe-banner',
});

if (!ad.filled) {
  console.debug('No fill', ad.reason);
}
```

Advertising failures should not:

* Break page rendering
* Produce unhandled promise rejections
* Block access to content
* Crash a frontend framework component
* Trigger infinite retries
* Leave a disruptive empty placement

---

## Ad Response Model

`AdxWebClient.requestAd` returns a normalized `Ad`.

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

The exact TypeScript declarations shipped by the package are authoritative.

### Fields

| Field               | Description                                    |
| ------------------- | ---------------------------------------------- |
| `filled`            | Whether an eligible advertisement was returned |
| `kind`              | Normalized creative kind                       |
| `source`            | Normalized demand source                       |
| `impId`             | Impression identifier                          |
| `identityId`        | Backend identity value                         |
| `creative`          | Creative payload                               |
| `auction`           | Auction-related metadata                       |
| `reason`            | No-fill or failure reason                      |
| `retryAfterSeconds` | Suggested retry delay                          |
| `isTrackable`       | Whether viewability can be reported            |
| `raw`               | Original response data                         |

### Filled advertisement

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

---

## Demand Sources

The package normalizes backend demand into:

* `internal`
* `openrtb`
* `house`

No-fill is represented by:

```ts
ad.filled === false
```

### Internal

An advertisement supplied through demand managed directly within Theaimart ADX.

### OpenRTB

An advertisement supplied through an OpenRTB-compatible auction or demand integration.

### House

A publisher- or platform-managed fallback advertisement.

House advertisements may not contain a trackable impression ID.

Always verify:

```ts
ad.isTrackable && ad.impId
```

before reporting viewability.

---

## Four-Way Response Parsing

The backend can return four logical outcomes:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The SDK normalizes these variants into one `Ad` model.

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

Malformed or incomplete payloads fail closed.

The SDK does not expose unsupported responses as valid filled advertisements.

---

## API Reference

### `TaimAds.init(options)`

Initializes the managed browser API.

```ts
TaimAds.init({
  apiKey: 'pk_your_publisher_key',
});
```

Depending on the package implementation, initialization can also expose:

* API base URL
* Default request timeout
* Debug behavior
* Global callbacks
* Test settings

Use production defaults unless a controlled environment requires an override.

---

### `TaimAds.createBanner(options)`

Creates and manages a banner placement.

```ts
TaimAds.createBanner({
  slotId: 'your-slot-id',
  container: 'publisher-ad',
  lazy: true,
  refresh: 60,
  onLoad: (ad) => {},
  onError: (error) => {},
});
```

Common options include:

| Option      | Description                                         |
| ----------- | --------------------------------------------------- |
| `slotId`    | Configured advertisement slot                       |
| `container` | `HTMLElement` or an element ID string used for rendering |
| `lazy`      | Wait until near the viewport (default `true`)       |
| `refresh`   | Refresh interval in seconds, clamped to at least 30 |
| `appearance` | Visual-only radius, surface, elevation, and transition options |
| `onLoad`    | Called after a filled advertisement renders         |
| `onError`   | Called after no-fill or managed failure             |

Use the package's exported types as the final source of truth.

---

### `new AdxWebClient(options)`

Creates a framework-agnostic client.

```ts
const client = new AdxWebClient({
  apiKey: 'pk_your_publisher_key',
});
```

Supported options are:

* `apiKey`
* `baseUrl`
* `fetchImpl`
* `timeoutMs` — abort an ad decision that has not answered after this long (default `10000`).
  Browsers give `fetch` no timeout of their own, so without one a hung request would hold the
  slot's refresh loop for minutes.

`fetchImpl` is useful for tests or non-standard browser-like environments.

### Video (VAST)

```ts
import { AdxWebClient, playVastAd } from '@theaimart/adx-web';

const client = new AdxWebClient({ apiKey: 'pk_your_publisher_key' });
const tag = client.vastTagUrl('your-video-slot-uuid'); // null if the id is not a UUID
const video = document.querySelector('video')!;
const ad = tag ? await playVastAd(video, tag, { signal: controller.signal }) : null;
```

The impression beacon fires once, on first play, and the clickthrough opens only after it — the
click tracker resolves against the impression that beacon records. Media, impression and click
URLs are kept only when they are `http`/`https`; aborting `signal` removes every listener
`playVastAd` added.

---

### `requestAd(request)`

Requests an advertisement:

```ts
const ad = await client.requestAd({
  slotId: 'your-slot-id',
  pageUrl: window.location.href,
});
```

Contract-supported fields can include:

```ts
const ad = await client.requestAd({
  slotId: 'your-slot-id',
  slotName: 'homepage-banner',
  pageUrl: window.location.href,
  pageKeywords: 'technology,web,javascript',
  usPrivacy: '1YNN',
  euconsentV2: consentString,
});
```

The browser SDK automatically uses browser-origin context according to the wire contract.

---

### `reportViewable(impId)`

Reports a viewable impression:

```ts
const success = await client.reportViewable(
  impressionId,
);
```

Resolves `true` only when the server recorded the view. `reportViewableOutcome(impId)` returns
`'recorded'`, `'retry'` or `'drop'`; on `'retry'` the view was not counted and resending the same
id is safe. The managed banner does that resending for you.

Only call this after the advertisement satisfies the required viewability policy.

---

### `AdKind`

The package exposes a normalized ad-kind enum or equivalent typed values.

Conceptual values include:

```ts
AdKind.Image
AdKind.Html
AdKind.NoFill
```

Use the exact enum capitalization exported by the package.

---

## Beacon Delivery

Viewability beacons are sent with a `keepalive` `fetch`, which survives navigation, tab closure,
reload and route transitions just like `navigator.sendBeacon` — but, unlike `sendBeacon`, its
response can be read.

That matters. The ad server writes impressions through an async buffer, so a beacon can arrive
before the impression exists. The server then answers
`{"success": false, "reason": "impression_not_recorded_yet", "retry": true}` and has **not**
counted the view. `sendBeacon` only reports "queued", so every such view used to be lost.

The managed banner resends such a beacon after 1 s, 2 s and 4 s, then gives up. Only internal
impressions are resent: an OpenRTB win is recorded elsewhere by the ad server, so its beacon is
sent once. A resend is not cancelled by a refresh or by `destroy()` — it is the same, already
measured view arriving late.

Beacon delivery remains best effort. A failed tracking request should not affect the rendered advertisement or host page.

---

## Content Security Policy

A publisher Content Security Policy can affect image, iframe, and network behavior.

Relevant directives can include:

```text
connect-src
img-src
frame-src
script-src
style-src
default-src
```

A deployment may need to allow:

* Theaimart ADX API origins
* Approved image-creative origins
* Approved iframe or OpenRTB origins
* The CDN origin used for the global SDK bundle

Example structure:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net;
  connect-src 'self' https://adx.theaimart.co;
  img-src 'self' https: data:;
  frame-src https:;
  object-src 'none';
  base-uri 'self';
```

This is only an illustrative structure.

Use the narrowest set of approved origins appropriate for your creative sources and deployment.

Do not broadly disable CSP protections solely to make advertisements render.

---

## Security Guidance

### Public publisher keys

The browser package necessarily exposes the publisher key to users.

Only use a key intended for public publisher integration:

```text
pk_your_publisher_key
```

Never place the following in frontend JavaScript:

* Administrative API keys
* Cloud access credentials
* Database passwords
* Private signing keys
* Billing credentials
* Infrastructure tokens
* Internal service secrets

### HTML creative isolation

Render HTML creatives only inside the SDK's sandboxed iframe or an equivalently restricted implementation.

Do not directly execute arbitrary creative HTML in the publisher page.

### Click URL validation

Only permit HTTP and HTTPS click destinations.

Reject schemes such as:

```text
javascript:
file:
data:
intent:
vbscript:
```

### Origin validation

An origin-reflecting CORS edge must validate the publisher origin against approved configuration.

Never use unrestricted reflection with credentials.

### Raw response data

Do not render `ad.raw` directly.

Use the normalized and validated creative fields provided by the SDK.

---

## Performance

Recommended production practices:

* Enable lazy loading for below-the-fold placements.
* Avoid creating multiple banners for the same container.
* Use bounded refresh intervals.
* Stop refresh when the placement is removed.
* Stop refresh when the document is hidden where appropriate.
* Avoid loading large creatives without size constraints.
* Reserve placement dimensions to reduce layout shift.
* Remove observers after impression reporting.
* Avoid repeated DOM measurement loops.
* Use the framework-agnostic client only when custom rendering is required.
* Prefer the managed renderer for standard placements.

### Reducing layout shift

Reserve approximate banner dimensions before the creative loads:

```css
.publisher-ad-slot {
  width: 100%;
  min-height: 90px;
  display: grid;
  place-items: center;
}
```

After no-fill, collapse the placement where appropriate:

```css
.publisher-ad-slot:empty {
  display: none;
  min-height: 0;
}
```

---

## Single-Page Applications

React, Vue, Svelte, Angular, and other single-page applications can change routes without performing a full browser navigation.

A production integration should account for:

* Route changes
* Updated `pageUrl`
* Component unmounting
* Removed containers
* Stale refresh timers
* Old viewability observers
* Duplicate impressions
* Advertisements from a previous route

When a route changes:

1. Dispose or remove the old placement.
2. Stop its refresh timer.
3. Disconnect its observer.
4. Create a new request with the updated page URL.
5. Avoid carrying old impression IDs into the new route.

Use the lifecycle APIs exposed by the package where available.

---

## No-Fill Handling

No-fill is a normal advertising outcome.

It can occur because of:

* No eligible campaign
* Geographic targeting
* Browser targeting
* Privacy state
* Frequency limits
* Fraud-risk classification
* Demand shortage
* Auction timeout
* Unsupported publisher origin
* CORS configuration
* Slot configuration
* Backend retry policy

Recommended behavior:

* Remove or collapse the container
* Continue showing the primary content
* Log diagnostic information only where appropriate
* Respect retry guidance
* Avoid immediate repeated requests

Do not:

* Block access to page content
* Display a fatal error
* Leave a large empty region
* Refresh continuously
* Report an impression
* Open a click destination

---

## Testing

The request, encoding, parsing, and beacon core can be unit-tested in Node.js.

Recommended cases include:

| Scenario                   | Expected behavior                         |
| -------------------------- | ----------------------------------------- |
| Internal response          | Normalized as `internal`                  |
| OpenRTB response           | Normalized as `openrtb`                   |
| House response             | Normalized as `house`                     |
| No-fill response           | `filled === false`                        |
| Invalid JSON               | Safe no-fill                              |
| HTTP 403                   | Safe no-fill                              |
| HTTP 500                   | Safe no-fill                              |
| CORS-like fetch failure    | Safe no-fill                              |
| Timeout                    | Safe no-fill                              |
| Missing impression ID      | Not trackable                             |
| WAF-sensitive page URL     | Correctly encoded                         |
| Identity credentials       | Request uses `credentials: 'include'`     |
| Custom request header      | Not added by default                      |
| Viewability beacon         | Keepalive fetch; response is read         |
| Server answers `retry`     | Resent after 1 s, 2 s, 4 s (internal only) |
| Image response             | Managed renderer creates image            |
| HTML response              | Managed renderer creates sandboxed iframe |
| Less than 50% visible      | No impression                             |
| 50% visible for one second | Impression reports once                   |
| Container removed          | Observer and refresh stop                 |
| Refresh below 30 seconds   | Clamped to minimum                        |

---

## Browser Integration Testing

The DOM renderer requires a browser-like environment or real browser.

Verify:

* Container discovery
* Image rendering
* Sandboxed iframe rendering
* Click behavior
* Lazy loading
* Viewability
* Refresh
* Route transitions
* Page visibility changes
* CORS behavior
* Identity cookies
* CSP behavior
* Mobile browser layouts
* Desktop browser layouts
* Browser teardown beacons

Test on representative browsers used by your publishers.

---

## Development

Enter the web package directory:

```bash
cd packages/web
```

Install development dependencies:

```bash
npm install
```

Run unit tests:

```bash
npm test
```

Run TypeScript checking:

```bash
npm run typecheck
```

Build ESM output and declarations:

```bash
npm run build
```

Build the browser CDN bundle:

```bash
npm run build:cdn
```

Recommended verification:

```bash
npm test
npm run typecheck
npm run build
npm run build:cdn
```

The primary build emits ESM JavaScript and TypeScript declarations into:

```text
dist/
```

The CDN build emits:

```text
dist/taimads.global.js
```

The global bundle is an IIFE intended for direct browser `<script>` usage.

---

## Architecture

The package separates the browser API into two primary layers.

### Core client

Responsible for:

* Request construction
* WAF-safe encoding
* Fetch execution
* Four-way response parsing
* No-fill normalization
* Viewability beacons
* Click URL generation
* Identity-cookie behavior

### DOM auto-render layer

Responsible for:

* Container discovery
* Lazy loading
* Creative rendering
* Sandboxed iframes
* Viewability observation
* Refresh timers
* Click wrapping
* Browser lifecycle cleanup

The DOM layer is implemented in the browser-specific source, while the request and parsing core remains unit-testable outside a full browser environment.

---

## Frequently Asked Questions

### What is `@theaimart/adx-web`?

It is the official browser JavaScript SDK for integrating Theaimart ADX advertisements into websites and web applications.

### Does the package have runtime dependencies?

No.

### Does it support TypeScript?

Yes. The package ships TypeScript declarations.

### Can I install it from npm?

Yes:

```bash
npm install @theaimart/adx-web
```

### Can I use it through a script tag?

Yes. Load `dist/taimads.global.js`, which attaches `window.TaimAds`.

### What is `TaimAds`?

`TaimAds` is the managed banner API that automatically requests, renders, tracks, and optionally refreshes advertisements.

### What is `AdxWebClient`?

`AdxWebClient` is the lower-level framework-agnostic client for custom integrations.

### Can I use it with React?

Yes. Use `AdxWebClient` inside a component or hook, or mount the managed banner into a dedicated container.

### Can I use it with Vue?

Yes.

### Can I use it with Svelte or Angular?

Yes. The client is not tied to a specific frontend framework.

### Does it support image advertisements?

Yes.

### Does it support HTML and OpenRTB creatives?

Yes. Managed HTML/OpenRTB creatives are rendered in a sandboxed iframe.

### Does the SDK track viewability automatically?

The managed banner reports an impression after at least 50% of the advertisement remains visible for at least one second.

### Does lazy loading count as viewability?

No. Lazy loading only delays the request until the placement approaches the viewport.

### Can I refresh banners automatically?

Yes. Use the `refresh` option.

### What is the minimum refresh interval?

The managed SDK clamps refresh intervals to at least 30 seconds.

### Does the browser SDK work on every publisher domain?

Not automatically under the current backend CORS policy.

The publisher origin must be approved, reflected by a validated edge layer, or supported through a proxy architecture.

### Why do native SDKs not have the same CORS issue?

CORS is enforced by web browsers. Native and server applications are not subject to browser-origin enforcement.

### Why does the SDK avoid custom request headers?

Custom headers can force a CORS preflight request. The SDK uses a header-less simple GET according to the wire contract.

### Does it send cookies?

The request uses `credentials: 'include'`, allowing the `_an_id` identity cookie to flow when browser policy permits it.

### Why does the SDK encode page URLs?

Legitimate URLs can contain SQL-like text that triggers backend WAF rules. The SDK applies contract-compliant encoding to prevent false-positive rejection.

### Should I manually encode `pageUrl`?

Normally, no. Pass the original value and let the SDK apply the required encoding.

### What happens after a fetch or parsing error?

The SDK fails closed and produces no-fill behavior instead of throwing into the publisher page.

### Does `requestAd` ever reject?

The documented production behavior is fail-closed. Verify optional strict-error behavior against the released package API.

### How are viewability beacons sent?

With a `keepalive` `fetch`. It survives page teardown like `navigator.sendBeacon`, and its response
can be read — which is how the SDK knows to resend a beacon the server was not yet ready for.

### Why not `sendBeacon`?

`sendBeacon` cannot report the server's answer, and the server sometimes answers "not counted yet,
send again". See [Beacon Delivery](#beacon-delivery).

### Does the SDK support house advertisements?

Yes.

### Are house advertisements always trackable?

No. Check `ad.isTrackable` and `ad.impId`.

### Can I render the creative myself?

Yes. Use `AdxWebClient`.

### Should I use `innerHTML` for an HTML ad?

No. Use a sandboxed iframe.

### Is the publisher key secret?

No. A browser-visible publisher key must be intended for public client-side use.

### Can I put an administrative key in the browser?

No.

### How should I handle no-fill?

Collapse the placement or render nothing while preserving the primary page experience.

### Should I retry immediately after no-fill?

No. Avoid tight retry loops and respect backend retry guidance.

### Does the package work in Node.js?

This package is intended for browsers. Use `@theaimart/adx` for Node.js server-side integrations.

### Does it work with server-side rendering?

The client and DOM APIs require browser capabilities. Initialize browser behavior after the application reaches the client environment.

### How should I handle route changes?

Dispose the old placement, stop observers and timers, and create a new request with the updated page URL.

---

## Website Monetization with Theaimart ADX

The Theaimart ADX Web SDK is intended for developers and publishers building:

* Blogs
* News websites
* Content platforms
* React applications
* Vue applications
* Svelte applications
* Angular applications
* SaaS products
* AI web applications
* Developer tools
* Browser-based utilities
* Web dashboards
* Online communities
* Publisher portals
* Static websites
* Server-rendered websites
* Progressive web applications
* Custom JavaScript frontends

The package provides a dependency-free browser integration while preserving CORS-aware networking, WAF-safe request encoding, sandboxed creative rendering, automatic viewability tracking, and safe failure behavior.

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
* Browser CORS requirements
* Advertisement request structure
* Slot identifiers
* Page context
* Free-text encoding
* Browser identity
* Privacy signals
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

The Web SDK and backend must remain compatible with the same contract version.

Breaking changes to CORS rules, request parameters, response variants, identity behavior, creative formats, viewability rules, or tracking semantics should be introduced through an explicit wire-contract version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
