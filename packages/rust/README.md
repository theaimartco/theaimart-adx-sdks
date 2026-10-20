# Theaimart ADX Rust SDK

The official **Theaimart ADX SDK for Rust**, designed for server-side advertising, website monetization, backend ad decisioning, publisher platforms, and high-performance Rust services.

`theaimart-adx` provides a transport-agnostic advertising core with an optional blocking `ureq` transport. It supports requesting, normalizing, rendering, and tracking advertisements through the [Theaimart Ad Network](https://adx.theaimart.co).

The SDK implements version 1 of the [Theaimart ADX wire contract](../../CONTRACT.md).

```toml
[dependencies]
theaimart-adx = "1.0"
```

## Highlights

* Official Theaimart ADX Rust SDK
* Server-side advertising and website monetization
* Transport-agnostic architecture
* Zero-dependency core
* Optional blocking `ureq` transport
* Custom `reqwest`, `hyper`, or mock transport support
* Internal, OpenRTB, house, and no-fill response parsing
* SQL-filter-safe parameter encoding
* Fraud-safe SDK User-Agent
* Safe HTML rendering
* HTTP and HTTPS click URL validation
* Fail-closed request behavior
* No panics for normal ad-request failures
* `#![forbid(unsafe_code)]`
* Compatible with the Theaimart ADX wire contract v1

---

## Before you ship: what the ad server actually does

These are properties of the live ad server (`theaimart-adnetwork`), verified against its source —
see `CONTRACT.md` §3, §5, §6 and §8 for the detail.

1. **Every request is attributed to your server's IP.**
   The ad server deliberately reads only the `X-Forwarded-For` entry its own proxy appends, so an
   IP a client writes is ignored (it is what stops IP spoofing past the rate limits).
   So all of your users share one per-IP limit (60 ad requests/minute by default — then `429`),
   geo targeting sees your server's location, and a cloud IP adds to the fraud score. Server-side
   serving suits low-volume pages (server-rendered HTML, emails, previews). For user-facing traffic
   at scale, render on the user's device with the Web or mobile SDK.
2. **Forward the user's User-Agent** (`.user_agent(...)` / the request). It still drives device targeting and the bot filter.
3. **A site's `api_key` has 100 ad requests per minute in total**, across all of its users.
4. **An internal fill is billed when it is served**, not when it is seen. Request an ad only when
   you will show it.
5. **Report a view only after it was measured** (≥50% on screen for ≥1 s, e.g. by your frontend).
   Calling `report_viewable(imp_id)` just because the HTML was sent reports a view nobody saw.
   It returns true only when the server recorded the view. A beacon that arrives before the
   impression is written is answered "not yet" — `report_viewable_outcome(imp_id)` returns `ViewableOutcome::Retry` for that, and
   resending the same id a second or two later is safe (the rendering SDKs do this automatically).
6. **Privacy signals:** pass `us_privacy` / `euconsent_v2`, and `gpp` / `gpp_sid` (IAB GPP). A US section
   in the GPP section ids (7–12) makes the request contextual-only.

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Rust SDK?](#why-use-the-rust-sdk)
* [Requirements](#requirements)
* [Installation](#installation)
* [Feature Flags](#feature-flags)
* [Quick Start](#quick-start)
* [Critical End-User Context](#critical-end-user-context)
* [Ad Request Example](#ad-request-example)
* [Rendering Advertisements](#rendering-advertisements)
* [Viewability Tracking](#viewability-tracking)
* [Click Tracking](#click-tracking)
* [Bring Your Own Transport](#bring-your-own-transport)
* [Reqwest Transport Example](#reqwest-transport-example)
* [Axum Integration](#axum-integration)
* [Actix Web Integration](#actix-web-integration)
* [Rocket Integration](#rocket-integration)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Response Parsing](#four-way-response-parsing)
* [Fail-Closed Error Handling](#fail-closed-error-handling)
* [User-Agent and Fraud Classification](#user-agent-and-fraud-classification)
* [SQL-Filter-Safe Encoding](#sql-filter-safe-encoding)
* [HTML Rendering Security](#html-rendering-security)
* [API Reference](#api-reference)
* [Production Architecture](#production-architecture)
* [Client Reuse](#client-reuse)
* [Timeouts and Retry Behavior](#timeouts-and-retry-behavior)
* [Security Guidance](#security-guidance)
* [Observability](#observability)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for publishers, developers, websites, software companies, and digital products.

The Rust SDK connects a server-side Rust application to the Theaimart ADX advertising infrastructure.

It allows a Rust service to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Forward page and end-user context.
4. Receive an internal, OpenRTB, house, or no-fill response.
5. Normalize the response into one `Ad` model.
6. Render supported creatives as safe HTML.
7. Report viewable impressions.
8. Generate or preserve registered click behavior.
9. Handle transport and parsing failures safely.
10. Monetize eligible website or application traffic.

The crate is intended primarily for server-side environments such as:

* Axum applications
* Actix Web applications
* Rocket applications
* Warp services
* Tide applications
* Server-rendered websites
* Publisher platforms
* Content-management systems
* Backend-for-frontend services
* Ad-operations tools
* Server-to-server ad decisioning
* High-performance Rust APIs

---

## Why use the Rust SDK?

A production ad integration requires more than sending a basic HTTP request.

A custom implementation must correctly handle:

* Backend request formatting
* Publisher authentication
* Page context
* End-user context
* User-Agent classification
* WAF-sensitive free-text encoding
* Multiple response shapes
* No-fill responses
* Viewability tracking
* Click URL security
* HTML escaping
* Transport timeouts
* Network failures
* Invalid backend responses

Theaimart ADX Rust SDK centralizes these behaviors in a reusable, typed implementation.

The SDK is designed around four principles:

### Transport independence

The core request-building, encoding, parsing, and rendering logic is independent of a specific HTTP library.

### Safe production defaults

Operational failures become no-fill responses instead of panics or unhandled errors.

### Minimal dependency surface

The core can be compiled without any HTTP-client dependency.

### Security-conscious rendering

HTML output escapes attributes and rejects unsafe click URL schemes.

---

## Requirements

The SDK requires:

* A supported stable Rust toolchain
* A valid Theaimart ADX public publisher key
* A configured slot ID or slot name
* Network access to the Theaimart ADX API
* An HTTP transport when network requests are required

Check your Rust version:

```bash
rustc --version
```

Check Cargo:

```bash
cargo --version
```

Use a maintained stable Rust toolchain appropriate for your production environment.

---

## Installation

Add the crate to `Cargo.toml`:

```toml
[dependencies]
theaimart-adx = "1.0"
```

Install through Cargo:

```bash
cargo add theaimart-adx
```

By default, the crate enables the blocking `ureq` transport.

---

## Feature Flags

### Default transport

The default feature set includes `ureq`:

```toml
[dependencies]
theaimart-adx = "1.0"
```

This enables the built-in blocking `UreqTransport`.

### Transport-agnostic core

Disable default features to compile the zero-dependency core without `ureq`:

```toml
[dependencies]
theaimart-adx = {
    version = "1.0",
    default-features = false
}
```

In this mode, provide your own implementation of `HttpTransport`.

This is useful when your application already uses:

* `reqwest`
* `hyper`
* `isahc`
* A custom enterprise transport
* A local mock transport
* An internal service mesh client
* A deterministic test implementation

---

## Quick Start

```rust
use theaimart_adx::{render_html, AdRequest, Adx};

fn main() {
    let adx = Adx::new("pk_your_publisher_key");

    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("8b1f2c3d-0000-0000-0000-000000000000"),
        page_url: Some("https://example.com/articles/rust-advertising"),
        ..Default::default()
    });

    if !ad.filled {
        println!("No fill: {:?}", ad.reason);
        return;
    }

    let html = render_html(&ad, "theaimart-adx");

    println!("{html}");

    // Do NOT report a view here: nobody has seen the ad yet. Call
    // `adx.report_viewable(imp_id)` only once your frontend has measured it
    // ≥50% on screen for ≥1s (CONTRACT.md §9c).
}
```

Replace:

* `pk_your_publisher_key` with your public publisher key
* The example UUID with the slot ID from your publisher configuration
* The page URL with the actual page displaying the advertisement

---

## Critical End-User Context

When using the Rust SDK in a server-side application, include the page and privacy context supported by `AdRequest`.

Without real user context, every request can appear to originate from:

* One backend server
* One data-center IP
* One SDK User-Agent
* One device class
* One network source

This can affect:

* Fraud scoring
* Device classification
* Geographic classification
* Campaign eligibility
* Fill rate
* Frequency handling
* Reporting accuracy

A server-side request should normally include:

* The page URL
* Page keywords
* Privacy signals
* Identity values where permitted

Conceptual example:

```rust
let ad = adx.request_ad(&AdRequest {
    slot_id: Some("homepage-banner"),
    page_url: Some("https://example.com/current-page"),
    page_keywords: Some("news,technology"),
    identity_cookie: Some("stored-identity-value"),
    ..Default::default()
});
```

The current `AdRequest` type does not expose per-request browser User-Agent or client-IP fields. The SDK sends its configured SDK User-Agent.

---

## Ad Request Example

```rust
use theaimart_adx::{AdRequest, Adx};

let adx = Adx::new("pk_your_publisher_key");

let request = AdRequest {
    slot_id: Some("8b1f2c3d-0000-0000-0000-000000000000"),
    slot_name: Some("homepage-banner"),
    page_url: Some("https://example.com/rust/backend-advertising"),
    page_keywords: Some("rust,backend,development"),
    us_privacy: Some("1YNN"),
    euconsent_v2: Some("consent-string"),
    ..Default::default()
};

let ad = adx.request_ad(&request);

if ad.filled {
    println!("Filled advertisement");
} else {
    println!("No fill: {:?}", ad.reason);
}
```

`AdRequest` supports:

* Slot ID
* Slot name
* Page URL
* Page keywords
* US privacy signal
* TCF v2 consent string
* Identity cookie

The installed crate documentation and exported Rust types remain authoritative.

---

## Rendering Advertisements

The crate provides a safe HTML-rendering helper:

```rust
use theaimart_adx::render_html;

let html = render_html(&ad, "theaimart-adx");
```

The second argument is the CSS class assigned to the rendered advertisement container.

Example:

```rust
let html = render_html(&ad, "homepage-banner-ad");
```

Possible usage in a server-rendered template:

```rust
if ad.filled {
    let ad_html = render_html(&ad, "article-inline-ad");

    // Pass `ad_html` into your template system according to its
    // trusted-HTML handling rules.
}
```

### Example CSS

```css
.theaimart-adx {
  display: block;
  max-width: 100%;
  overflow: hidden;
}

.theaimart-adx img {
  display: block;
  width: 100%;
  height: auto;
}
```

### Template-engine warning

Template engines commonly escape HTML by default.

When injecting the output of `render_html`, use your template engine's trusted or raw HTML mechanism only after verifying that the crate's rendering guarantees match your application security policy.

Examples include:

* Askama safe filters
* Tera safe filters
* Maud pre-escaped output
* Handlebars raw blocks
* Minijinja safe values

Do not mark arbitrary creative data as trusted HTML.

---

## Viewability Tracking

Receiving an advertisement from the backend does not mean it was viewable.

The frontend should normally confirm that the ad was:

* At least 50% visible
* For at least one continuous second

Only after the frontend confirms viewability should the backend report the impression.

```rust
if ad.is_trackable() {
    if let Some(imp_id) = ad.imp_id.as_deref() {
        let success = adx.report_viewable(imp_id);

        if !success {
            eprintln!("Viewability beacon was not accepted");
        }
    }
}
```

Do not report viewability immediately after `request_ad` unless the advertisement was actually rendered and met the required threshold.

### Recommended flow

```text
Rust backend requests ad
        ↓
Backend renders HTML or JSON
        ↓
Browser displays advertisement
        ↓
Browser measures ≥50% visibility for ≥1 second
        ↓
Browser calls Rust viewability endpoint
        ↓
Rust backend calls report_viewable
```

### Browser-side viewability example

```javascript
const ad = document.querySelector("[data-ad-impression-id]");

if (ad) {
  const impressionId = ad.dataset.adImpressionId;
  let timer;
  let reported = false;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.intersectionRatio >= 0.5 && !reported) {
        timer = window.setTimeout(async () => {
          reported = true;

          await fetch(
            `/api/ad/viewable/${encodeURIComponent(impressionId)}`,
            {
              method: "POST",
              keepalive: true,
            }
          );
        }, 1000);
      } else if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    },
    {
      threshold: [0, 0.5, 1],
    }
  );

  observer.observe(ad);
}
```

Production code should ensure one impression is not reported multiple times.

---

## Click Tracking

The rendered output preserves the advertisement click path where a safe click URL is available.

The renderer only turns click URLs into links when the URL uses one of these schemes:

```text
http
https
```

Unsafe schemes are rejected, including examples such as:

```text
javascript:
file:
intent:
data:
vbscript:
```

This prevents hostile or malformed creative data from creating dangerous clickable links.

When building a custom renderer, apply the same restriction.

Conceptual validation:

```rust
fn is_safe_click_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}
```

Use the crate's built-in rendering logic instead of duplicating security-sensitive URL handling where practical.

---

## Bring Your Own Transport

The crate exposes an `HttpTransport` interface for custom HTTP implementations.

```rust
use std::time::Duration;

use theaimart_adx::transport::{
    HttpResponse,
    HttpTransport,
    TransportError,
};
use theaimart_adx::Adx;

struct MyTransport;

impl HttpTransport for MyTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        let _ = (url, headers, timeout);

        todo!("Perform GET and return HttpResponse")
    }

    fn post(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &[u8],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        let _ = (url, headers, body, timeout);

        todo!("Perform POST and return HttpResponse")
    }
}

let adx = Adx::with_transport(
    "pk_your_publisher_key",
    MyTransport,
);
```

This works with:

```toml
[dependencies]
theaimart-adx = {
    version = "1.0",
    default-features = false
}
```

### Custom transport use cases

A custom transport is useful for:

* Async applications
* Existing `reqwest` clients
* Hyper-based infrastructure
* Internal proxies
* Service meshes
* Custom TLS configuration
* Observability wrappers
* Deterministic tests
* Failure injection
* Request recording
* Enterprise network controls

---

## Reqwest Transport Example

The following is a conceptual blocking `reqwest` adapter.

Add dependencies:

```toml
[dependencies]
theaimart-adx = {
    version = "1.0",
    default-features = false
}

reqwest = {
    version = "0.12",
    default-features = false,
    features = ["blocking", "rustls-tls"]
}
```

Example adapter:

```rust
use std::time::Duration;

use reqwest::blocking::Client;
use theaimart_adx::transport::{
    HttpResponse,
    HttpTransport,
    TransportError,
};

struct ReqwestTransport {
    client: Client,
}

impl ReqwestTransport {
    fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: Client::builder().build()?,
        })
    }
}

impl HttpTransport for ReqwestTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        let mut request = self
            .client
            .get(url)
            .timeout(timeout);

        for (name, value) in headers {
            request = request.header(*name, *value);
        }

        let response = request
            .send()
            .map_err(|error| TransportError::new(error.to_string()))?;

        let status = response.status().as_u16();

        let response_headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| {
                        (
                            name.as_str().to_owned(),
                            value.to_owned(),
                        )
                    })
            })
            .collect();

        let body = response
            .bytes()
            .map_err(|error| TransportError::new(error.to_string()))?
            .to_vec();

        Ok(HttpResponse {
            status,
            headers: response_headers,
            body,
        })
    }

    fn post(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &[u8],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        let mut request = self
            .client
            .post(url)
            .timeout(timeout)
            .body(body.to_vec());

        for (name, value) in headers {
            request = request.header(*name, *value);
        }

        let response = request
            .send()
            .map_err(|error| TransportError::new(error.to_string()))?;

        let status = response.status().as_u16();

        let response_headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| {
                        (
                            name.as_str().to_owned(),
                            value.to_owned(),
                        )
                    })
            })
            .collect();

        let body = response
            .bytes()
            .map_err(|error| TransportError::new(error.to_string()))?
            .to_vec();

        Ok(HttpResponse {
            status,
            headers: response_headers,
            body,
        })
    }
}
```

The exact `TransportError` constructors and `HttpResponse` field types must match the installed crate version.

---

## Async Runtime Considerations

The core SDK API shown here is synchronous.

If your transport is blocking and your application uses Tokio, avoid executing blocking network requests directly on an async worker thread.

Use `tokio::task::spawn_blocking`:

```rust
use std::sync::Arc;

use theaimart_adx::{AdRequest, Adx};

let adx = Arc::new(Adx::new("pk_your_publisher_key"));

let client = Arc::clone(&adx);

let ad = tokio::task::spawn_blocking(move || {
    client.request_ad(&AdRequest {
        slot_id: Some("homepage-banner"),
        ..Default::default()
    })
})
.await
.expect("blocking task should complete");
```

A custom async transport adapter may require a separate integration layer because the `HttpTransport` interface shown is synchronous.

Do not block the core async executor with long-running synchronous HTTP operations.

---

## Axum Integration

Conceptual Axum route using `spawn_blocking`:

```rust
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
};
use theaimart_adx::{render_html, AdRequest, Adx, UreqTransport};

#[derive(Clone)]
struct AppState {
    adx: Arc<Adx<UreqTransport>>,
}

async fn serve_ad(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let adx = Arc::clone(&state.adx);

    let ad = tokio::task::spawn_blocking(move || {
        adx.request_ad(&AdRequest {
            slot_id: Some("homepage-banner"),
            page_url: Some("https://example.com/current-page"),
            ..Default::default()
        })
    })
    .await;

    let Ok(ad) = ad else {
        return StatusCode::NO_CONTENT.into_response();
    };

    if !ad.filled {
        return StatusCode::NO_CONTENT.into_response();
    }

    Html(render_html(&ad, "homepage-banner")).into_response()
}
```

Adjust lifetimes, owned request fields, state bounds, and transport thread-safety according to the actual crate API.

---

## Actix Web Integration

Conceptual Actix Web handler:

```rust
use actix_web::{
    web,
    HttpResponse,
    Responder,
};
use theaimart_adx::{render_html, AdRequest, Adx, UreqTransport};

async fn serve_ad(
    adx: web::Data<Adx<UreqTransport>>,
) -> impl Responder {
    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("article-banner"),
        page_url: Some("https://example.com/article"),
        ..Default::default()
    });

    if !ad.filled {
        return HttpResponse::NoContent().finish();
    }

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(render_html(&ad, "article-banner"))
}
```

For blocking transports, use Actix Web's blocking facilities when necessary to avoid blocking async workers.

---

## Rocket Integration

Conceptual Rocket route:

```rust
use rocket::{
    get,
    http::Status,
    response::content::RawHtml,
    State,
};
use theaimart_adx::{render_html, AdRequest, Adx};

#[get("/ad")]
fn serve_ad(
    adx: &State<Adx>,
) -> Result<RawHtml<String>, Status> {
    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("rocket-banner"),
        page_url: Some("https://example.com/rocket-page"),
        ..Default::default()
    });

    if !ad.filled {
        return Err(Status::NoContent);
    }

    Ok(RawHtml(render_html(
        &ad,
        "rocket-banner",
    )))
}
```

Use Rocket request guards or forwarded-header handling to extract trusted user context where appropriate.

---

## Ad Response Model

`request_ad` returns an `Ad` value representing either a filled advertisement or a no-fill result.

Typical fields include:

| Field                 | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `filled`              | Whether an eligible advertisement was returned |
| `kind`                | Creative type                                  |
| `source`              | Demand source                                  |
| `imp_id`              | Impression identifier                          |
| `identity_id`         | Identity value returned by the backend         |
| `creative`            | Creative payload                               |
| `auction`             | Auction metadata                               |
| `reason`              | No-fill or failure reason                      |
| `retry_after_seconds` | Suggested retry delay                          |
| `raw`                 | Raw response data                              |
| `is_trackable()`      | Whether viewability can be reported            |

The exact field types and enum names are defined by the crate's public API.

### Filled advertisement

```rust
if ad.filled {
    println!("Advertisement available");
}
```

### No-fill response

```rust
if !ad.filled {
    println!("No fill: {:?}", ad.reason);
}
```

### Trackable advertisement

```rust
if ad.is_trackable() {
    if let Some(imp_id) = ad.imp_id.as_deref() {
        adx.report_viewable(imp_id);
    }
}
```

### Retry guidance

```rust
if !ad.filled {
    if let Some(delay) = ad.retry_after_seconds {
        println!("Retry after {delay} seconds");
    }
}
```

Do not implement immediate uncontrolled retry loops.

---

## Demand Sources

The SDK normalizes the contract-defined demand outcomes.

Typical sources include:

* Internal
* OpenRTB
* House

No-fill is represented by an unfilled `Ad`.

### Internal demand

An advertisement supplied through demand managed directly within Theaimart ADX.

### OpenRTB demand

An advertisement returned through an OpenRTB-compatible demand source or auction.

### House advertisement

A publisher- or platform-managed fallback advertisement.

House advertisements may not include a trackable impression identifier.

Always use:

```rust
ad.is_trackable()
```

instead of assuming every filled ad is trackable.

---

## Four-Way Response Parsing

The backend can return four logical outcomes:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The SDK normalizes these variants into one `Ad` model.

Conceptual handling:

```rust
if !ad.filled {
    handle_no_fill(&ad);
} else {
    match ad.source {
        AdSource::Internal => {
            handle_internal(&ad);
        }
        AdSource::OpenRtb => {
            handle_openrtb(&ad);
        }
        AdSource::House => {
            handle_house(&ad);
        }
    }
}
```

The SDK normalizes every filled response to one of these source variants.

Malformed or incomplete responses fail closed instead of becoming partially valid advertisements.

This prevents:

* Unsafe creative access
* Missing impression IDs
* Invalid demand-source assumptions
* Incorrect click behavior
* Incorrect viewability tracking
* Panics caused by malformed backend data

---

## Fail-Closed Error Handling

`request_ad` is designed to fail closed.

The following conditions produce an unfilled `Ad` rather than a panic or `Result::Err`:

* Missing slot configuration
* DNS failure
* Connection failure
* Request timeout
* Transport error
* Non-200 HTTP response
* HTTP 403
* HTTP 500
* Invalid JSON
* Missing required fields
* Unsupported response variant
* Malformed creative
* Invalid impression metadata

Default behavior:

```text
Operational failure → Ad { filled: false, ... }
```

Example:

```rust
let ad = adx.request_ad(&AdRequest::default());

if !ad.filled {
    eprintln!("No fill: {:?}", ad.reason);
}
```

This approach protects user-facing services from advertising failures.

Advertising should not crash or take down the primary application.

### No panic guarantee

Normal request failures should not require `catch_unwind`, error propagation, or special transport handling.

The SDK avoids panic-based control flow for expected operational conditions.

Application panics caused by unrelated misuse, memory exhaustion, poisoned synchronization primitives, or custom transport code remain outside the SDK's normal fail-closed contract.

---

## User-Agent and Fraud Classification

The SDK sends a dedicated User-Agent:

```text
theaimart-adx-rust/<version>
```

Example:

```text
theaimart-adx-rust/1.0.0
```

This User-Agent:

* Identifies the official Rust SDK
* Communicates the SDK version
* Avoids generic bot-like HTTP-client identifiers
* Prevents false bot-blocklist matches
* Supports backend traffic classification
* Reduces silent no-fill caused by blocked User-Agents

User-Agent behavior follows [CONTRACT.md section 6](../../CONTRACT.md).

### SDK User-Agent versus browser User-Agent

The SDK User-Agent identifies the Rust integration.

The current `AdRequest` does not accept a per-request browser User-Agent or client IP; its request headers use the configured SDK User-Agent.

These values serve different purposes:

| Value                | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| SDK User-Agent       | Identifies `theaimart-adx`                     |
| Page and privacy fields | Supplies publisher page and consent context |

Without real user context, unrelated requests can appear to originate from one server process.

---

## SQL-Filter-Safe Encoding

Real URLs and page metadata commonly contain strings that resemble SQL keywords or security-sensitive text.

Examples include:

```text
end
open
cast
select
@
```

These values can appear naturally in:

* Page URLs
* Query parameters
* Article slugs
* Email-like identifiers
* Search terms
* Page keywords
* Campaign parameters
* Application routes

A strict backend Web Application Firewall can reject raw query parameters containing such patterns.

The SDK byte-percent-encodes contract-defined free-text values before transmission.

Example input:

```text
https://example.com/open-source/backend?author=user@example.com
```

The SDK applies the required encoding before building the final request.

This behavior:

* Preserves legitimate URLs
* Prevents malformed query construction
* Avoids WAF false positives
* Supports URLs containing reserved-looking strings
* Produces deterministic request values
* Prevents normal page URLs from causing HTTP 403 responses
* Keeps backend filtering compatible with real application traffic

The encoding rules follow [CONTRACT.md section 7](../../CONTRACT.md).

Do not manually pre-encode values unless the wire contract explicitly requires it.

Double encoding can change the intended value.

---

## HTML Rendering Security

The `render_html` helper is designed to reduce common server-side creative-rendering risks.

### Attribute escaping

Creative values inserted into HTML attributes are escaped.

This protects against malformed values that attempt to break out of an attribute context.

Characters requiring escaping can include:

```text
&
<
>
"
'
```

### Click URL scheme restriction

Only `http://` and `https://` click URLs are converted into links.

Unsafe or unsupported schemes are dropped.

Examples rejected by the renderer include:

```text
javascript:
file:
intent:
data:
vbscript:
```

### No unsafe Rust

The crate uses:

```rust
#![forbid(unsafe_code)]
```

This ensures unsafe Rust blocks cannot be introduced into the crate without changing the crate-level policy.

### Application responsibilities

The host application should still:

* Use an appropriate Content Security Policy
* Avoid disabling template escaping globally
* Validate custom creative renderers
* Avoid directly rendering the `raw` response
* Restrict external content
* Use HTTPS in production
* Avoid injecting creative values into scripts
* Avoid broadly allowing inline JavaScript

---

## Content Security Policy

Server-rendered advertising can require external image, frame, or network access.

Review directives such as:

```text
img-src
frame-src
script-src
style-src
connect-src
default-src
```

Do not broadly weaken your Content Security Policy.

Prefer narrowly scoped domains and creative capabilities.

Example concept:

```http
Content-Security-Policy:
  default-src 'self';
  img-src 'self' https:;
  frame-src https:;
  object-src 'none';
  base-uri 'self';
```

The correct policy depends on the creative formats and demand sources enabled for your account.

---

## API Reference

## `Adx::new`

Creates a client using the default transport when the `ureq` feature is enabled.

```rust
let adx = Adx::new(
    "pk_your_publisher_key",
);
```

The client can include default configuration for:

* Publisher API key
* Base API URL
* Timeout
* SDK User-Agent
* Built-in transport

Use the exact constructors exposed by the installed crate version.

---

## `Adx::with_transport`

Creates a client with a custom transport.

```rust
let adx = Adx::with_transport(
    "pk_your_publisher_key",
    MyTransport,
);
```

This is available when using a custom `HttpTransport`, including with default features disabled.

---

## `request_ad`

Requests an advertisement.

```rust
let ad = adx.request_ad(&AdRequest {
    slot_id: Some("your-slot-id"),
    ..Default::default()
});
```

Returns an `Ad` directly.

Normal operational failures produce an unfilled `Ad`.

---

## `report_viewable`

Reports a viewable impression.

```rust
let success = adx.report_viewable(
    impression_id,
);
```

This operation is best effort and returns a success indicator according to the crate API.

Only report a valid impression ID returned by the SDK.

---

## `render_html`

Renders a supported advertisement as HTML.

```rust
let html = render_html(
    &ad,
    "theaimart-adx",
);
```

The helper:

* Escapes attribute values
* Supports normalized creative types
* Restricts click URLs to HTTP and HTTPS
* Returns safe no-output behavior for unsupported or no-fill responses

Verify the exact rendering behavior against the crate version you publish.

---

## `AdRequest`

Defines an advertisement request.

```rust
let request = AdRequest {
    slot_id: Some("your-slot-id"),
    page_url: Some("https://example.com/page"),
    ..Default::default()
};
```

Contract-supported fields can include:

* `slot_id`
* `slot_name`
* `page_url`
* `page_keywords`
* `us_privacy`
* `euconsent_v2`
* `identity_cookie`

Use the exact field names, lifetimes, and owned or borrowed types exported by the crate.

---

## `HttpTransport`

Defines the synchronous transport contract.

```rust
pub trait HttpTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError>;

    fn post(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &[u8],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError>;
}
```

The actual trait definition in the crate source remains authoritative.

---

## Production Architecture

A common Rust server-side architecture is:

```text
Browser
   │
   │ page request
   ▼
Rust web application
   │
   │ request_ad with page and trusted user context
   ▼
Theaimart ADX
   │
   │ normalized Ad response
   ▼
Rust web application
   │
   │ HTML or JSON response
   ▼
Browser
   │
   │ measure ≥50% visibility for ≥1 second
   ▼
Rust viewability endpoint
   │
   │ report_viewable
   ▼
Theaimart ADX
```

### Backend responsibilities

* Store publisher configuration
* Request advertisements
* Forward trusted page and user context
* Handle no-fill safely
* Render HTML or structured creative data
* Expose a viewability endpoint
* Validate impression IDs
* Apply rate limits
* Enforce timeouts
* Log operational outcomes safely

### Frontend responsibilities

* Display the advertisement
* Measure viewability
* Report one viewability event
* Handle intentional clicks
* Preserve accessible layout
* Collapse no-fill placements
* Prevent accidental interaction
* Avoid automatic navigation

---

## Client Reuse

Create and reuse a shared `Adx` client where configuration is identical.

```rust
use std::sync::Arc;

use theaimart_adx::Adx;

let adx = Arc::new(
    Adx::new("pk_your_publisher_key"),
);
```

Store it in:

* Axum application state
* Actix `web::Data`
* Rocket managed state
* A dependency-injection container
* A shared service struct

Avoid creating a new HTTP transport for every request unless isolation is required.

Client reuse can reduce:

* Connection setup
* Memory allocation
* Configuration duplication
* TLS initialization
* Per-request overhead

Custom transports should be implemented with appropriate `Send` and `Sync` properties for the target framework.

---

## Timeouts and Retry Behavior

Advertising should not delay the primary page indefinitely.

Use a bounded timeout appropriate for:

* Server-rendering latency
* Auction requirements
* Geographic network conditions
* Page-response budgets
* Fallback behavior
* User experience

When a timeout occurs, the SDK returns an unfilled `Ad`.

### Retry guidance

No-fill is not always an error.

It can result from:

* No eligible campaign
* Targeting mismatch
* Geographic restrictions
* Privacy state
* Frequency limits
* Fraud-risk classification
* Temporary demand shortage
* Auction timeout
* Backend retry policy

Respect `retry_after_seconds` where available.

Do not:

* Retry recursively
* Retry immediately in a tight loop
* Send parallel duplicate requests
* Ignore backend retry guidance
* Generate duplicate impressions
* Block page rendering while repeatedly requesting ads

---

## Security Guidance

### Use the correct publisher key

Provide only the key intended for publisher ad requests:

```text
pk_your_publisher_key
```

Do not provide:

* Administrative API keys
* Cloud access credentials
* Database passwords
* Private signing keys
* Infrastructure tokens
* Billing credentials
* Internal service secrets

### Store configuration outside source code

Example:

```rust
use std::env;

use theaimart_adx::Adx;

let api_key = env::var(
    "THEAIMART_ADX_PUBLISHER_KEY",
)
.expect(
    "THEAIMART_ADX_PUBLISHER_KEY must be set",
);

let adx = Adx::new(api_key);
```

Adjust the constructor argument type according to the crate API.

### Validate impression IDs

Before accepting an impression ID from a public HTTP route, validate it according to the wire contract.

Conceptual validation:

```rust
fn valid_imp_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|byte| {
                byte.is_ascii_alphanumeric()
                    || byte == b'_'
                    || byte == b'-'
            })
}
```

Use the actual contract-defined format instead of assuming this example is authoritative.

### Apply rate limits

Protect:

* Ad-request endpoints
* Viewability endpoints
* Click-tracking proxies
* Debug endpoints
* Ad-preview tooling

### Avoid sensitive logging

Do not unnecessarily log:

* Publisher API keys
* Full identity cookies
* Full consent strings
* Raw user IP addresses
* Entire raw creative payloads
* Private request headers

---

## Privacy Signals

Where supported by `AdRequest`, forward accurate privacy values:

```rust
let request = AdRequest {
    slot_id: Some("privacy-aware-slot"),
    us_privacy: Some("1YNN"),
    euconsent_v2: Some(consent_string),
    ..Default::default()
};
```

The host application remains responsible for:

* Determining applicable privacy obligations
* Collecting valid consent
* Respecting opt-out choices
* Forwarding accurate signals
* Maintaining a privacy policy
* Configuring identity behavior
* Avoiding ad requests that conflict with user preferences

Do not fabricate consent strings.

The SDK transports the supplied values but does not determine legal compliance.

---

## Identity Values

Where supported, pass an identity value:

```rust
let request = AdRequest {
    slot_id: Some("identity-enabled-slot"),
    identity_cookie: Some(identity_value),
    ..Default::default()
};
```

Treat identity values as untrusted input.

Applications should:

* Validate size and format
* Avoid unnecessary logging
* Respect privacy state
* Avoid treating identity values as authentication
* Avoid exposing them to unrelated services
* Follow the wire contract
* Apply appropriate retention controls

---

## Observability

Useful production metrics include:

* Total ad requests
* Filled responses
* No-fill responses
* Fill rate
* Requests by slot
* Requests by demand source
* Request latency
* Transport failures
* Timeout count
* HTTP 403 count
* HTTP 500 count
* Parsing failure count
* Viewability-report success rate
* Viewability-report failure rate
* Retry-after distribution

Example structured logging:

```rust
use std::time::Instant;

let started = Instant::now();

let ad = adx.request_ad(&request);

tracing::info!(
    event = "theaimart_ad_request",
    slot_id = ?request.slot_id,
    filled = ad.filled,
    reason = ?ad.reason,
    duration_ms = started.elapsed().as_millis(),
);
```

Avoid logging complete identity, consent, IP, or raw creative values without a clear requirement and retention policy.

---

## Testing

The crate supports two important test modes.

### Default feature tests

```bash
cargo test
```

This tests the crate with the default `ureq` transport enabled.

Coverage can include:

* Request encoding
* Response parsing
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill behavior
* HTML rendering
* URL scheme restrictions
* Transport behavior
* Viewability reporting
* Local mock-server integration
* WAF regression testing

### Zero-dependency core tests

```bash
cargo test --no-default-features
```

This verifies the transport-agnostic core without `ureq`.

Coverage can include:

* Request building
* Encoding
* Parsing
* Model behavior
* Safe HTML generation
* No-fill handling
* Custom transport compatibility

---

## Recommended Test Matrix

| Scenario                 | Expected behavior                |
| ------------------------ | -------------------------------- |
| Internal filled response | Parsed as internal demand        |
| OpenRTB response         | Parsed as OpenRTB demand         |
| House response           | Parsed as house demand           |
| No-fill response         | `filled == false`                |
| Missing slot             | Safe no-fill                     |
| Invalid JSON             | Safe no-fill                     |
| HTTP 403                 | Safe no-fill                     |
| HTTP 500                 | Safe no-fill                     |
| Timeout                  | Safe no-fill                     |
| Transport error          | Safe no-fill                     |
| Missing impression ID    | Not trackable                    |
| Valid impression ID      | `is_trackable()` is true         |
| SQL-like page URL        | Correctly encoded                |
| Safe HTTPS click URL     | Rendered as a link               |
| Safe HTTP click URL      | Rendered as a link               |
| `javascript:` click URL  | Link removed                     |
| `file:` click URL        | Link removed                     |
| Malformed attribute data | Escaped                          |
| No default features      | Core compiles and tests          |
| Custom transport         | Request succeeds through adapter |

---

## Mock Transport Testing

A mock transport can return deterministic responses.

```rust
use std::time::Duration;

use theaimart_adx::transport::{
    HttpResponse,
    HttpTransport,
    TransportError,
};

struct MockTransport {
    response: HttpResponse,
}

impl HttpTransport for MockTransport {
    fn get(
        &self,
        _url: &str,
        _headers: &[(&str, &str)],
        _timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        Ok(self.response.clone())
    }

    fn post(
        &self,
        _url: &str,
        _headers: &[(&str, &str)],
        _body: &[u8],
        _timeout: Duration,
    ) -> Result<HttpResponse, TransportError> {
        Ok(self.response.clone())
    }
}
```

Use the exact clone behavior and response types exposed by the crate.

A mock transport can simulate:

* Filled responses
* No-fill
* HTTP 403
* HTTP 500
* Invalid JSON
* Missing fields
* Viewability success
* Viewability failure
* Timeout errors
* WAF rejection
* Unsafe click URLs

---

## End-to-End WAF Test

The default test suite can include a local HTTP server that reproduces backend WAF behavior.

The test should verify that values such as:

```text
https://example.com/open-source/backend?author=user@example.com
```

are safely encoded before transmission.

Conceptual test:

```rust
#[test]
fn waf_sensitive_page_url_is_encoded() {
    let adx = Adx::with_base_url(
        "pk_test",
        mock_server_url(),
    );

    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("test-slot"),
        page_url: Some(
            "https://example.com/open-source/backend?author=user@example.com",
        ),
        ..Default::default()
    });

    assert!(ad.filled);
}
```

Use the exact test constructors exposed by the crate.

---

## Development

Enter the Rust package directory:

```bash
cd packages/rust
```

Run the default test suite:

```bash
cargo test
```

Test without default features:

```bash
cargo test --no-default-features
```

Run formatting checks:

```bash
cargo fmt --all --check
```

Run Clippy:

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

Build the crate:

```bash
cargo build
```

Build a release artifact:

```bash
cargo build --release
```

Generate documentation:

```bash
cargo doc --all-features --no-deps
```

Open generated documentation:

```bash
cargo doc --all-features --no-deps --open
```

Recommended verification:

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo test --no-default-features
cargo build --release
cargo doc --all-features --no-deps
```

---

## Publishing Checklist

Before publishing a crate release:

1. Update the crate version.
2. Update the SDK User-Agent version.
3. Verify wire contract v1 compatibility.
4. Run formatting checks.
5. Run Clippy with warnings denied.
6. Run default-feature tests.
7. Run no-default-feature tests.
8. Run the WAF regression test.
9. Verify safe URL scheme handling.
10. Verify HTML attribute escaping.
11. Build release mode.
12. Generate crate documentation.
13. Verify Cargo metadata.
14. Verify the README examples compile.
15. Confirm the license and repository fields.
16. Confirm `ureq` remains optional.
17. Confirm the zero-dependency core compiles.
18. Confirm `unsafe` code is forbidden.
19. Review public API changes.
20. Publish only after all checks succeed.

Useful command:

```bash
cargo publish --dry-run
```

---

## Frequently Asked Questions

### What is `theaimart-adx`?

It is the official Rust SDK for integrating Theaimart ADX advertising into server-side Rust applications.

### Is this a server-side SDK?

Yes. It is designed primarily for Rust backends, websites, services, and server-to-server integrations.

### Does it support Axum?

Yes. The SDK can be used inside Axum applications.

When using the default blocking transport, run the request inside `spawn_blocking`.

### Does it support Actix Web?

Yes. Use Actix's blocking facilities if the selected transport performs blocking I/O.

### Does it support Rocket?

Yes. Store the client as managed state and call it from route handlers.

### Does the crate require `ureq`?

No.

`ureq` is enabled by default but can be disabled:

```toml
theaimart-adx = {
    version = "1.0",
    default-features = false
}
```

### Does the core have dependencies?

The transport-agnostic core is designed to have zero dependencies.

### Can I use `reqwest`?

Yes. Implement `HttpTransport` using `reqwest`.

### Can I use `hyper`?

Yes. Wrap your Hyper-based client behind `HttpTransport`.

Because the shown transport trait is synchronous, an async integration may need a bridge or separate adapter design.

### Does `request_ad` return a `Result`?

The documented design returns an `Ad` directly.

Operational failures become an unfilled ad.

### Can `request_ad` panic?

Normal missing-slot, transport, timeout, parsing, and non-200 failures are designed to fail closed rather than panic.

### What does fail-closed mean?

An operational failure becomes an unfilled `Ad` instead of crashing the application or exposing an invalid creative.

### Why does the SDK encode page URLs?

Normal URLs can contain SQL-like strings that trigger backend WAF rules. The SDK applies contract-compliant encoding to prevent false-positive rejection.

### Should I encode `page_url` manually?

Normally, no. Pass the original value and let the SDK apply the required encoding.

### Why does the SDK use a custom User-Agent?

Generic HTTP-client User-Agents can be classified as bot traffic. The SDK sends:

```text
theaimart-adx-rust/<version>
```

### Does the SDK support OpenRTB?

Yes. OpenRTB responses are normalized into the shared `Ad` model.

### What is a house advertisement?

A house advertisement is publisher- or platform-managed fallback inventory.

### Are house ads trackable?

Not necessarily. Use `ad.is_trackable()`.

### Can the SDK render HTML?

Yes. Use:

```rust
render_html(&ad, "css-class")
```

### Is rendered HTML escaped?

The renderer escapes HTML attribute values.

### Does the renderer allow `javascript:` links?

No. Only HTTP and HTTPS click URLs are converted into links.

### Does the crate use unsafe Rust?

The crate forbids unsafe code through:

```rust
#![forbid(unsafe_code)]
```

### Should I report viewability immediately?

No. Report only after the frontend confirms that the advertisement was at least 50% visible for at least one second.

### What happens after no-fill?

Render nothing, collapse the placement, or show normal application content.

### Should I retry immediately?

No. Respect retry guidance and avoid tight retry loops.

### Can I reuse one `Adx` client?

Yes. Reuse a shared client where configuration is identical.

### Is the publisher key secret?

Use only the publisher key intended for the integration. Do not provide administrative or infrastructure credentials.

### Can I use the crate in an async runtime?

Yes, but the default transport is blocking. Use `spawn_blocking` or provide an appropriate integration.

### Can I test without making network requests?

Yes. Implement a mock `HttpTransport`.

### Does it compile without the default transport?

Yes. Test it with:

```bash
cargo test --no-default-features
```

---

## Rust Website Monetization with Theaimart ADX

The Theaimart ADX Rust SDK is intended for developers building:

* Axum web applications
* Actix Web services
* Rocket applications
* Warp services
* Rust APIs
* Server-rendered websites
* Publisher platforms
* Content-management systems
* News websites
* Blogs
* AI applications
* SaaS products
* Developer tools
* Ad-operations systems
* Server-to-server integrations
* High-performance backend services
* Privacy-focused software
* Local-first application backends

The crate provides a lightweight, secure, transport-independent connection to Theaimart ADX while preserving Rust's performance, type safety, and explicit control over dependencies.

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
* End-user context
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
* Failure handling
* Creative representation

The Rust SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response variants, encoding behavior, rendering semantics, tracking behavior, or transport expectations should be introduced through an explicit wire-contract version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
