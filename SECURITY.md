# Security Policy

These SDKs are embedded in third-party publisher apps and websites and render creatives that
originate, in part, from external demand (OpenRTB DSPs). They are built to a **treat-every-creative-
as-hostile** model. This document is the threat model + the controls each SDK enforces.

## Reporting a vulnerability

Email **contact@theaimart.co** with details and a PoC if possible. Please do not open a public
issue for undisclosed vulnerabilities. We aim to acknowledge within 72 hours.

## Trust boundaries

| Input | Trust | Handling |
|---|---|---|
| `api_key`, `base_url` | Developer-controlled | Validated (CONTRACT §12a): only a public `pk_` key, only `https` (plain `http` for local hosts). Anything else is refused — a client SDK never carries a secret. |
| `slot_id`, `slot_name` | Developer-controlled | A non-UUID `slot_id` or an over-long `slot_name` is never sent (CONTRACT §12b). |
| `page_url`, keywords, consent strings | Page/app-controlled (semi-trusted) | Minimised and length-bounded (fragment, userinfo, token/session/password/email params dropped from `page_url`), then byte-percent-encoded (WAF-safe); never placed in headers. Consent strings are never truncated or reinterpreted. |
| `client_ip`, forwarded `User-Agent` | Often derived from spoofable input | Control characters stripped and length-bounded before use as header values. |
| `identity_cookie` | Round-tripped through app/server storage | Sent or stored **only** if it is in the server's own alphabet; anything else is dropped, not repaired. |
| Ad **response** (creative html, `asset_url`, `click_url`, `imp_id`) | **Untrusted** (may come from an external DSP) | See "Creative handling" below. |

## Controls (enforced in every SDK)

### 1. Hostile creative → no code execution
- **HTML/OpenRTB creatives** render **only** inside a sandboxed iframe (`sandbox="allow-scripts
  allow-popups allow-popups-to-escape-sandbox"`, **no** `allow-same-origin`) or a locked-down native
  WebView. Markup is **never** injected into the host DOM / view tree.
- **No JavaScript bridge.** Native WebViews add **no** `addJavascriptInterface` (Android) and **no**
  `WKUserContentController` message handlers (iOS) — this is the primary native-WebView RCE vector,
  and it is intentionally absent. Android WebViews additionally disable file/content access
  (`allowFileAccess=false`, `allowContentAccess=false`, `allow*FileURLs=false`).
- Because `allow-same-origin` is withheld, iframe scripts run in an **opaque origin** and cannot read
  the publisher page's cookies, storage, or DOM.

### 2. Navigation / URL safety
- A `click_url` becomes a navigable link / is opened **only when its scheme is `http` or `https`**.
  A `javascript:` / `data:` / `file:` / `intent:` URL is dropped (the image still renders, without a
  link). Enforced in `render_html` (server SDKs) and every native click handler.
- `asset_url` images are loaded **only** over `http`/`https` in native loaders (rejects `file://` /
  `content://` local-resource loads).
- **Navigation the creative initiates from inside its own frame** is held to the same allowlist —
  a separate control from the two above, which only cover URLs we are handed in the ad response.
  Web uses the iframe `sandbox`; React Native sets `originWhitelist` to `http`/`https`; Android
  attaches a `WebViewClient` that sends an `http`/`https` navigation to the browser and drops
  everything else. **Android needs that client explicitly:** a WebView with none hands a URL it
  cannot resolve itself to the OS as an Intent, so `intent://`, `market://` or a custom app scheme
  in third-party markup would otherwise launch app components on the device. iOS `WKWebView` does
  not reach external schemes without a navigation delegate, and none is set. Unity has no WebView
  and refuses html/openrtb fills outright (§9c). Flutter refuses them too unless the application
  supplies an `htmlBuilder`, and exports the same rule as `adNavigation(url)` for that builder to
  apply — see below.

### 3. Injection
- **Query / WAF:** all free-text params are percent-encoded byte-by-byte, so no value can break out
  of the query or smuggle content (also the mechanism that defeats the backend WAF; see CONTRACT §7).
- **HTTP header injection:** `client_ip` and `identity_cookie` have control characters (CR/LF/NUL)
  stripped before being set as `X-Forwarded-For` / `Cookie`, so a spoofed value cannot add headers.
- **HTML injection / XSS:** server-side `render_html` HTML-escapes every interpolated value; creative
  markup is only ever placed in a sandboxed iframe `srcdoc` (escaped), never live-parsed into the page.

### 3b. Outbound guard — nothing harmful reaches the ad server
Every SDK runs each request through the CONTRACT §12 guard before it touches the network:
- **Client-only credentials:** a key that is not a publishable `pk_` key, or a non-TLS / credential-
  bearing / query-bearing base URL, is refused (server + web SDKs throw; native SDKs and Rust
  disable themselves and return `invalid_config` no-fills — an app never crashes because of us).
- **Data minimisation:** `page_url` loses its fragment, userinfo and every credential-like or
  email-valued query parameter before it leaves the device, because the backend stores it and
  forwards it to OpenRTB bidders.
- **Bounded, validated fields:** every free-text field has a byte cap; a malformed `slot_id`, a
  forged `imp_id` or a foreign-alphabet identity cookie is never sent at all.
- **Rate bound:** a process-wide 60/min token bucket per key plus a `429` circuit breaker shared by
  every client and banner, so a render loop or retry storm becomes local no-fills, not server load.
- **Mediation config** failures are cached (60 s), deduped and never rethrown (Web).

### 4. Transport
- **TLS certificate validation is never disabled** in any SDK. No SDK sets `InsecureSkipVerify`, a
  permissive `TrustManager`/`HostnameVerifier`, `allowsAnyHTTPSCertificate`, or similar. Production
  traffic is HTTPS to `api.adx.theaimart.co`.
- **Fail-closed:** any network error, timeout, non-200, or unparseable body yields a no-fill — the SDK
  never throws into the host app and never renders partial/garbage state. An invalid request is a
  local no-fill too (Android's `require()` and iOS's `preconditionFailure()` on a missing slot used
  to crash the host app; both are gone).
- **No redirects, bounded bodies, bounded time:** serve and beacon calls never follow a redirect
  (which would replay the identity cookie to another host — stock React Native's fetch is the one
  runtime that cannot be told not to, see CONTRACT §12d), never read more than 512 KiB of
  response, and time out after 10 s.
- **Video (VAST, Web):** `MediaFile`, `Impression` and `ClickThrough` URLs are advertiser-
  influenced. Only `http`/`https` ones survive parsing, so a `javascript:` / `data:` / `blob:`
  value never reaches `video.src`, an `<img>` or `window.open`.

### 5. Data minimization
- SDKs send only what the ad request needs. They do **not** log request/response bodies, the identity
  cookie, or PII. `api_key` is public; there are no embedded secrets.
- Server-side SDKs (Python/Node/Rust) that proxy many users must forward each user's own UA/IP and
  must **not** share one `identity_cookie` across users (documented per-SDK).

### 6. Supply chain
- **No runtime dependencies** in the Python, Node, Web, React Native, Android, iOS and Unity
  packages. Rust depends on `ureq` and declares a floor on its TLS stack (`rustls >= 0.23.46`,
  RUSTSEC-2026-0285/-0346/-0348/-0349) so downstream lockfiles cannot resolve a vulnerable one.
  Flutter depends on `package:http`.
- **Releases are built in CI from a tag, never from a laptop** (`.github/workflows/release.yml`),
  and publish with registry-side OIDC trusted publishing (PyPI, npm, crates.io, pub.dev) — there
  is no long-lived registry token to leak. npm tarballs carry provenance. A release refuses to
  publish when the tag's version differs from the version the SDK reports on the wire
  (`scripts/check-versions.mjs`).
- **CI actions are pinned to commit SHAs**, checkouts drop their credentials, `npm ci` runs with
  `--ignore-scripts`, and runtime dependencies are audited on every push and weekly (`npm audit
  --omit=dev`, `cargo audit`). Dependabot keeps the pins current.
- **Package contents are allowlisted:** npm `files`, Flutter `.pubignore` (pub honours
  `.gitignore` only inside a git checkout — without it a local `build/` was being uploaded:
  28 MB instead of 43 KB).

## Known accepted trade-offs

- `allow-popups-to-escape-sandbox` is included so ad click-throughs can open the landing page in the
  top window — this matches industry-standard ad rendering (and the shipped `adx.js`). The main
  protection (no `allow-same-origin`, no JS bridge) is unaffected.
- The Web SDK issues header-less "simple" cross-origin GETs with `credentials: 'include'`; it is
  therefore limited by the backend CORS allowlist (see CONTRACT §5) and cannot exfiltrate cross-site.

## Verification

Security-relevant behavior is covered by automated tests in the runnable SDKs (the shared CONTRACT
§12 guard vectors — key/base-URL refusal, `page_url` minimisation, field bounds, privacy-signal
preservation, `imp_id`/cookie alphabets, token bucket, `429` breaker; hostile
`javascript:` click URL dropped; the scheme blocklist a creative must not be able to navigate to;
header-injection scrubbing, including the full Unicode control class; WAF-safe encoding;
inspector-panel escaping; fail-closed). Run `make test` / each package's test command. The native
SDKs carry the same controls in code and are verified with their platform toolchains.

One boundary worth naming rather than implying away: Flutter renders html/openrtb only through
an application-supplied `htmlBuilder`, so for that one path the sandbox belongs to the application.
The SDK does not create that WebView and cannot secure it. What it does instead is refuse the fill
outright when no builder is supplied, export the navigation rule (`adNavigation`) unit-tested and
identical to the other platforms, and ship a complete hardened `webview_flutter` renderer in the
Flutter README. An application that writes its own renderer and ignores all three is outside what
this SDK can enforce.
