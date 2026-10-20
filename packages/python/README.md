# Theaimart ADX Python SDK

The official **Theaimart ADX SDK for Python**, designed for server-side advertising, website monetization, backend ad decisioning, publisher integrations, and ad-operations tooling.

`theaimart-adx` allows Python applications to request, normalize, render, and track advertisements through the [Theaimart Ad Network](https://adx.theaimart.co).

The SDK is:

* Zero-runtime-dependency
* Built entirely with the Python standard library
* Designed primarily for server-side integrations
* Compatible with Django, Flask, FastAPI, and other Python frameworks
* Suitable for server-to-server ad decisioning
* Typed through Python annotations
* Fraud-aware
* WAF-safe
* Fail-closed by default
* Compatible with Theaimart ADX wire contract v1

```bash
pip install theaimart-adx
```

> **Package:** `theaimart-adx`
> **Import:** `theaimart_adx`
> **Primary use case:** Server-side ad serving
> **Runtime dependencies:** None
> **License:** Apache License 2.0

---

## Features

* Official Theaimart ADX Python SDK
* Server-side website monetization
* Django integration
* Flask integration
* FastAPI integration
* Server-to-server ad decisioning
* Python standard-library networking
* Zero runtime dependencies
* Internal demand support
* OpenRTB demand support
* House-ad support
* Unified no-fill handling
* End-user User-Agent forwarding
* End-user IP forwarding
* Page URL and keyword targeting
* Privacy-signal forwarding
* Identity-cookie support
* SQL-filter-safe parameter encoding
* Fraud-safe SDK User-Agent
* Configurable request timeout
* Injectable transport layer
* Testable network behavior
* HTML-rendering helper
* Viewability reporting
* Click-tracking URL generation
* Retry guidance
* Fail-closed production behavior
* Optional exception mode
* Compatibility with Theaimart ADX wire contract v1

---

## Before you ship: what the ad server actually does

These are properties of the live ad server (`theaimart-adnetwork`), verified against its source —
see `CONTRACT.md` §3, §5, §6 and §8 for the detail.

1. **Every request is attributed to your server's IP.**
   `client_ip` is sent as `X-Forwarded-For`, but the ad server deliberately reads only the entry its
   own proxy appends, so any value a client writes is ignored (it is what stops IP spoofing past the
   rate limits).
   So all of your users share one per-IP limit (60 ad requests/minute by default — then `429`),
   geo targeting sees your server's location, and a cloud IP adds to the fraud score. Server-side
   serving suits low-volume pages (server-rendered HTML, emails, previews). For user-facing traffic
   at scale, render on the user's device with the Web or mobile SDK.
2. **Forward the user's User-Agent** (`user_agent`). It still drives device targeting and the bot filter.
3. **A site's `api_key` has 100 ad requests per minute in total**, across all of its users.
4. **An internal fill is billed when it is served**, not when it is seen. Request an ad only when
   you will show it.
5. **Report a view only after it was measured** (≥50% on screen for ≥1 s, e.g. by your frontend).
   Calling `report_viewable(imp_id)` just because the HTML was sent reports a view nobody saw.
   It returns true only when the server recorded the view. A beacon that arrives before the
   impression is written is answered "not yet" — `report_viewable_outcome(imp_id)` returns `ViewableOutcome.RETRY` for that, and
   resending the same id a second or two later is safe (the rendering SDKs do this automatically).
6. **Privacy signals:** pass `us_privacy` / `euconsent_v2`, and `gpp` / `gpp_sid` (IAB GPP). A US section
   in the GPP section ids (7–12) makes the request contextual-only.

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Python SDK?](#why-use-the-python-sdk)
* [Requirements](#requirements)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Critical End-User Context](#critical-end-user-context)
* [Django Integration](#django-integration)
* [Flask Integration](#flask-integration)
* [FastAPI Integration](#fastapi-integration)
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
* [Observability](#observability)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for publishers, developers, websites, software businesses, and digital products.

The Python SDK connects a Python backend to the Theaimart advertising infrastructure.

It allows an application to:

1. Authenticate with a public publisher API key.
2. Request an advertisement for a configured slot.
3. Forward real end-user browser and network context.
4. Receive an internal, OpenRTB, house, or no-fill response.
5. Normalize the backend response into one `Ad` object.
6. Render supported creatives as HTML.
7. Report viewable impressions.
8. Generate registered click-tracking URLs.
9. Handle network and parsing failures safely.
10. Monetize eligible application or website traffic.

The package is primarily intended for server-side use cases such as:

* Django-rendered websites
* Flask applications
* FastAPI backends
* Publisher platforms
* Content-management systems
* Server-side ad decisioning
* Internal ad-operations tools
* Python automation and reporting systems
* Backend-for-frontend services
* Server-rendered pages

---

## Why use the Python SDK?

Server-side advertising integrations require more than simply calling an HTTP endpoint.

When all requests originate from one backend server, the advertising platform may otherwise see:

* One server IP address
* One generic Python User-Agent
* No real browser information
* No device information
* No page context
* No identity continuity
* No privacy signals
* Repeated impressions that appear automated

This can lead to:

* Fraud-risk classification
* Silent no-fill responses
* Incorrect device classification
* Incorrect geographic classification
* Reduced fill rate
* Inaccurate reporting
* Poor auction decisions
* Invalid traffic signals

`theaimart-adx` addresses these issues by allowing applications to forward:

* The end user's User-Agent
* The end user's IP address
* The page URL
* Page keywords
* Consent and privacy signals
* Identity-cookie values

The SDK also applies contract-compliant encoding to free-text parameters so normal page URLs do not trigger backend Web Application Firewall rules.

---

## Requirements

The SDK requires:

* A supported Python 3 environment
* A valid Theaimart ADX public publisher key
* A configured ad slot ID or slot name
* Network access to the Theaimart ADX API

Check your Python version:

```bash
python --version
```

Use a maintained Python version suitable for your production environment.

The package has no third-party runtime dependencies and uses only Python standard-library modules for networking, parsing, encoding, and data handling.

---

## Installation

Install from PyPI:

```bash
pip install theaimart-adx
```

Using the Python module form:

```bash
python -m pip install theaimart-adx
```

Using Poetry:

```bash
poetry add theaimart-adx
```

Using uv:

```bash
uv add theaimart-adx
```

Using Pipenv:

```bash
pipenv install theaimart-adx
```

Import the SDK:

```python
from theaimart_adx import Adx
```

---

## Quick Start

Create a reusable `Adx` client:

```python
from theaimart_adx import Adx

adx = Adx(
    api_key="pk_your_publisher_key",
)
```

Request an advertisement:

```python
ad = adx.request_ad(
    slot_id="8b1f2c3d-0000-0000-0000-000000000000",
    page_url="https://example.com/articles/python-advertising",
)
```

Handle the result:

```python
if ad.filled:
    print(f"Filled by {ad.source}")
else:
    print(f"No fill: {ad.reason}")
```

Render a supported advertisement as HTML:

```python
if ad.filled:
    html_snippet = Adx.render_html(ad)
```

Report a viewable impression — only once your frontend has measured it ≥50% on screen for ≥1s:

```python
reported = adx.report_viewable(imp_id)  # True only when the server recorded it
```

Generate a click URL:

```python
if ad.imp_id:
    click_url = adx.click_url(ad.imp_id)
```

---

## Critical End-User Context

When requesting an advertisement from a Python backend, forward the real end user's context.

Do not send only the server's network identity.

Incomplete integration:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
)
```

In this scenario, every request may appear to originate from the same Python server.

Recommended integration:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    page_url="https://example.com/current-page",
    user_agent=incoming_request.headers.get("User-Agent"),
    client_ip=incoming_request.remote_addr,
)
```

Forwarding real end-user context helps the backend evaluate:

* Browser family
* Operating system
* Device category
* Network source
* Geographic context
* Repeated-impression behavior
* Fraud-risk signals
* Auction eligibility
* Campaign targeting

### Proxy-header warning

Do not blindly trust headers such as:

```text
X-Forwarded-For
X-Real-IP
CF-Connecting-IP
```

Only trust forwarding headers when they are set by reverse proxies, load balancers, or CDN infrastructure that you control or explicitly trust.

An untrusted client can forge forwarding headers.

Configure client-IP extraction according to your actual infrastructure, such as:

* Cloudflare
* Nginx
* AWS Application Load Balancer
* Google Cloud Load Balancer
* Kubernetes ingress
* Traefik
* HAProxy

---

## Django Integration

### Basic Django view

```python
from django.http import HttpResponse
from theaimart_adx import Adx

adx = Adx(
    api_key="pk_your_publisher_key",
)


def ad_view(request):
    ad = adx.request_ad(
        slot_id="8b1f2c3d-0000-0000-0000-000000000000",
        page_url=request.build_absolute_uri(),
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.META.get("REMOTE_ADDR"),
    )

    if not ad.filled:
        return HttpResponse(status=204)

    return HttpResponse(
        Adx.render_html(ad),
        content_type="text/html; charset=utf-8",
    )
```

### Rendering inside a Django template

```python
from django.shortcuts import render
from theaimart_adx import Adx

adx = Adx(
    api_key="pk_your_publisher_key",
)


def article_page(request, slug):
    ad = adx.request_ad(
        slot_id="article-banner-slot",
        page_url=request.build_absolute_uri(),
        page_keywords="python,development,technology",
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.META.get("REMOTE_ADDR"),
    )

    ad_html = Adx.render_html(ad) if ad.filled else ""

    return render(
        request,
        "articles/detail.html",
        {
            "slug": slug,
            "ad": ad,
            "ad_html": ad_html,
        },
    )
```

Template example:

```django
{% if ad.filled %}
  <aside class="article-ad">
    {{ ad_html|safe }}
  </aside>
{% endif %}
```

Only mark the result as safe when the SDK's HTML-rendering trust model is acceptable for your application.

Review your Content Security Policy before rendering external or HTML-based creatives.

### Django viewability endpoint

```python
from django.http import JsonResponse


def report_ad_viewable(request, imp_id):
    success = adx.report_viewable(
        imp_id,
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.META.get("REMOTE_ADDR"),
    )

    if not success:
        return JsonResponse({}, status=204)

    return JsonResponse({"reported": True})
```

---

## Flask Integration

```python
from flask import Flask, Response, request
from theaimart_adx import Adx

app = Flask(__name__)

adx = Adx(
    api_key="pk_your_publisher_key",
)


@app.get("/ad")
def serve_ad():
    ad = adx.request_ad(
        slot_id="8b1f2c3d-0000-0000-0000-000000000000",
        page_url=request.url,
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.remote_addr,
    )

    if not ad.filled:
        return Response(status=204)

    return Response(
        Adx.render_html(ad),
        status=200,
        content_type="text/html; charset=utf-8",
    )
```

### Flask JSON response

```python
from flask import jsonify


@app.get("/api/ad")
def serve_ad_json():
    ad = adx.request_ad(
        slot_id="homepage-banner",
        page_url=request.url,
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.remote_addr,
    )

    if not ad.filled:
        return Response(status=204)

    return jsonify(
        {
            "filled": ad.filled,
            "kind": ad.kind.value,
            "source": ad.source.value,
            "imp_id": ad.imp_id,
            "creative": ad.creative,
            "click_url": (
                adx.click_url(ad.imp_id)
                if ad.imp_id
                else None
            ),
        }
    )
```

A JSON response is useful when a browser frontend is responsible for:

* Rendering the creative
* Measuring viewability
* Reporting the impression
* Handling click behavior
* Managing the placement lifecycle

---

## FastAPI Integration

The Python SDK exposes a synchronous client API.

When using it inside an asynchronous FastAPI route, avoid blocking the event loop during network I/O.

### Synchronous FastAPI route

```python
from fastapi import FastAPI, Request, Response
from theaimart_adx import Adx

app = FastAPI()

adx = Adx(
    api_key="pk_your_publisher_key",
)


@app.get("/ad")
def serve_ad(request: Request):
    ad = adx.request_ad(
        slot_id="8b1f2c3d-0000-0000-0000-000000000000",
        page_url=str(request.url),
        user_agent=request.headers.get("user-agent"),
        client_ip=(
            request.client.host
            if request.client
            else None
        ),
    )

    if not ad.filled:
        return Response(status_code=204)

    return Response(
        content=Adx.render_html(ad),
        media_type="text/html",
    )
```

### Async FastAPI route with thread offloading

```python
import asyncio

from fastapi import FastAPI, Request, Response
from theaimart_adx import Adx

app = FastAPI()

adx = Adx(
    api_key="pk_your_publisher_key",
)


@app.get("/ad-async")
async def serve_ad_async(request: Request):
    client_ip = (
        request.client.host
        if request.client
        else None
    )

    ad = await asyncio.to_thread(
        adx.request_ad,
        slot_id="8b1f2c3d-0000-0000-0000-000000000000",
        page_url=str(request.url),
        user_agent=request.headers.get("user-agent"),
        client_ip=client_ip,
    )

    if not ad.filled:
        return Response(status_code=204)

    return Response(
        content=Adx.render_html(ad),
        media_type="text/html",
    )
```

Use the concurrency model appropriate for your Python version and deployment.

---

## App UI Frameworks (Flet, Kivy, Streamlit)

Django/Flask/FastAPI use this SDK **server-side**: your server asks for the ad and puts it in a
page. The three adapters below are different — they are *client* surfaces where the Python
process is the app the user is looking at, so the SDK also owns the ad's whole lifetime.

All three implement [CONTRACT.md §9](../../CONTRACT.md) through one shared, unit-tested driver
(`theaimart_adx.fill.AdFill`):

* **Continuous fill (§9a).** Set `refresh_seconds` and the slot keeps itself filled. Anything that
  does not render backs off 30s → 60s → 120s → 240s → 300s and keeps trying, honouring
  `Retry-After`. One no-fill never leaves a slot dark. Leave it at `0` for a single shot.
* **Visibility gating (§9b).** No request goes out while the app is backgrounded or the banner is
  off screen, and a slot that comes back overdue refills immediately.
* **The viewability rule (§9c).** The beacon is armed *only* by a creative that actually drew. The
  SDK downloads and decode-checks the creative itself before anything is displayed, so an asset
  that 404s — or answers `200` with an HTML error page — is never reported as a view. It counts as
  a failure and the slot refills instead.

OpenRTB (`creative.html`) needs a WebView. Flet and Kivy have none, so those fills are refused
rather than silently swallowed; Streamlit renders them in a sandboxed iframe.

### Flet

```bash
pip install "theaimart-adx[flet]"
```

```python
import flet as ft
from theaimart_adx.integrations.flet import BannerAd

def main(page: ft.Page):
    banner = BannerAd(
        page,
        api_key="pk_...",
        slot_id="8b1f-uuid",
        refresh_seconds=60,
        border_radius=12,
        elevated=True,
    )
    page.add(ft.Column([ft.Text("My app"), banner.control]))
    banner.start()

ft.app(main)
```

> **Viewability caveat.** Flet exposes no geometry for a control, so the default
> `visible_fraction` reports "the control is visible and the app is in the foreground" — not a
> measurement of 50% of the pixels. That is accurate for a banner pinned to an app bar or bottom
> bar. If you place the banner inside a scrollable, pass your own `visible_fraction` callable, or
> set `verify_creative=False` to disable beacons entirely rather than over-report.

### Kivy (and migrating from KivMob)

```bash
pip install "theaimart-adx[kivy]"
```

```python
from theaimart_adx.integrations.kivy import BannerAd

banner = BannerAd(api_key="pk_...", slot_id="8b1f-uuid", refresh_seconds=60)
layout.add_widget(banner)
banner.start()
```

Kivy is the strongest Python surface for this: widgets expose real geometry, so viewability is a
genuine "≥50% of the widget inside the window for ≥1 continuous second" measurement, the same as
the Android and iOS SDKs.

Coming from KivMob? `AdxAds` mirrors its call shape:

```python
from theaimart_adx.integrations.kivy import AdxAds

ads = AdxAds("pk_...")                              # no separate app id needed
ads.new_banner("8b1f-uuid", refresh_seconds=60)
ads.request_banner()
ads.show_banner()
```

With `refresh_seconds` set, `request_banner()` is only needed to force an immediate refresh — the
banner keeps itself filled.

### Streamlit

```bash
pip install "theaimart-adx[streamlit]"
```

```python
import streamlit as st
from theaimart_adx.integrations.streamlit import banner

st.title("My app")
banner(api_key="pk_...", slot_id="8b1f-uuid", refresh_seconds=60)
```

Streamlit is the one Python surface where the **browser** draws the ad, so the component ships the
same §9 logic in JavaScript (a test executes it under Node against the same conformance table the
Python implementation uses, so the two cannot drift). The ad call comes from the visitor's browser,
so it is their device and IP that are measured — your Streamlit server never sees it.

> **Rerun model.** The generated HTML is deterministic, so Streamlit reuses the same iframe across
> reruns and the fill loop survives. Pass an argument that changes every rerun (a timestamp, a
> random id) and the component remounts, requesting a fresh ad each time — that will hit the
> per-key rate limit.

## Direct Client Usage

Create the client:

```python
from theaimart_adx import Adx

adx = Adx(
    api_key="pk_your_publisher_key",
)
```

Create it once and reuse it. The default transport keeps a process-wide pool of keep-alive
connections (thread-safe, reset after `fork`), so the TCP + TLS handshake is paid once rather than
on every ad request — against production this cut the median request from ~456 ms to ~328 ms.
When `HTTPS_PROXY` / `HTTP_PROXY` is set for the ad server's host, requests go through `urllib`
instead, which implements the proxy protocol. `adx.close()` (or `with Adx(...) as adx:`) releases
idle connections; it is optional.

Request an advertisement:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    page_url="https://example.com/page",
    page_keywords="python,backend,development",
    user_agent="Mozilla/5.0 ...",
    client_ip="203.0.113.10",
)
```

Handle no-fill:

```python
if not ad.filled:
    print(
        {
            "reason": ad.reason,
            "retry_after_seconds": ad.retry_after_seconds,
        }
    )
```

Handle a filled response:

```python
if ad.filled:
    print(
        {
            "source": ad.source,
            "kind": ad.kind,
            "imp_id": ad.imp_id,
            "creative": ad.creative,
        }
    )
```

---

## Rendering Advertisements

The SDK includes a static HTML-rendering helper:

```python
html_snippet = Adx.render_html(ad)
```

Provide a CSS class:

```python
html_snippet = Adx.render_html(
    ad,
    css_class="theaimart-ad-placement",
)
```

Example:

```python
if not ad.filled:
    html_snippet = ""
else:
    html_snippet = Adx.render_html(
        ad,
        css_class="homepage-banner",
    )
```

The renderer supports the normalized creative types exposed by the SDK:

* Image advertisements
* HTML advertisements
* No-fill results

### Example CSS

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

### Content Security Policy

When rendering advertisements, review your site's Content Security Policy.

Depending on the creative format, relevant directives may include:

```text
img-src
frame-src
script-src
style-src
connect-src
```

Do not broadly weaken your Content Security Policy without understanding the creative requirements and associated risks.

---

## Viewability Tracking

An advertisement is not automatically viewable merely because the server returned it.

The frontend should confirm that the advertisement satisfies the required viewability threshold.

The standard threshold described by this integration is:

* At least 50% of the advertisement visible
* For at least one continuous second

After the browser confirms viewability, report the impression through a backend endpoint.

### Python backend endpoint

```python
@app.post("/api/ad/viewable/<imp_id>")
def report_viewable(imp_id):
    success = adx.report_viewable(
        imp_id,
        user_agent=request.headers.get("User-Agent"),
        client_ip=request.remote_addr,
    )

    if not success:
        return Response(status=204)

    return {"reported": True}
```

### Browser-side example

```javascript
const adElement = document.querySelector(
  "[data-ad-impression-id]"
);

if (adElement) {
  const impressionId =
    adElement.dataset.adImpressionId;

  let visibleTimer;
  let reported = false;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (
        entry.intersectionRatio >= 0.5 &&
        !reported
      ) {
        visibleTimer = window.setTimeout(
          async () => {
            reported = true;

            await fetch(
              `/api/ad/viewable/${encodeURIComponent(
                impressionId
              )}`,
              {
                method: "POST",
                keepalive: true,
              }
            );
          },
          1000
        );
      } else if (visibleTimer) {
        window.clearTimeout(visibleTimer);
        visibleTimer = undefined;
      }
    },
    {
      threshold: [0, 0.5, 1],
    }
  );

  observer.observe(adElement);
}
```

Production integrations should ensure that one impression is not reported repeatedly.

### Direct reporting

```python
if ad.is_trackable and ad.imp_id:
    success = adx.report_viewable(ad.imp_id)
```

Only report after viewability has actually been confirmed.

---

## Click Tracking

Generate a registered click-tracking URL:

```python
if ad.imp_id:
    click_url = adx.click_url(ad.imp_id)
```

Example:

```python
click_url = (
    adx.click_url(ad.imp_id)
    if ad.is_trackable and ad.imp_id
    else None
)
```

A custom renderer should:

* Require an intentional user interaction
* Avoid automatic navigation
* Preserve the registered impression relationship
* Handle missing impression identifiers safely
* Validate the generated URL before exposing it
* Avoid linking directly to an unrelated destination
* Prevent multiple navigations from one click

---

## Ad Requests

`request_ad` accepts keyword arguments describing the placement, page, user context, privacy state, and identity.

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    slot_name="homepage-banner",
    page_url="https://example.com/page",
    page_keywords="python,software,development",
    us_privacy="1YNN",
    euconsent_v2="consent-string",
    user_agent="Mozilla/5.0 ...",
    client_ip="203.0.113.10",
    identity_cookie="identity-cookie-value",
)
```

Supported fields include:

| Field             | Description                                   |
| ----------------- | --------------------------------------------- |
| `slot_id`         | Identifier of the configured advertising slot |
| `slot_name`       | Configured or descriptive slot name           |
| `page_url`        | URL of the page displaying the advertisement  |
| `page_keywords`   | Keywords describing the page content          |
| `us_privacy`      | Applicable US privacy signal                  |
| `euconsent_v2`    | IAB Europe TCF v2 consent string              |
| `user_agent`      | Real end-user browser User-Agent              |
| `client_ip`       | Real end-user IP address                      |
| `identity_cookie` | Existing Theaimart ADX identity value         |

Use a real configured slot ID or supported slot name.

Do not use placeholder identifiers in production.

---

## Privacy Signals

The SDK accepts privacy-related values:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    us_privacy="1YNN",
    euconsent_v2=consent_string,
)
```

These values allow the application to forward consent or privacy state collected by its consent-management process.

The publisher application remains responsible for:

* Determining applicable privacy requirements
* Collecting valid consent where required
* Respecting user opt-out choices
* Forwarding accurate signals
* Avoiding requests that conflict with user preferences
* Maintaining appropriate privacy documentation
* Configuring identity behavior correctly

Do not fabricate consent strings.

The SDK transports the supplied values but does not independently determine legal compliance.

---

## Identity Cookies

Forward an existing identity value where permitted:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    identity_cookie=request.cookies.get(
        "theaimart_adx_id"
    ),
)
```

Identity values can help preserve continuity across requests where permitted by the applicable privacy policy.

Applications should:

* Treat identity values as untrusted input
* Validate length and format
* Avoid logging complete identity values
* Apply appropriate cookie security settings
* Respect opt-out and consent state
* Avoid exposing identity values unnecessarily
* Follow the wire contract when storing or forwarding them

Recommended cookie attributes can include:

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

`request_ad` returns an `Ad` object.

Typical fields include:

| Field                 | Description                                    |
| --------------------- | ---------------------------------------------- |
| `filled`              | Whether an eligible advertisement was returned |
| `kind`                | Normalized creative kind                       |
| `source`              | Normalized demand source                       |
| `imp_id`              | Impression identifier                          |
| `identity_id`         | Identity value returned by the backend         |
| `creative`            | Creative payload                               |
| `auction`             | Auction metadata                               |
| `reason`              | No-fill or error reason                        |
| `retry_after_seconds` | Suggested retry delay                          |
| `is_trackable`        | Whether viewability can be reported            |
| `raw`                 | Original backend response data                 |

### Filled advertisement

```python
if ad.filled:
    print(ad.creative)
```

### No-fill response

```python
if not ad.filled:
    print(ad.reason)
```

### Trackable advertisement

```python
if ad.is_trackable and ad.imp_id:
    print(ad.imp_id)
```

### Retry guidance

```python
if (
    not ad.filled
    and ad.retry_after_seconds
):
    print(
        f"Retry after "
        f"{ad.retry_after_seconds} seconds"
    )
```

Do not create uncontrolled immediate retry loops.

---

## Ad Kinds

The SDK normalizes creative types through `AdKind`.

Expected values include:

```python
AdKind.IMAGE
AdKind.HTML
AdKind.NO_FILL
```

Example:

```python
from theaimart_adx import AdKind

if ad.kind is AdKind.IMAGE:
    print("Image advertisement")

elif ad.kind is AdKind.HTML:
    print("HTML advertisement")

elif ad.kind is AdKind.NO_FILL:
    print("No advertisement available")
```

Use the exact enums exported by the installed package version.

---

## Demand Sources

The SDK normalizes response sources through `AdSource`.

Expected values include:

```python
AdSource.INTERNAL
AdSource.OPENRTB
AdSource.HOUSE
```

### Internal demand

```python
from theaimart_adx import AdSource

if ad.source is AdSource.INTERNAL:
    print("Internal demand")
```

An advertisement supplied through demand managed directly inside Theaimart ADX.

### OpenRTB demand

```python
if ad.source is AdSource.OPENRTB:
    print("OpenRTB demand")
```

An advertisement supplied through an OpenRTB-compatible auction or demand integration.

### House advertisement

```python
if ad.source is AdSource.HOUSE:
    print("House advertisement")
```

A publisher- or platform-managed fallback advertisement.

House advertisements may not carry a trackable impression identifier.

### No-fill

A valid result indicating that no eligible advertisement was available.

No-fill is a normal advertising outcome and should not automatically be treated as an application error.

---

## Four-Way Union Parsing

The backend can return four logical response variants:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The SDK normalizes these variants into one `Ad` object.

Example:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
)

if not ad.filled:
    handle_no_fill(ad)

elif ad.source is AdSource.INTERNAL:
    handle_internal_ad(ad)

elif ad.source is AdSource.OPENRTB:
    handle_openrtb_ad(ad)

elif ad.source is AdSource.HOUSE:
    handle_house_ad(ad)
```

Malformed, incomplete, or unsupported response variants fail closed.

The SDK does not expose them as partially initialized filled advertisements.

This avoids:

* Unsafe response assumptions
* Missing-field errors
* Invalid creative access
* Incorrect impression tracking
* Unsupported demand-source handling
* Unverified creative rendering

---

## Fail-Closed Error Handling

By default, operational failures are converted into a no-fill `Ad`.

Potential failure conditions include:

* DNS failure
* Connection refusal
* Request timeout
* Invalid HTTP response
* Non-200 response
* HTTP 403
* HTTP 500
* Malformed JSON
* Missing required fields
* Unsupported response shape
* Invalid creative kind
* Invalid demand source
* Invalid impression identifier
* Transport failure

Default behavior:

```text
Operational failure → ad.filled is False
```

Example:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
)

if not ad.filled:
    print(f"No fill: {ad.reason}")
```

### Exception mode

Enable explicit exceptions with `raise_on_error=True`:

```python
adx = Adx(
    api_key="pk_your_publisher_key",
    raise_on_error=True,
)
```

Then handle failures normally:

```python
try:
    ad = adx.request_ad(
        slot_id="your-slot-id",
    )
except Exception as exc:
    print(f"Ad request failed: {exc}")
```

Exception mode is useful for:

* Development
* Integration testing
* Debugging
* Monitoring systems
* Strict internal services
* Failure-analysis tools

For user-facing pages, fail-closed behavior is generally safer.

---

## User-Agent and Fraud Classification

The SDK sends a purpose-built User-Agent:

```text
theaimart-adx-python/<version>
```

Example:

```text
theaimart-adx-python/1.0.0
```

This avoids generic Python HTTP-client identifiers that can be classified as automated traffic.

Generic values associated with Python networking libraries can produce silent no-fill responses when they match backend bot-protection rules.

However, the SDK User-Agent identifies the Python integration itself. It does not replace the real end-user User-Agent.

Forward the browser User-Agent separately:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    user_agent=request.headers.get(
        "User-Agent"
    ),
)
```

Forward the real user IP where available:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    user_agent=request.headers.get(
        "User-Agent"
    ),
    client_ip=request.remote_addr,
)
```

The values serve different purposes:

| Value                 | Purpose                               |
| --------------------- | ------------------------------------- |
| SDK User-Agent        | Identifies the Theaimart Python SDK   |
| `user_agent` argument | Identifies the real browser or device |
| `client_ip` argument  | Identifies the real network source    |

Without end-user context, unrelated impressions can appear to originate from one automated backend.

User-Agent behavior follows [CONTRACT.md section 6](../../CONTRACT.md).

---

## SQL-Filter-Safe Encoding

Real URLs and page metadata commonly contain text that resembles SQL keywords or security-sensitive tokens.

Examples include:

```text
end
open
cast
select
@
```

These values can occur naturally inside:

* Page URLs
* Query parameters
* Article slugs
* Usernames
* Email-like values
* Search terms
* Page keywords
* Campaign parameters
* Application routes

A strict backend Web Application Firewall may reject raw query parameters containing such patterns.

The SDK byte-percent-encodes contract-defined free-text parameters before sending them.

Example input:

```text
https://example.com/open-source/backend?author=user@example.com
```

The SDK applies the required wire-contract encoding before transmission.

This behavior:

* Preserves valid page URLs
* Prevents malformed query construction
* Avoids WAF false positives
* Supports URLs containing reserved-looking text
* Produces deterministic requests
* Keeps backend filtering safe
* Prevents normal page URLs from causing HTTP 403 responses

The encoding rules are defined in [CONTRACT.md section 7](../../CONTRACT.md).

Do not pre-encode values unless the contract explicitly requires it. Manual encoding can result in double encoding.

---

## Transport Injection

The SDK accepts an injectable transport implementation.

```python
adx = Adx(
    api_key="pk_your_publisher_key",
    transport=custom_transport,
)
```

Transport injection can be used for:

* Unit testing
* Mock responses
* Custom networking
* Internal proxy routing
* Failure simulation
* Timeout testing
* Observability wrappers
* Enterprise network environments

### Conceptual mock transport

```python
class MockTransport:
    def request(
        self,
        method,
        url,
        *,
        headers=None,
        timeout=None,
    ):
        return {
            "status": 200,
            "body": {
                "filled": False,
                "reason": "test_no_fill",
            },
        }


adx = Adx(
    api_key="pk_test_key",
    transport=MockTransport(),
)
```

Adapt custom transports to the exact interface exported by the installed package.

### Why inject the transport?

Transport injection improves:

* Deterministic testing
* WAF regression testing
* Timeout simulation
* Error-path coverage
* Network isolation
* Mock-server integration
* Custom observability
* Infrastructure compatibility

The default runtime remains standard-library-only.

---

## API Reference

### `Adx(...)`

Constructs a client.

```python
adx = Adx(
    api_key="pk_your_publisher_key",
    base_url="https://api.example.com",
    timeout=5.0,
    user_agent="theaimart-adx-python/1.0.0",
    transport=custom_transport,
    raise_on_error=False,
)
```

Parameters:

| Parameter        | Description                                   |
| ---------------- | --------------------------------------------- |
| `api_key`        | Public publisher API key                      |
| `base_url`       | Optional API base URL override                |
| `timeout`        | Request timeout                               |
| `user_agent`     | SDK transport User-Agent override             |
| `transport`      | Custom transport implementation               |
| `raise_on_error` | Raise exceptions instead of returning no-fill |

Use production defaults unless a controlled environment requires an override.

---

### `request_ad(...)`

Requests an advertisement.

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
)
```

Complete example:

```python
ad = adx.request_ad(
    slot_id="your-slot-id",
    slot_name="homepage-banner",
    page_url="https://example.com/page",
    page_keywords="python,software,backend",
    us_privacy="1YNN",
    euconsent_v2=consent_string,
    user_agent=request.headers.get(
        "User-Agent"
    ),
    client_ip=client_address,
    identity_cookie=identity_value,
)
```

Returns:

```python
Ad
```

---

### `report_viewable(...)`

Reports a viewable impression:

```python
success = adx.report_viewable(
    impression_id,
)
```

Forward user context where available:

```python
success = adx.report_viewable(
    impression_id,
    user_agent=request.headers.get(
        "User-Agent"
    ),
    client_ip=request.remote_addr,
)
```

Returns:

```python
bool
```

A `False` result indicates that the best-effort beacon was not successfully reported.

---

### `click_url(...)`

Builds the click-tracking URL for an impression:

```python
url = adx.click_url(
    impression_id
)
```

Use only an impression ID returned by the SDK.

---

### `Adx.render_html(...)`

Renders a supported advertisement as HTML:

```python
html_snippet = Adx.render_html(ad)
```

With a CSS class:

```python
html_snippet = Adx.render_html(
    ad,
    css_class="theaimart-ad-placement",
)
```

Review the output against your application layout, escaping rules, and Content Security Policy.

---

## Production Architecture

A typical server-side flow is:

```text
Browser
   │
   │ page request
   ▼
Python application
   │
   │ request_ad with user IP, UA,
   │ page URL, privacy signals
   ▼
Theaimart ADX
   │
   │ normalized Ad response
   ▼
Python application
   │
   │ HTML or JSON response
   ▼
Browser
   │
   │ detect ≥50% visibility for ≥1 second
   ▼
Python viewability endpoint
   │
   │ report_viewable
   ▼
Theaimart ADX
```

### Backend responsibilities

* Protect publisher configuration
* Request advertisements
* Forward trusted end-user context
* Normalize no-fill behavior
* Render HTML or return structured creative data
* Generate click URLs
* Provide a viewability-report endpoint
* Validate impression identifiers
* Apply rate limits
* Log failures safely

### Frontend responsibilities

* Render the placement
* Measure viewability
* Report the impression once
* Handle user clicks
* Maintain accessible layout
* Collapse no-fill placements
* Prevent accidental interactions
* Avoid automatic navigation

---

## Client Reuse

Create one reusable `Adx` client for shared configuration:

```python
import os

from theaimart_adx import Adx

adx = Adx(
    api_key=os.environ[
        "THEAIMART_ADX_PUBLISHER_KEY"
    ],
    timeout=5.0,
)
```

Import or inject the client where needed.

Avoid creating unnecessary clients repeatedly when the configuration is identical.

A reusable client also simplifies:

* Timeout policy
* Transport configuration
* Testing
* Logging
* Dependency injection
* Framework integration

---

## Timeout Configuration

Configure a bounded timeout:

```python
adx = Adx(
    api_key="pk_your_publisher_key",
    timeout=3.0,
)
```

Advertising should not delay the primary application indefinitely.

Choose a timeout based on:

* Server-rendering budget
* Request latency targets
* Geographic network conditions
* Auction requirements
* Fallback behavior
* User experience

On timeout, default fail-closed behavior returns a no-fill `Ad`.

---

## Retry Behavior

Do not retry immediately after every no-fill response.

No-fill can be caused by:

* No eligible campaign
* Targeting mismatch
* Frequency limits
* Fraud-risk policy
* Geographic restrictions
* Privacy state
* Demand shortage
* Auction timeout
* Backend retry guidance

Respect `retry_after_seconds` when available:

```python
if (
    not ad.filled
    and ad.retry_after_seconds
):
    schedule_next_request(
        delay=ad.retry_after_seconds
    )
```

Avoid:

* Recursive immediate retries
* Multiple simultaneous requests for one placement
* Reloading repeatedly in a tight loop
* Ignoring retry guidance
* Creating duplicate impressions

---

## Security Guidance

### Use only the correct publisher key

The key supplied to the SDK should be the publisher key intended for the integration:

```text
pk_your_publisher_key
```

Do not provide:

* Administrative credentials
* Database passwords
* Infrastructure tokens
* Cloud access keys
* Signing keys
* Advertiser billing credentials
* Internal service secrets

### Use environment variables

```python
import os

from theaimart_adx import Adx

api_key = os.environ.get(
    "THEAIMART_ADX_PUBLISHER_KEY"
)

if not api_key:
    raise RuntimeError(
        "THEAIMART_ADX_PUBLISHER_KEY "
        "is required"
    )

adx = Adx(api_key=api_key)
```

### Validate impression identifiers

Before forwarding an impression ID:

```python
import re

IMPRESSION_ID_PATTERN = re.compile(
    r"^[A-Za-z0-9_-]{1,200}$"
)


def is_valid_impression_id(
    impression_id: str,
) -> bool:
    return bool(
        IMPRESSION_ID_PATTERN.fullmatch(
            impression_id
        )
    )
```

Use validation consistent with the actual impression-ID format defined by the wire contract.

### Apply rate limits

Protect ad-request and viewability endpoints from automated abuse.

### Avoid sensitive logging

Do not unnecessarily log:

* Full identity cookies
* Publisher keys
* Complete consent strings
* Raw user IP addresses
* Full advertising payloads
* Personal identifiers

### Validate custom HTML output

When creating your own renderer, do not concatenate untrusted creative fields directly into HTML without appropriate validation and escaping.

---

## Observability

Useful operational metrics include:

* Total ad requests
* Filled responses
* No-fill responses
* Fill rate
* Requests by slot
* Requests by demand source
* Request latency
* Timeout count
* HTTP error count
* Parsing failure count
* Viewability-report success rate
* Viewability-report failure rate
* Retry-after distribution

Example structured logging:

```python
import json
import time

started_at = time.monotonic()

ad = adx.request_ad(
    slot_id="homepage-banner",
    page_url=page_url,
    user_agent=user_agent,
    client_ip=client_ip,
)

event = {
    "event": "theaimart_ad_request",
    "slot_id": "homepage-banner",
    "filled": ad.filled,
    "kind": str(ad.kind),
    "source": str(ad.source),
    "reason": ad.reason,
    "duration_ms": round(
        (
            time.monotonic()
            - started_at
        )
        * 1000
    ),
}

print(json.dumps(event))
```

Avoid logging complete identity, consent, or network values unless required and permitted.

---

## Testing

The SDK supports deterministic testing through its injectable transport.

Recommended test cases:

| Scenario                 | Expected behavior                 |
| ------------------------ | --------------------------------- |
| Internal filled response | Parsed as internal demand         |
| OpenRTB response         | Parsed as OpenRTB demand          |
| House response           | Parsed as house demand            |
| No-fill response         | `filled is False`                 |
| Invalid JSON             | Safe no-fill by default           |
| HTTP 403                 | Safe no-fill by default           |
| HTTP 500                 | Safe no-fill by default           |
| Timeout                  | Safe no-fill by default           |
| `raise_on_error=True`    | Operational failure raises        |
| Trackable response       | Valid `imp_id` and `is_trackable` |
| Missing impression ID    | Not treated as trackable          |
| SQL-like text in URL     | Encoded without WAF rejection     |
| User-Agent forwarding    | Browser context reaches transport |
| Client-IP forwarding     | Network context reaches transport |
| HTML rendering           | Supported creative renders        |
| No-fill rendering        | No unsafe creative output         |

---

## Development

Enter the Python package directory:

```bash
cd packages/python
```

Install the package in editable mode with development dependencies:

```bash
python -m pip install -e ".[dev]"
```

Run the pytest suite:

```bash
python -m pytest
```

Run the standard-library unittest suite:

```bash
python -m unittest discover -s tests
```

Run static type checking:

```bash
mypy src/theaimart_adx
```

Recommended verification:

```bash
python -m unittest discover -s tests
python -m pytest
mypy src/theaimart_adx
```

The runtime package itself has no third-party dependencies.

Development-only tools can include:

* pytest
* mypy
* packaging and build tools
* linting or formatting tools configured by the repository

---

## Standard-Library Test Suite

The test suite can run through Python's built-in `unittest` framework without third-party runtime packages.

```bash
python -m unittest discover -s tests
```

Coverage includes:

* Free-text encoding
* Ad-model parsing
* Internal-response parsing
* OpenRTB-response parsing
* House-ad parsing
* No-fill parsing
* Error handling
* Timeout behavior
* Transport injection
* HTML rendering
* Viewability reporting
* WAF regression behavior

---

## Local Mock Server Testing

The SDK test suite includes an end-to-end test against a local mock HTTP server.

The mock server can reproduce:

* HTTP 200 filled responses
* Internal advertisements
* OpenRTB advertisements
* House advertisements
* No-fill responses
* HTTP 403 WAF rejection
* HTTP 500 failures
* Slow responses
* Invalid JSON
* Missing fields
* Viewability-beacon responses

A WAF regression test can verify that URLs containing SQL-like text survive contract-compliant encoding.

Conceptual example:

```python
import unittest

from theaimart_adx import Adx


class EncodingIntegrationTests(
    unittest.TestCase
):
    def test_page_url_survives_waf(
        self,
    ):
        adx = Adx(
            api_key="pk_test",
            base_url=self.mock_server_url,
        )

        ad = adx.request_ad(
            slot_id="test-slot",
            page_url=(
                "https://example.com/"
                "open-source/backend"
                "?author=user@example.com"
            ),
        )

        self.assertTrue(ad.filled)
```

Use the exact test fixtures and mock-server interfaces implemented in the repository.

---

## Frequently Asked Questions

### What is `theaimart-adx`?

It is the official Python SDK for integrating Theaimart ADX advertising into server-side Python applications.

### What is the import name?

Install:

```bash
pip install theaimart-adx
```

Import:

```python
from theaimart_adx import Adx
```

### Does the package have runtime dependencies?

No. It uses the Python standard library.

### Is it intended for browsers?

No. This package is primarily designed for Python server-side integrations.

Use the appropriate web, mobile, desktop, or platform SDK for direct client-side use.

### Can I use it with Django?

Yes. Request the ad in a Django view, forward trusted user context, and render the HTML or structured creative data.

### Can I use it with Flask?

Yes. Use `request.headers`, `request.remote_addr`, and the current page URL when requesting the advertisement.

### Can I use it with FastAPI?

Yes. The client is synchronous, so use a synchronous route or offload the request from an async route.

### Why should I forward the end-user IP?

Today it has no effect: the ad server only trusts the `X-Forwarded-For` entry its own proxy appends, so every request is attributed to your server's IP (see "Before you ship"). The option is kept because it is harmless and would take effect if the server ever trusts an authenticated server-to-server hop.

### Why should I forward the end-user User-Agent?

It allows the backend to classify the real browser, device, and operating system instead of seeing only a Python server.

### Does the SDK throw on network failure?

Not by default.

It returns a no-fill `Ad` where `filled` is `False`.

Use `raise_on_error=True` when explicit exceptions are required.

### What does fail-closed mean?

Timeouts, non-200 responses, parsing failures, and transport errors become safe no-fill responses rather than crashing the application or exposing an invalid creative.

### Why does the SDK encode page URLs?

Normal URLs can contain text that resembles SQL keywords and triggers backend WAF rules. Contract-compliant encoding prevents legitimate URLs from being rejected.

### Should I manually encode `page_url`?

Normally, no. Pass the original value and allow the SDK to apply the required encoding.

Manual encoding can cause double encoding.

### Does the SDK support OpenRTB?

Yes. OpenRTB responses are normalized into the common `Ad` model.

### What is a house advertisement?

A house advertisement is publisher- or platform-managed promotional inventory used as fallback demand.

### Do house ads have impression IDs?

They may not. Always check `ad.is_trackable` and `ad.imp_id`.

### What happens when no ad is available?

The SDK returns an `Ad` where `filled` is `False` and the kind is `AdKind.NO_FILL`.

### Can the SDK render HTML?

Yes. Use:

```python
Adx.render_html(ad)
```

### Should I report an impression immediately after requesting an ad?

No. Report it only after the frontend confirms that the advertisement meets the viewability threshold.

### How can the browser measure viewability?

Use `IntersectionObserver` to confirm that at least 50% of the advertisement remains visible for at least one second.

### What does `report_viewable` return?

It returns a Boolean indicating whether the best-effort beacon succeeded.

### Can I replace the default network transport?

Yes. Supply a compatible custom transport implementation.

### Why is transport injection useful?

It enables deterministic tests, failure simulation, mock responses, custom network behavior, and WAF regression testing.

### Should I create a new `Adx` client for every request?

A reusable application-level client is generally preferable when configuration is shared.

### Is the publisher key secret?

Use only the publisher key intended for the integration. Do not pass administrative or infrastructure credentials.

### How should the application handle no-fill?

Render nothing, collapse the placement, or show normal non-advertising content. Do not block access to the primary page.

---

## Python Website Monetization with Theaimart ADX

The Theaimart ADX Python SDK is intended for developers building:

* Django websites
* Flask applications
* FastAPI backends
* Python web services
* Server-rendered websites
* Publisher platforms
* Blogs
* News websites
* Content-management systems
* AI applications
* SaaS products
* Developer tools
* Internal ad-operations tools
* Server-to-server integrations
* Backend-for-frontend services
* Automated publisher systems

The SDK provides a standard-library-only connection to Theaimart ADX while protecting normal page data from WAF false positives and preserving real end-user context for more accurate traffic classification.

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
* Ad-request structure
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

The Python SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response variants, encoding rules, identity behavior, creative representation, or tracking semantics should be introduced through an explicit wire-contract version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
