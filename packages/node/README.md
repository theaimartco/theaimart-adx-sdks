# Theaimart ADX Node.js SDK

The official **Theaimart ADX SDK for Node.js**, built for server-side advertising, website monetization, server-side rendering, backend applications, and JavaScript or TypeScript services.

`@theaimart/adx` allows Node.js applications to request, normalize, render, and track advertisements through the [Theaimart Ad Network](https://adx.theaimart.co).

The SDK is:

* TypeScript-first
* Fully typed
* Zero-runtime-dependency
* Built on the native Node.js `fetch` API
* Compatible with Node.js 18 and later
* Optimized for server-side ad requests
* Designed to forward real end-user context
* Compatible with Theaimart ADX wire contract v1
* Fail-closed by default

```bash
npm install @theaimart/adx
```

> **Minimum Node.js version:** Node.js 18
> **Recommended Node.js version:** Node.js 20 or later
> **Runtime dependencies:** None
> **Language:** TypeScript and JavaScript
> **License:** Apache License 2.0

---

## Features

* Official Theaimart ADX Node.js SDK
* Server-side website monetization
* TypeScript-first API
* Bundled TypeScript declarations
* Zero runtime dependencies
* Native global `fetch`
* Express integration
* Fastify integration
* Next.js server integration
* Server-side rendering support
* Internal demand support
* OpenRTB demand support
* House-ad support
* Unified no-fill handling
* End-user IP forwarding
* End-user User-Agent forwarding
* Privacy-signal support
* Identity-cookie forwarding
* SQL-filter-safe parameter encoding
* Fraud-aware request construction
* Configurable request timeouts
* Injectable transport layer
* Mockable network behavior
* HTML rendering helper
* Viewability reporting
* Click URL generation
* Fail-closed production behavior
* Optional exception mode with `raiseOnError`
* Compatibility with Theaimart ADX wire contract v1

---

## Before you ship: what the ad server actually does

These are properties of the live ad server (`theaimart-adnetwork`), verified against its source —
see `CONTRACT.md` §3, §5, §6 and §8 for the detail.

1. **Every request is attributed to your server's IP.**
   `clientIp` is sent as `X-Forwarded-For`, but the ad server deliberately reads only the entry its
   own proxy appends, so any value a client writes is ignored (it is what stops IP spoofing past the
   rate limits).
   So all of your users share one per-IP limit (60 ad requests/minute by default — then `429`),
   geo targeting sees your server's location, and a cloud IP adds to the fraud score. Server-side
   serving suits low-volume pages (server-rendered HTML, emails, previews). For user-facing traffic
   at scale, render on the user's device with the Web or mobile SDK.
2. **Forward the user's User-Agent** (`userAgent`). It still drives device targeting and the bot filter.
3. **A site's `api_key` has 100 ad requests per minute in total**, across all of its users.
4. **An internal fill is billed when it is served**, not when it is seen. Request an ad only when
   you will show it.
5. **Report a view only after it was measured** (≥50% on screen for ≥1 s, e.g. by your frontend).
   Calling `reportViewable(impId)` just because the HTML was sent reports a view nobody saw.
   It returns true only when the server recorded the view. A beacon that arrives before the
   impression is written is answered "not yet" — `reportViewableOutcome(impId)` returns `'retry'` for that, and
   resending the same id a second or two later is safe (the rendering SDKs do this automatically).
6. **Privacy signals:** pass `us_privacy` / `euconsent_v2`, and `gpp` / `gppSid` (IAB GPP). A US section
   in the GPP section ids (7–12) makes the request contextual-only.

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Node.js SDK?](#why-use-the-nodejs-sdk)
* [Requirements](#requirements)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Critical End-User Context](#critical-end-user-context)
* [Express Integration](#express-integration)
* [Fastify Integration](#fastify-integration)
* [Next.js Integration](#nextjs-integration)
* [Direct Client Usage](#direct-client-usage)
* [Rendering Advertisements](#rendering-advertisements)
* [Viewability Tracking](#viewability-tracking)
* [Click Tracking](#click-tracking)
* [Ad Requests](#ad-requests)
* [Privacy Signals](#privacy-signals)
* [Identity Cookies](#identity-cookies)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Union Parsing](#four-way-union-parsing)
* [Fail-Closed Error Handling](#fail-closed-error-handling)
* [User-Agent and Fraud Classification](#user-agent-and-fraud-classification)
* [SQL-Filter-Safe Encoding](#sql-filter-safe-encoding)
* [Transport Injection](#transport-injection)
* [API Reference](#api-reference)
* [Production Architecture](#production-architecture)
* [Security Guidance](#security-guidance)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for publishers, developers, websites, software companies, and digital products.

The Node.js SDK connects a server-side JavaScript or TypeScript application to the Theaimart ADX advertising infrastructure.

It allows a backend service to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Forward the real end user's network and browser context.
4. Receive an internal, OpenRTB, house, or no-fill response.
5. Normalize the backend response into one typed `Ad` object.
6. Render a supported creative as HTML.
7. Report viewable impressions.
8. Generate registered click-tracking URLs.
9. Handle failures without crashing the application.
10. Monetize eligible website or application traffic.

The package is designed for Node.js applications that need server-side control over advertising requests and rendering.

---

## Why use the Node.js SDK?

Server-side ad integration introduces challenges that do not exist in browser-only SDKs.

When every request originates from the same backend server, the advertising platform may see:

* The same server IP address
* The same Node.js User-Agent
* No browser identity
* No page context
* No privacy signals
* No real end-user device information

Without forwarding the real user context, unrelated impressions can appear to come from one automated server.

This can lead to:

* Fraud-risk classification
* Reduced fill rates
* Incorrect device classification
* Incorrect geo classification
* Silent no-fill responses
* Inaccurate reporting
* Lower-quality auction decisions

`@theaimart/adx` is designed to solve these issues by supporting explicit forwarding of:

* End-user User-Agent
* End-user IP address
* Page URL
* Page keywords
* Privacy strings
* Identity cookies

It also protects valid URLs and text parameters from backend Web Application Firewall rules through contract-compliant encoding.

---

## Requirements

The SDK requires:

* Node.js 18 or later
* Native global `fetch`
* A public Theaimart ADX publisher API key
* A configured slot ID or slot name
* Network access to the Theaimart ADX API

Node.js 20 or later is recommended for current production applications.

Check your Node.js version:

```bash
node --version
```

Expected output:

```text
v18.0.0
```

or later.

---

## Installation

Install the package using npm:

```bash
npm install @theaimart/adx
```

Using pnpm:

```bash
pnpm add @theaimart/adx
```

Using Yarn:

```bash
yarn add @theaimart/adx
```

Import the SDK:

```ts
import { Adx } from '@theaimart/adx';
```

For CommonJS projects, use the import style supported by the package's published module configuration and your Node.js environment.

---

## Quick Start

Create a reusable `Adx` client:

```ts
import { Adx } from '@theaimart/adx';

const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
});
```

Request an advertisement:

```ts
const ad = await adx.requestAd({
  slotId: '8b1f2c3d-0000-0000-0000-000000000000',
  pageUrl: 'https://example.com/articles/node-advertising',
});

if (!ad.filled) {
  console.log(`No fill: ${ad.reason}`);
} else {
  console.log(`Filled by ${ad.source}`);
}
```

Render the advertisement as HTML:

```ts
if (ad.filled) {
  const html = Adx.renderHtml(ad);
  console.log(html);
}
```

Generate a click URL:

```ts
if (ad.isTrackable && ad.impId) {
  const clickUrl = adx.clickUrl(ad.impId);
  console.log(clickUrl);
}
```

---

## Critical End-User Context

When requesting ads from a Node.js backend, forward the real end user's context.

Do not send only the backend server's IP address and User-Agent.

Incorrect integration:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
});
```

This may cause every impression to appear as though it came from the same server.

Recommended integration:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  pageUrl: 'https://example.com/current-page',
  userAgent: request.headers['user-agent'],
  clientIp: request.ip,
});
```

Forwarding end-user context helps the backend classify:

* Device family
* Browser
* Operating system
* Network source
* Geographic context
* Fraud-risk signals
* Repeated impressions
* Auction eligibility

### Never blindly trust proxy headers

When deriving `clientIp`, use a proxy configuration appropriate for your deployment.

For example, an application running behind Cloudflare, Nginx, AWS, or another reverse proxy should only trust forwarding headers from known infrastructure.

Do not accept arbitrary `X-Forwarded-For` values from untrusted clients without validating your proxy chain.

---

## Express Integration

Example Express route:

```ts
import express from 'express';
import { Adx } from '@theaimart/adx';

const app = express();

app.set('trust proxy', true);

const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
});

app.get('/ad', async (req, res) => {
  const ad = await adx.requestAd({
    slotId: '8b1f2c3d-0000-0000-0000-000000000000',
    pageUrl: `https://example.com${req.originalUrl}`,
    userAgent: req.headers['user-agent'],
    clientIp: req.ip,
  });

  if (!ad.filled) {
    res.status(204).end();
    return;
  }

  res
    .status(200)
    .type('html')
    .send(Adx.renderHtml(ad));
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### Express JSON response

An application can return structured data instead of rendered HTML:

```ts
app.get('/api/ad', async (req, res) => {
  const ad = await adx.requestAd({
    slotId: 'your-slot-id',
    pageUrl: `https://example.com${req.originalUrl}`,
    userAgent: req.headers['user-agent'],
    clientIp: req.ip,
  });

  if (!ad.filled) {
    res.status(204).end();
    return;
  }

  res.json({
    filled: ad.filled,
    kind: ad.kind,
    source: ad.source,
    impId: ad.impId,
    creative: ad.creative,
    clickUrl: ad.impId ? adx.clickUrl(ad.impId) : null,
  });
});
```

Use a JSON response when the frontend is responsible for:

* Creative rendering
* Viewability measurement
* Impression reporting
* Click interaction
* Placement behavior

---

## Fastify Integration

```ts
import Fastify from 'fastify';
import { Adx } from '@theaimart/adx';

const app = Fastify({
  logger: true,
  trustProxy: true,
});

const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
});

app.get('/ad', async (request, reply) => {
  const userAgent = request.headers['user-agent'];

  const ad = await adx.requestAd({
    slotId: '8b1f2c3d-0000-0000-0000-000000000000',
    pageUrl: `https://example.com${request.url}`,
    userAgent,
    clientIp: request.ip,
  });

  if (!ad.filled) {
    return reply.status(204).send();
  }

  return reply
    .status(200)
    .type('text/html')
    .send(Adx.renderHtml(ad));
});

await app.listen({
  port: 3000,
});
```

Configure `trustProxy` according to your actual reverse-proxy topology.

---

## Next.js Integration

The SDK can be used in server-side Next.js environments where Node.js APIs are available.

### Route handler example

```ts
import { Adx } from '@theaimart/adx';
import type { NextRequest } from 'next/server';

const adx = new Adx({
  apiKey: process.env.THEAIMART_ADX_PUBLISHER_KEY!,
});

export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = forwardedFor?.split(',')[0]?.trim();

  const ad = await adx.requestAd({
    slotId: '8b1f2c3d-0000-0000-0000-000000000000',
    pageUrl: request.nextUrl.toString(),
    userAgent: request.headers.get('user-agent') ?? undefined,
    clientIp,
  });

  if (!ad.filled) {
    return new Response(null, {
      status: 204,
    });
  }

  return new Response(Adx.renderHtml(ad), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
```

Only trust forwarding headers when they are set by your verified hosting or proxy infrastructure.

### Server component request

```ts
import { headers } from 'next/headers';
import { Adx } from '@theaimart/adx';

const adx = new Adx({
  apiKey: process.env.THEAIMART_ADX_PUBLISHER_KEY!,
});

export default async function MonetizedPage() {
  const requestHeaders = await headers();

  const ad = await adx.requestAd({
    slotId: 'your-slot-id',
    pageUrl: 'https://example.com/articles/server-side-rendering',
    userAgent: requestHeaders.get('user-agent') ?? undefined,
  });

  return (
    <main>
      <h1>Article</h1>

      {ad.filled && (
        <div
          dangerouslySetInnerHTML={{
            __html: Adx.renderHtml(ad),
          }}
        />
      )}
    </main>
  );
}
```

Before inserting generated HTML, verify that the SDK's rendering behavior and creative trust model match your application's Content Security Policy.

---

## Direct Client Usage

Create the client:

```ts
const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
});
```

Request an advertisement:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  pageUrl: 'https://example.com/page',
  pageKeywords: 'technology,nodejs,typescript',
  userAgent: 'Mozilla/5.0 ...',
  clientIp: '203.0.113.10',
});
```

Handle no-fill:

```ts
if (!ad.filled) {
  console.log({
    reason: ad.reason,
    retryAfterSeconds: ad.retryAfterSeconds,
  });
}
```

Handle a filled response:

```ts
if (ad.filled) {
  console.log({
    source: ad.source,
    kind: ad.kind,
    impId: ad.impId,
    creative: ad.creative,
  });
}
```

---

## Rendering Advertisements

The SDK includes a static HTML-rendering helper:

```ts
const html = Adx.renderHtml(ad);
```

You can provide a CSS class:

```ts
const html = Adx.renderHtml(
  ad,
  'theaimart-ad-placement',
);
```

Example response:

```ts
if (!ad.filled) {
  return '';
}

return Adx.renderHtml(
  ad,
  'homepage-banner-ad',
);
```

The renderer converts supported advertisement data into an HTML representation.

The exact output depends on the advertisement kind.

Supported normalized kinds include:

* `image`
* `html`
* `no_fill`

### Styling the rendered output

```css
.theaimart-ad-placement {
  display: block;
  max-width: 100%;
  overflow: hidden;
}

.theaimart-ad-placement img {
  display: block;
  width: 100%;
  height: auto;
}
```

Ensure the CSS class used by the renderer is appropriate for your page layout.

### Content Security Policy

When rendering external image or HTML creatives, review your site's Content Security Policy.

Depending on the creative source, your policy may need carefully scoped values for directives such as:

```text
img-src
frame-src
script-src
style-src
connect-src
```

Do not broadly weaken your Content Security Policy without reviewing the creative requirements and security implications.

---

## Viewability Tracking

An advertisement response should not automatically be counted as viewable merely because the backend returned it.

The frontend should measure whether the advertisement satisfies the required viewability condition.

The standard threshold described by this integration is:

* At least 50% of the advertisement visible
* For at least one continuous second

After the frontend confirms viewability, report the impression through a backend endpoint.

### Backend viewability endpoint

```ts
app.post('/api/ad/viewable/:impId', async (req, res) => {
  const success = await adx.reportViewable(
    req.params.impId,
    {
      userAgent: req.headers['user-agent'],
      clientIp: req.ip,
    },
  );

  if (!success) {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    reported: true,
  });
});
```

### Frontend viewability example

```js
const element = document.querySelector('[data-ad-impression-id]');

if (element) {
  const impressionId = element.dataset.adImpressionId;

  let visibleTimer;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.intersectionRatio >= 0.5) {
        visibleTimer = window.setTimeout(() => {
          fetch(`/api/ad/viewable/${encodeURIComponent(impressionId)}`, {
            method: 'POST',
            keepalive: true,
          });
        }, 1000);
      } else if (visibleTimer) {
        window.clearTimeout(visibleTimer);
        visibleTimer = undefined;
      }
    },
    {
      threshold: [0, 0.5, 1],
    },
  );

  observer.observe(element);
}
```

Production implementations should ensure that the impression is reported only once.

### Direct reporting

```ts
// Only once your frontend has measured the ad ≥50% on screen for ≥1s:
const reported = await adx.reportViewable(impId);
console.log({ reported });
```

Only use direct reporting after viewability has actually been confirmed.

---

## Click Tracking

Generate a registered click URL:

```ts
if (ad.impId) {
  const clickUrl = adx.clickUrl(ad.impId);
}
```

Example:

```ts
const clickUrl =
  ad.isTrackable && ad.impId
    ? adx.clickUrl(ad.impId)
    : null;
```

Use the SDK-generated click URL rather than linking directly to an untracked destination.

A custom renderer should:

* Require an intentional user click
* Avoid automatic navigation
* Preserve the impression's tracking relationship
* Validate the URL before exposing it
* Prevent unrelated destinations from replacing the registered click URL
* Handle missing impression identifiers safely

---

## Ad Requests

The request method accepts a server-side advertisement request object:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  slotName: 'homepage-banner',
  pageUrl: 'https://example.com/page',
  pageKeywords: 'software,nodejs,development',
  usPrivacy: '1YNN',
  euconsentV2: 'consent-string',
  userAgent: 'Mozilla/5.0 ...',
  clientIp: '203.0.113.10',
  identityCookie: 'identity-cookie-value',
});
```

Available request fields include:

| Field            | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `slotId`         | Identifier of the configured advertisement slot       |
| `slotName`       | Human-readable or configured slot name                |
| `pageUrl`        | URL of the page displaying the advertisement          |
| `pageKeywords`   | Keywords describing the page or content               |
| `usPrivacy`      | Applicable US privacy signal                          |
| `euconsentV2`    | IAB Europe TCF v2 consent string                      |
| `userAgent`      | Real end-user browser User-Agent                      |
| `clientIp`       | Real end-user IP address                              |
| `identityCookie` | Existing Theaimart ADX identity value, when available |

Use either the configured slot identifier or supported slot-name mechanism according to your publisher setup.

Do not use placeholder values in production.

---

## Privacy Signals

The SDK accepts privacy-related request values:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  usPrivacy: '1YNN',
  euconsentV2: consentString,
});
```

These fields can be used to forward consent and privacy state collected by the application or consent-management platform.

The application remains responsible for:

* Determining which privacy laws apply
* Collecting valid consent where required
* Forwarding accurate signals
* Respecting opt-out choices
* Avoiding ad requests that conflict with user preferences
* Maintaining appropriate privacy documentation
* Configuring retention and identity behavior correctly

Do not fabricate privacy or consent strings.

The SDK transports the values supplied by the application; it does not determine legal compliance for the publisher.

---

## Identity Cookies

Use `identityCookie` when the application has a valid identity value associated with the user or browser:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  identityCookie: request.cookies.theaimart_adx_id,
});
```

Identity values can help preserve continuity across requests where permitted.

The application should:

* Treat identity values as untrusted input
* Validate size and format
* Apply appropriate cookie security settings
* Respect user privacy choices
* Avoid logging full identity values
* Avoid exposing identity values unnecessarily
* Follow the wire contract when storing or forwarding identity data

Recommended cookie properties can include:

```text
Secure
HttpOnly
SameSite
Path
Max-Age
```

The exact cookie policy depends on your deployment and frontend requirements.

---

## Ad Response Model

`requestAd` returns a normalized `Ad` object.

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

The exact exported TypeScript declarations included in the installed package are authoritative.

### Response fields

| Field               | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `filled`            | Indicates whether an eligible advertisement was returned |
| `kind`              | Normalized creative kind                                 |
| `source`            | Normalized demand source                                 |
| `impId`             | Impression identifier                                    |
| `identityId`        | Identity value returned by the backend                   |
| `creative`          | Creative payload                                         |
| `auction`           | Auction-related metadata                                 |
| `reason`            | No-fill or error reason                                  |
| `retryAfterSeconds` | Suggested retry delay, when available                    |
| `isTrackable`       | Whether the advertisement can be tracked                 |
| `raw`               | Original normalized or backend response data             |

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

### Trackable advertisement

```ts
if (ad.isTrackable && ad.impId) {
  console.log(ad.impId);
}
```

### Retry guidance

```ts
if (!ad.filled && ad.retryAfterSeconds) {
  console.log(
    `Retry after ${ad.retryAfterSeconds} seconds`,
  );
}
```

Do not implement uncontrolled immediate retry loops.

---

## Demand Sources

The SDK normalizes contract-defined advertising sources into:

* `internal`
* `openrtb`
* `house`

A no-fill response is represented by `filled === false` and `kind === 'no_fill'`.

### Internal

An advertisement supplied through demand managed directly inside Theaimart ADX.

```ts
if (ad.source === 'internal') {
  console.log('Internal demand');
}
```

### OpenRTB

An advertisement supplied through an OpenRTB-compatible demand integration or auction.

```ts
if (ad.source === 'openrtb') {
  console.log('OpenRTB demand');
}
```

### House

A publisher- or platform-managed house advertisement.

```ts
if (ad.source === 'house') {
  console.log('House advertisement');
}
```

### No-fill

A valid response indicating that no eligible advertisement was available.

No-fill should be handled as a normal advertising outcome, not necessarily as an application error.

---

## Four-Way Union Parsing

The backend can return one of four logical outcomes:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The SDK normalizes these response variants into one consistent `Ad` interface.

This avoids forcing application code to parse multiple backend response shapes.

Example:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
});

if (!ad.filled) {
  return handleNoFill(ad);
}

switch (ad.source) {
  case 'internal':
    return handleInternalAd(ad);

  case 'openrtb':
    return handleOpenRtbAd(ad);

  case 'house':
    return handleHouseAd(ad);
}
```

Malformed, incomplete, or unsupported responses fail closed.

They are not exposed as partially initialized filled advertisements.

---

## Fail-Closed Error Handling

By default, the SDK converts operational failures into a no-fill `Ad`.

Potential failure conditions include:

* DNS failure
* Connection refusal
* Request timeout
* Aborted request
* Invalid HTTP response
* Non-200 response
* Invalid JSON
* Missing required fields
* Unsupported response shape
* Invalid advertisement kind
* Invalid demand source
* Invalid impression identifier
* Transport failure

Default behavior:

```text
Operational failure → ad.filled === false
```

The SDK does not throw by default for ordinary request failures.

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
});

if (!ad.filled) {
  console.log(`No fill: ${ad.reason}`);
}
```

### Exception mode

Enable `raiseOnError` when the application explicitly wants transport or parsing failures to throw:

```ts
const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
  raiseOnError: true,
});
```

Then use standard error handling:

```ts
try {
  const ad = await adx.requestAd({
    slotId: 'your-slot-id',
  });

  console.log(ad);
} catch (error) {
  console.error('Ad request failed', error);
}
```

Use `raiseOnError: true` primarily for:

* Development
* Integration testing
* Debugging
* Strict internal services
* Monitoring pipelines

For user-facing production pages, fail-closed behavior is generally safer.

---

## User-Agent and Fraud Classification

The SDK sends a default User-Agent in the following family:

```text
theaimart-adx-node/<version>
```

Example:

```text
theaimart-adx-node/1.0.0
```

This avoids generic or bot-blocklisted HTTP-client User-Agents.

However, the SDK User-Agent identifies the server-side SDK, not the end user's browser.

For real user traffic, also forward the end-user User-Agent:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  userAgent: req.headers['user-agent'],
});
```

And forward the real user IP:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  userAgent: req.headers['user-agent'],
  clientIp: req.ip,
});
```

This distinction is important:

| Value               | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| SDK User-Agent      | Identifies `@theaimart/adx`               |
| Request `userAgent` | Identifies the real end-user browser or device |
| Request `clientIp`  | Identifies the real end-user network source    |

Without end-user context, many unrelated impressions can appear to originate from one automated backend.

User-Agent behavior is defined in [CONTRACT.md section 6](../../CONTRACT.md).

---

## SQL-Filter-Safe Encoding

Real URLs and page text often contain substrings that resemble SQL keywords or security-sensitive tokens.

Examples can include:

```text
end
open
cast
select
@
```

These sequences can occur legitimately inside:

* Page URLs
* Query parameters
* Article slugs
* Email-like identifiers
* Search terms
* Page keywords
* Application routes
* Tracking parameters

A backend Web Application Firewall may reject raw query parameters containing these patterns.

The SDK therefore byte-percent-encodes contract-defined free-text parameters before sending them.

This prevents normal values from accidentally triggering backend security rules.

Example input:

```text
https://example.com/open-source/backend-tools?author=user@example.com
```

The SDK encodes the relevant free-text value according to the wire contract before transmission.

The encoding behavior:

* Preserves valid application data
* Prevents malformed query construction
* Avoids accidental WAF rejection
* Supports URLs containing reserved-looking substrings
* Produces deterministic requests
* Keeps backend SQL-backed filtering safe
* Prevents normal page URLs from producing false-positive 403 responses

The encoding requirements are defined in [CONTRACT.md section 7](../../CONTRACT.md).

Do not pre-encode values unless the contract explicitly requires it. Double encoding can change the request value.

---

## Transport Injection

The SDK exposes an injectable `Transport` interface.

This allows the default native `fetch` implementation to be replaced with:

* A test transport
* A mock implementation
* A custom `undici.request` adapter
* An observability wrapper
* A controlled enterprise network implementation

Conceptual usage:

```ts
const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
  transport: customTransport,
});
```

The exact `Transport` signature is defined by the package's exported TypeScript types.

### Mock transport

```ts
const mockTransport = {
  async request(input: unknown) {
    return {
      status: 200,
      body: {
        filled: false,
        reason: 'test_no_fill',
      },
    };
  },
};

const adx = new Adx({
  apiKey: 'pk_test_key',
  transport: mockTransport,
});
```

Adapt the mock implementation to the actual exported `Transport` interface.

### Why inject the transport?

Transport injection improves:

* Unit testing
* Deterministic integration tests
* Failure simulation
* Timeout testing
* WAF regression testing
* Local development
* Observability
* Dependency isolation

The SDK remains zero-runtime-dependency even when applications choose to provide their own transport implementation.

---

## API Reference

### `new Adx(options)`

Creates a Theaimart ADX client.

```ts
const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
  baseUrl: 'https://api.example.com',
  timeoutMs: 5000,
  userAgent: 'theaimart-adx-node/1.0.0',
  transport: customTransport,
  raiseOnError: false,
});
```

Available options:

| Option         | Description                                              |
| -------------- | -------------------------------------------------------- |
| `apiKey`       | Public publisher key                                     |
| `baseUrl`      | Optional API base URL override                           |
| `timeoutMs`    | Request timeout in milliseconds                          |
| `userAgent`    | SDK transport User-Agent override                        |
| `transport`    | Custom transport implementation                          |
| `raiseOnError` | Throw instead of returning no-fill on operational errors |

Use the production defaults unless a controlled environment requires an override.

---

### `requestAd(request)`

Requests an advertisement.

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
});
```

Complete example:

```ts
const ad = await adx.requestAd({
  slotId: 'your-slot-id',
  slotName: 'homepage-banner',
  pageUrl: 'https://example.com/page',
  pageKeywords: 'technology,software,nodejs',
  usPrivacy: '1YNN',
  euconsentV2: consentString,
  userAgent: request.headers['user-agent'],
  clientIp: clientAddress,
  identityCookie: identityValue,
});
```

Returns:

```ts
Promise<Ad>
```

---

### `reportViewable(impId, context?)`

Reports a viewable impression:

```ts
const reported = await adx.reportViewable(
  impressionId,
);
```

Forward user context where available:

```ts
const reported = await adx.reportViewable(
  impressionId,
  {
    userAgent: req.headers['user-agent'],
    clientIp: req.ip,
  },
);
```

Returns:

```ts
Promise<boolean>
```

A `false` result indicates that the best-effort beacon was not successfully reported.

---

### `clickUrl(impId)`

Generates the registered click URL for an impression:

```ts
const url = adx.clickUrl(impressionId);
```

Use only a valid impression identifier returned by the SDK.

---

### `Adx.renderHtml(ad, cssClass?)`

Renders a supported advertisement as HTML:

```ts
const html = Adx.renderHtml(ad);
```

With a CSS class:

```ts
const html = Adx.renderHtml(
  ad,
  'theaimart-ad-placement',
);
```

Applications should verify the output against their Content Security Policy and layout requirements.

---

## Production Architecture

A common server-side architecture is:

```text
Browser
   │
   │ page request
   ▼
Node.js application
   │
   │ requestAd with user IP, UA, page URL, privacy signals
   ▼
Theaimart ADX
   │
   │ normalized ad response
   ▼
Node.js application
   │
   │ HTML or JSON response
   ▼
Browser
   │
   │ measure ≥50% visibility for ≥1 second
   ▼
Node.js viewability endpoint
   │
   │ reportViewable
   ▼
Theaimart ADX
```

Recommended separation:

### Backend responsibilities

* Protect publisher configuration
* Request advertisements
* Forward trusted client context
* Normalize no-fill behavior
* Generate click URLs
* Expose impression-report endpoints
* Apply rate limits
* Validate impression identifiers
* Log operational errors safely

### Frontend responsibilities

* Render the placement
* Measure viewability
* Report viewability once
* Handle user clicks
* Maintain accessible layout
* Collapse no-fill placements
* Prevent accidental clicks
* Avoid automatic navigation

---

## Client Reuse

Create one reusable `Adx` instance for a shared configuration:

```ts
import { Adx } from '@theaimart/adx';

export const adx = new Adx({
  apiKey: process.env.THEAIMART_ADX_PUBLISHER_KEY!,
  timeoutMs: 5000,
});
```

Import it where needed:

```ts
import { adx } from './adx-client.js';

const ad = await adx.requestAd({
  slotId: 'your-slot-id',
});
```

Avoid creating an unnecessary new client for every request unless isolation is required.

---

## Timeout Configuration

Configure a bounded timeout:

```ts
const adx = new Adx({
  apiKey: 'pk_your_publisher_key',
  timeoutMs: 3000,
});
```

Advertising should not delay the primary application indefinitely.

Choose a timeout appropriate for:

* Page-rendering budget
* Server-side rendering latency
* Geographic network conditions
* Fallback behavior
* Auction requirements
* User experience

On timeout, the default fail-closed behavior returns a no-fill advertisement.

---

## Retry Behavior

Do not retry aggressively after every no-fill response.

No-fill can be a normal outcome caused by:

* No eligible campaign
* Targeting mismatch
* Frequency limits
* Fraud-risk policy
* Privacy state
* Geographic restrictions
* Temporary demand shortage
* Backend protection
* Auction timeout

Respect `retryAfterSeconds` when present:

```ts
if (!ad.filled && ad.retryAfterSeconds) {
  scheduleNextAttempt(ad.retryAfterSeconds);
}
```

Avoid:

* Recursive immediate retries
* Multiple parallel requests for one placement
* Reloading every few milliseconds
* Ignoring backend retry guidance
* Creating duplicate impressions

---

## Security Guidance

### Use only public publisher keys

The key supplied to the SDK should be a publisher key intended for the integration:

```text
pk_your_publisher_key
```

Do not provide:

* Administrative credentials
* Database passwords
* Infrastructure API keys
* Cloud access keys
* Private signing keys
* Billing credentials
* Internal service secrets

### Keep configuration in environment variables

```ts
const apiKey = process.env.THEAIMART_ADX_PUBLISHER_KEY;

if (!apiKey) {
  throw new Error(
    'THEAIMART_ADX_PUBLISHER_KEY is required',
  );
}

const adx = new Adx({
  apiKey,
});
```

### Validate impression identifiers

Before forwarding an impression ID:

```ts
const impressionId = req.params.impId;

if (!/^[A-Za-z0-9_-]{1,200}$/.test(impressionId)) {
  res.status(400).json({
    error: 'Invalid impression ID',
  });
  return;
}
```

Use validation consistent with the actual impression-ID format defined by the wire contract.

### Apply rate limits

Protect viewability and ad-request endpoints from abuse.

### Avoid logging sensitive values

Do not log full:

* Identity cookies
* Consent strings
* IP addresses without a retention policy
* Publisher keys
* Raw advertising payloads containing user data

### Escape custom output

`Adx.renderHtml` should be used according to its documented trust model.

When building custom renderers, do not concatenate untrusted creative fields directly into HTML without appropriate validation or escaping.

---

## Observability

Recommended operational metrics include:

* Total ad requests
* Filled responses
* No-fill responses
* Fill rate
* Requests by slot
* Requests by demand source
* Request latency
* Timeout count
* Non-200 count
* Parsing failure count
* Viewability-report success rate
* Viewability-report failure rate
* Retry-after distribution

Example structured logging:

```ts
const startedAt = Date.now();

const ad = await adx.requestAd({
  slotId: 'homepage-banner',
  pageUrl,
  userAgent,
  clientIp,
});

console.log({
  event: 'theaimart_ad_request',
  slotId: 'homepage-banner',
  filled: ad.filled,
  kind: ad.kind,
  source: ad.source,
  reason: ad.reason,
  durationMs: Date.now() - startedAt,
});
```

Avoid logging complete identity, consent, or user-network values unless necessary and permitted.

---

## Testing

The injectable transport makes the SDK suitable for deterministic tests.

Test the following outcomes:

| Scenario                          | Expected behavior                  |
| --------------------------------- | ---------------------------------- |
| Internal filled response          | Normalized as `source: 'internal'` |
| OpenRTB response                  | Normalized as `source: 'openrtb'`  |
| House response                    | Normalized as `source: 'house'`    |
| No-fill response                  | `filled === false`                 |
| Invalid JSON                      | Safe no-fill by default            |
| HTTP 403                          | Safe no-fill by default            |
| HTTP 500                          | Safe no-fill by default            |
| Timeout                           | Safe no-fill by default            |
| `raiseOnError: true`              | Operational failure throws         |
| Trackable response                | Valid `impId` and `isTrackable`    |
| Missing impression ID             | Not treated as trackable           |
| Page URL with SQL-like substrings | Encoded without WAF rejection      |
| User-Agent forwarding             | End-user context reaches transport |
| Client-IP forwarding              | End-user context reaches transport |
| HTML rendering                    | Supported creative renders         |
| No-fill rendering                 | No unsafe creative output          |

---

## Development

Enter the Node.js package directory:

```bash
cd packages/node
```

Install development dependencies:

```bash
npm install
```

The package has zero runtime dependencies. Development dependencies can include tools such as:

* TypeScript
* Node.js type declarations

Run the test suite:

```bash
npm test
```

Run TypeScript checking:

```bash
npm run typecheck
```

Build JavaScript and declaration files:

```bash
npm run build
```

Complete verification:

```bash
npm test
npm run typecheck
npm run build
```

The build emits compiled JavaScript and TypeScript declaration files into:

```text
dist/
```

---

## Native TypeScript Tests

On Node.js 23.6 or later, the test suite can use native TypeScript type stripping.

Example test command:

```bash
node --test test/*.test.ts
```

This allows runtime tests to execute without adding a third-party TypeScript runtime package.

The package test suite includes:

* Encoding tests
* Model-normalization tests
* Client behavior tests
* Error-handling tests
* Timeout tests
* Transport-injection tests
* Local mock-server tests
* Backend WAF regression tests

The end-to-end mock-server test reproduces the backend WAF behavior so URLs containing SQL-like substrings can be verified without contacting production infrastructure.

---

## Local Mock Server Testing

A local mock server can simulate:

* HTTP 200 filled responses
* No-fill responses
* HTTP 403 WAF rejection
* HTTP 500 failures
* Slow responses
* Invalid JSON
* Missing fields
* OpenRTB creatives
* House advertisements
* Viewability beacons

Example conceptual test:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

test(
  'encodes page URLs that contain WAF-sensitive text',
  async () => {
    const adx = new Adx({
      apiKey: 'pk_test',
      baseUrl: mockServerUrl,
    });

    const ad = await adx.requestAd({
      slotId: 'test-slot',
      pageUrl:
        'https://example.com/open-source/backend?author=user@example.com',
    });

    assert.equal(ad.filled, true);
  },
);
```

Use the exact test helpers and API contracts implemented by the package.

---

## Frequently Asked Questions

### What is `@theaimart/adx`?

It is the official Node.js and TypeScript SDK for integrating Theaimart ADX advertising into server-side applications.

### Which Node.js versions are supported?

Node.js 18 or later is required because the SDK uses the native global `fetch` API.

Node.js 20 or later is recommended for production.

### Does the package have runtime dependencies?

No. The package uses built-in Node.js APIs.

### Does it support TypeScript?

Yes. It is TypeScript-first and ships TypeScript declaration files.

### Can I use it with JavaScript?

Yes. The compiled package can be used from compatible JavaScript projects.

### Can I use it with Express?

Yes. Forward the real end-user User-Agent and IP address from the Express request.

### Can I use it with Fastify?

Yes. Forward `request.headers['user-agent']` and the trusted client IP.

### Can I use it with Next.js?

Yes, in server-side environments compatible with the package and Node.js APIs.

### Can I use it in the browser?

This package is designed for Node.js server-side usage. Use the appropriate browser or platform SDK for direct client-side integration.

### Why should I forward the end-user IP address?

Today it has no effect: the ad server only trusts the `X-Forwarded-For` entry its own proxy appends, so every request is attributed to your server's IP (see "Before you ship"). The option is kept because it is harmless and would take effect if the server ever trusts an authenticated server-to-server hop.

### Why should I forward the end-user User-Agent?

It allows the backend to classify the real browser, device, and operating system rather than seeing only the Node.js server.

### Does the SDK throw on network failure?

Not by default. It returns a no-fill `Ad`.

Set `raiseOnError: true` when explicit exceptions are required.

### What is fail-closed behavior?

A timeout, parsing failure, non-200 response, or transport error becomes a safe no-fill response rather than crashing the application or exposing an invalid creative.

### Why does the SDK encode page URLs?

Real URLs can contain text that resembles SQL keywords and triggers backend WAF rules. Contract-compliant encoding prevents legitimate URLs from being rejected.

### Should I manually URL-encode `pageUrl`?

Normally, no. Pass the original value and allow the SDK to apply the wire-contract encoding. Manual encoding can cause double encoding.

### Does the SDK support OpenRTB?

Yes. OpenRTB responses are normalized into the common `Ad` model.

### What is a house advertisement?

A house advertisement is internal publisher- or platform-managed promotional inventory.

### What happens when there is no eligible advertisement?

The SDK returns an object where `filled` is `false` and `kind` is `no_fill`.

### Can the SDK render HTML?

Yes. Use `Adx.renderHtml(ad, cssClass?)`.

### Should I report viewability immediately after `requestAd`?

No. Report it only after the frontend confirms that the advertisement meets the viewability threshold.

### How should the frontend measure viewability?

A browser integration can use `IntersectionObserver` to verify that at least 50% of the advertisement remains visible for at least one second.

### What does `reportViewable` return?

`true` only when the server recorded the view (a duplicate counts). A beacon that beat the impression into the database is answered "not yet" and returns `false`; use `reportViewableOutcome` to tell that `'retry'` case — safe to resend a second or two later — from a permanent `'drop'`.

### Can I replace `fetch`?

Yes. Supply an implementation of the exported `Transport` interface.

### Why is transport injection useful?

It allows deterministic tests, custom network behavior, mocks, failure simulation, and integration with alternative HTTP implementations.

### Is the publisher API key secret?

Use only a publisher key intended for this integration. Do not pass administrative or infrastructure credentials to the SDK.

### Should I create a new `Adx` client for every request?

A reusable application-level client is generally preferable when configuration is shared.

### How should no-fill affect the page?

Hide or collapse the advertising placement without blocking the user's access to the main content.

---

## Server-Side Monetization with Theaimart ADX

`@theaimart/adx` is intended for developers building:

* Node.js websites
* TypeScript backends
* Express applications
* Fastify applications
* Next.js applications
* Server-rendered websites
* Content-management systems
* News websites
* Blogs
* Publisher platforms
* AI applications
* SaaS products
* Developer tools
* Web dashboards
* API-driven applications
* Desktop application backends
* Cross-platform monetization services

The SDK provides a typed server-side connection to Theaimart ADX while protecting normal application traffic from WAF false positives and preserving end-user context for better request classification.

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
* Advertisement requests
* Slot identifiers
* Page context
* User-Agent behavior
* Client-IP forwarding
* Privacy signals
* Identity values
* Free-text encoding
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill responses
* Impression identifiers
* Viewability reporting
* Click tracking
* Retry guidance
* Error handling

The SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response variants, encoding rules, identity handling, or tracking behavior should be introduced through an explicit contract-version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
