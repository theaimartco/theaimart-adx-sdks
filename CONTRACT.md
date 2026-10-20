# theaimart Ad Network — SDK Wire Contract (v1)

> **This document is the single source of truth for every SDK in this repository.**
> All 9 SDKs (Python, Node, Rust, Web, React Native, Android, iOS, Flutter, Unity) implement
> exactly this contract. If the backend contract changes, change it *here first*, then
> propagate to each package. Every claim below was verified against the
> `theaimart-adnetwork` (Rust/actix-web) source, not documentation.

Backend repo: `theaimart-adnetwork`. Serving handler: `src/routes/serve_routes.rs`.

---

## 1. Base URL & transport

| | |
|---|---|
| Production base URL | `https://api.adx.theaimart.co` |
| Serve API prefix | `/api/v1/serve` |
| Protocol | HTTP/1.1 or h2c; responses may be gzip/brotli if `Accept-Encoding` advertises it |
| Content-Type (responses) | `application/json` (except VAST → `application/xml`) |
| Cache-Control (responses) | `no-store` (ad responses must never be cached) |

Every SDK exposes `baseUrl` / `base_url` as a constructor option (default: production URL)
so integrators can point at staging.

### Browser CORS (Web SDK, legacy `adx.js`, Streamlit component)

A browser SDK runs on the *publisher's* origin and calls `api.adx.theaimart.co` cross-origin,
so the browser only hands it the response if the server answers with
`Access-Control-Allow-Origin` for that origin (and `Access-Control-Allow-Credentials: true`,
because the request carries the `_an_id` cookie). The viewability beacon is a JSON `POST`, so it
is additionally preceded by an `OPTIONS` preflight.

> **Policy (backend, 2026-10-10):** the serve scope reflects an `Origin`, with credentials,
> **only when its host is (a subdomain of) an approved publisher site's registered domain**;
> first-party origins (`ALLOWED_ORIGINS`) keep access to every route, and a publisher origin
> gets no CORS access outside `/api/v1/serve/*`. The beacon's preflight is answered for the
> same origins. A request whose `Origin` is neither first-party nor **the requested slot's own
> site** is answered `{"fill": false, "reason": "origin_not_allowed"}` *before* the auction — it
> was previously served, billed, and then discarded by the browser unseen. Native, React Native
> and server SDKs send no `Origin` and are unaffected — CORS is a browser rule.

---

## 2. Endpoints used by a publisher SDK

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/v1/serve/ad` | Request an ad decision (the core call) |
| `POST` | `/api/v1/serve/viewable` | Viewability beacon (≥50% on-screen for ≥1s) |
| `GET`  | `/api/v1/serve/click?id={imp_id}` | Click tracker → 302 redirect to advertiser |

> The SDK **never** calls `POST /api/v1/serve/impression` — that endpoint is for external/VAST
> integrations and requires 6 server-known UUIDs. Impressions for the `/serve/ad` flow are
> recorded **server-side automatically** when the ad is served. Do not double-count.

> `GET /api/v1/serve/vast` (video/VAST) is **supported, with one ordering caveat.** This
> exclusion has been lifted: the backend now emits an `<Impression>` pixel pointing at
> `GET /api/v1/rtb/win?imp_id=…` (a real GET route, `rtb_routes.rs`), and stashes the pending win
> under the Redis key `rtbwin:{imp_id}`, so both the impression and the later click resolve.
> Caveat: `GET /api/v1/serve/click` looks the id up in the `impressions` table, and that row is
> only written when the `<Impression>` beacon fires. A click registered *before* playback starts
> therefore falls back to a generic redirect. SDKs must fire the impression beacon on first play
> (as the Web SDK's `playVastAd` does) before enabling the click target.
>
> The tag is `GET /api/v1/serve/vast?api_key={pk_…}&slot_id={uuid}` — `api_key` is **required**
> (the query fails to deserialize without it, a plain-text `400`), and `slot_id` selects the
> billed auction path. Web builds it with `AdxWebClient.vastTagUrl(slotId)`. Every URL in the
> document is advertiser-influenced (`MediaFile` is the advertiser's asset URL), so `playVastAd`
> keeps only `http`/`https` media, impression and clickthrough URLs, decodes XML entities in
> non-CDATA text, picks the first media file the `<video>` can play, and bounds the tag fetch
> (10 s, 512 KiB).

---

## 3. `GET /api/v1/serve/ad` — request

### Query parameters

| Param | Type | Required | Notes |
|---|---|---|---|
| `api_key` | string | **yes** | Publisher-site key, opaque, `pk_` prefix. **Public** (safe to embed in a shipped client). |
| `slot_id` | UUID | one of `slot_id`/`slot_name` | The ad unit id. Prefer this. |
| `slot_name` | string | one of `slot_id`/`slot_name` | Resolves the most-recently-created active slot with this name. |
| `page_url` | string | no | Current page/screen URL. Used for contextual targeting + brand safety. **Must be safe-encoded (§7).** In an app, leave it unset (as the Android, iOS and Unity banners do) or use an `https://` URL on the site's registered domain — a custom scheme with a host (`myapp://com.example/screen`) is compared to that domain and, under `SITE_DOMAIN_ENFORCEMENT=enforce`, answered `domain_mismatch`. |
| `page_keywords` | string | no | Comma-separated keywords. **Must be safe-encoded (§7).** |
| `us_privacy` | string | no | IAB US Privacy (CCPA) string. **Must be safe-encoded (§7).** |
| `euconsent_v2` | string | no | IAB TCF v2 consent string (base64). **Must be safe-encoded (§7).** |
| `gpp` | string | no | IAB Global Privacy Platform string. Accepted and passed through; the backend does not parse it yet. **Must be safe-encoded (§7).** |
| `gpp_sid` | string | no | GPP applicable section ids, e.g. `"7"` or `"7,8"` (`_` also accepted as a separator). Any id in `7..=12` (usnat, usca, usva, usco, usut, usct) switches the request to **contextual-only** serving: no audience segments, no retargeting, no device targeting and no OpenRTB demand — exactly like a CCPA opt-out. **Must be safe-encoded (§7).** |

Send `gpp_sid` whenever your CMP reports applicable US sections — it is the only GPP field the
backend acts on today (`privacy::gpp_signals_optout`), and a request without it is personalised.

There is **no** `format` / `width` / `height` / device / app-id request parameter. Ad format is a
property of the pre-configured slot, not the request. Device/geo are derived server-side from the
`User-Agent` header and client IP.

### Required headers

| Header | Value | Why |
|---|---|---|
| `User-Agent` | An explicit SDK UA — see §6 | Default HTTP-client UAs (`okhttp`, `python-requests`, `Java/…`) trigger the backend's bot/fraud filter and cause **silent no-fill**. |
| `Accept` | `application/json` | |

### Server-side identity cookie

The response may include `Set-Cookie: _an_id=…`. Clients that maintain a cookie jar (browser,
mobile with persistent cookie store) **should** persist and resend it — it stabilizes the
per-user identity used for frequency capping, retargeting, and the attention dividend. Server-side
SDKs proxying many users must **not** share one cookie across users (see §8).

The value is **signed**: `<uuid>.<base64 HMAC>` (a bare legacy UUID is still accepted and
re-issued signed). Treat it as an opaque string — never parse it, validate it as a UUID, or
build one yourself. A value that fails verification is silently replaced by a fresh identity.

**A request without the cookie mints a new identity.** The backend then writes an identity row
for it and starts every frequency cap from zero, so an SDK that drops the cookie shows one user
the same ad without limit and grows the identity table by one row per ad request. Every
rendering SDK therefore persists `_an_id` app-wide and resends it:

| SDK | Mechanism |
|---|---|
| Web, React Native, iOS | The platform cookie jar (browser / RN native networking / `HTTPCookieStorage`) does it. |
| Android | `SharedPreferences` (`co.theaimart.adx`), read and written by `BannerAdView`. |
| Flutter | Process-wide in memory by default; pass an `AdxIdentityStore` to survive restarts. |
| Unity | `PlayerPrefs` (`theaimart_adx_an_id`), read and written by `AdxBanner`. |

Only a value the server actually sent is stored, and an explicit `identityCookie` on a request
always wins over the stored one.

---

## 4. `GET /api/v1/serve/ad` — response (discriminated union)

Always HTTP `200` on a decision (fill or no-fill). The body is **one of four shapes**. Parse in
this exact order:

```
1. if body.fill == false                       -> NO FILL   (optional `reason`)
2. else if body.creative.html present          -> HTML ad   (source == "openrtb")
3. else if body.source == "house"              -> HOUSE ad  (image, NOT trackable — no imp_id)
4. else                                         -> INTERNAL ad (image, trackable)
```

> **Discriminator caveat:** an internal win has **no `source` field at all** — treat *absent
> `source`* as internal. Only `"openrtb"` and `"house"` appear explicitly.

### 4a. Internal win (image, trackable) — most common

```json
{
  "fill": true,
  "imp_id": "1751600000000_550e8400-e29b-41d4-a716-446655440000",
  "identity_id": "c1a2b3c4-...-uuid",
  "auction": {
    "type": "second_price",
    "clearing_price_paise": 120,
    "quality_score": 0.83,
    "effective_bid": 99.6,
    "winner_bid_paise": 150
  },
  "creative": {
    "id": "creative-uuid",
    "campaign_id": "campaign-uuid",
    "asset_url": "https://.../banner.png",
    "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=1751600000000_550e...",
    "headline": "Buy now",
    "description": "Optional subtitle, may be null",
    "width": 300,
    "height": 250
  }
}
```

`click_url` is **pre-wrapped** through the click tracker. Render an anchor/tap target to it verbatim
— do not build your own click URL for internal ads.

### 4b. OpenRTB win (HTML markup) — only if external demand enabled

```json
{
  "fill": true,
  "source": "openrtb",
  "imp_id": "...",
  "identity_id": "...",
  "dsp": "Some DSP",
  "auction": { "type": "unified", "clearing_price_paise": 140, "winner_ecpm_paise": 160 },
  "creative": { "html": "<raw ad markup>", "width": 300, "height": 250 }
}
```

`creative.html` replaces all image fields. Render inside a **sandboxed** iframe/WebView (never
inject into the host DOM/view tree directly). The markup fires its own impression/click pixels.

### 4c. House-ad backfill (image, NOT trackable)

```json
{
  "fill": true,
  "source": "house",
  "identity_id": "...",
  "creative": {
    "asset_url": "...", "click_url": "<raw advertiser URL, NOT wrapped>",
    "headline": "...", "description": null, "width": 300, "height": 250
  }
}
```

**No `imp_id`.** The SDK cannot fire a viewability beacon for house ads. `click_url` is the raw
advertiser destination (already trackable by the house advertiser themselves). Render it like an
internal image ad but **skip** the viewability beacon.

### 4d. No fill

```json
{ "fill": false }
```
…or, with a `reason`, one of:

| `reason` | Meaning |
|---|---|
| `fraud_rejected` | The fraud scorer rejected the request (`>0.75`). |
| `publisher_suspended` | Graduated enforcement has the publisher suspended. |
| `domain_mismatch` | `page_url`'s host is not the site the `api_key` was registered under. `SITE_DOMAIN_ENFORCEMENT` defaults to `enforce` (since 2026-10-10); `log` warns and still serves. |
| `origin_not_allowed` | A browser request whose `Origin` is neither first-party nor the slot's registered site (or a subdomain). The browser could not have shown the ad, so it is refused before billing. |

No `reason` for: bot UA, unknown slot, blocked domain, or auction-with-no-clearing-bid.

> Treat this list as indicative, not exhaustive. A `reason` is a diagnostic string, never a
> discriminator: SDKs branch on `fill`, and any unfillable response — known reason, unknown
> reason, or no reason — normalizes to the same NoFill result (§8). A new backend reason must
> therefore never require an SDK change.

### Response model (normalized across all SDKs)

Every SDK parses the union into one normalized object with these accessors:

- `filled: bool`
- `reason: string?` (only when not filled)
- `kind: enum { NoFill, Image, Html }`
- `source: enum { Internal, OpenRtb, House }` (Internal when `source` absent)
- `impId: string?` (null for House and NoFill)
- `identityId: string?`
- `creative`: `{ assetUrl?, clickUrl?, html?, headline?, description?, width, height }`
- `auction`: `{ type, clearingPricePaise, ... }` (null for House/NoFill)
- `isTrackable: bool` (== `impId != null`)

### 4e. Rendering security (all SDKs)

Creatives are semi-trusted (an OpenRTB creative originates from a third-party DSP). Every SDK
therefore:

- renders `creative.html` **only** inside a sandboxed iframe / locked-down WebView (sandbox
  `allow-scripts allow-popups allow-popups-to-escape-sandbox`, **no** `allow-same-origin`; native
  WebViews disable file/content access), never by injecting markup into the host DOM/view tree;
- turns `creative.click_url` into a navigable link / opens it **only when its scheme is `http` or
  `https`** — a hostile `javascript:` / `data:` / `file:` / `intent:` URL is dropped (the image
  still renders, just without a link);
- HTML-escapes every interpolated value when server-rendering markup (`render_html`).

---

## 5. Beacons

### Viewability — `POST /api/v1/serve/viewable`

Fire **once** per ad, when it has been **≥50% on-screen for ≥1 continuous second** (IAB/MRC display
standard). Body:

```json
{ "imp_id": "<the imp_id from the ad response>" }
```

No auth, no `api_key`. Only fire when `impId` is present (never for House/NoFill).

#### Responses — the beacon can be told to come back

| Response | Meaning | `viewableOutcome` |
|---|---|---|
| `200 {"success": true}` | Recorded. | `Recorded` |
| `200 {"success": true, "duplicate": true}` | Already recorded (server dedups for 1h). | `Recorded` |
| `200 {"success": false, "reason": "impression_not_recorded_yet", "retry": true}` | **Too early.** The impression row is written by an async buffer (`EVENT_FLUSH_INTERVAL_MS`, 500 ms by default, plus the DB write), so a beacon can beat it. The server released its dedup key: the view was **not** counted, and resending is safe. | `Retry` |
| `429`, `5xx`, or no response (transport error / timeout) | Transient. | `Retry` |
| any other status, or a `2xx` body that is not one of the above | Permanent (e.g. `400` bad body). | `Drop` |

Before this was specified no SDK looked at the body, so a beacon that arrived too early was
treated as a success and the view was **lost for good** — the impression stayed
`viewable = FALSE`, which is what vCPM reporting and advertiser viewability are built on.

Every SDK ships the pure function `viewableOutcome(status, body) -> Recorded | Retry | Drop`
and its `reportViewable` reports success only for `Recorded`.

**Rendering SDKs retry `Retry` automatically**, in the background, at
`VIEWABLE_RETRY_DELAYS_SECONDS = [1, 2, 4]` after the previous attempt (so attempts at roughly
t = 0, 1, 3 and 7 s), then give up. The retry is scoped to the one `imp_id` that was measured
and survives a refresh cycle — it is the same view being delivered late, never a new one.
Server-side SDKs (Python, Node, Rust) do not sleep inside `reportViewable`; they return
`false` and expose `viewableOutcome` so the caller can decide.

**Retry only `Internal` ads.** An OpenRTB win is recorded in `external_impressions`, never in
`impressions`, so its beacon matches no row and is answered `retry: true` every time. Rendering
SDKs send an OpenRTB beacon once and never retry it; the DSP's own markup measures that
impression.

Prefer a call that survives page/screen teardown (`fetch` with `keepalive`, a background
executor, `sendBeacon` as the last resort) — but it must be one whose response can be read,
or `Retry` can never be acted on.

### Click — `GET /api/v1/serve/click?id={imp_id}`

Do **not** call this directly. For internal ads, `creative.click_url` **already is** this URL —
opening it performs the redirect + records the click. For House ads, open `creative.click_url`
(the raw advertiser URL) directly.

---

## 6. User-Agent (mandatory)

The backend runs two UA filters. A match on **either** causes silent no-fill or a fraud score bump:

- `is_bot` blocklist (substring, case-insensitive): `bot, crawler, spider, scraper, google, bing,
  yahoo, facebook, twitter, instagram, pinterest, slack` → **`{fill:false}`**.
- Fraud `bot_signatures` (substring, +0.45 score, rejects at >0.75): `bot, crawler, spider, scraper,
  HeadlessChrome, PhantomJS, Selenium, Puppeteer, Playwright, curl/, wget/, python-requests,
  Go-http-client, httpclient, Java/, okhttp`.

Every SDK sets an explicit UA that (a) avoids **all** of the above substrings and (b) includes a
platform token so `get_device_type` classifies correctly (`android` / `iphone` / `ipad` /
`mobile` / `tablet`, else `desktop`):

| SDK | Default `User-Agent` |
|---|---|
| Python | `theaimart-adx-python/<ver>` |
| Node | `theaimart-adx-node/<ver>` |
| Rust | `theaimart-adx-rust/<ver>` |
| Web | *(browser sets its own real UA — do not override)* |
| React Native | `theaimart-adx-reactnative/<ver> (<os>)` |
| Android | `theaimart-adx-android/<ver> (Android <osver>; <model>)` |
| iOS | `theaimart-adx-ios/<ver> (iPhone; iOS <osver>)` |
| Flutter | `theaimart-adx-flutter/<ver> (<android\|iPhone>...)` |
| Unity | `theaimart-adx-unity/<ver> (<platform>)` |

> **Server-side SDKs (Python, Node, Rust)**: when proxying an ad request on behalf of an end
> user, the integrator **must** forward the *end user's* `User-Agent` — it drives device
> targeting and the bot filter. The SDKs expose a per-request `userAgent` override for this.
>
> **Forwarding the user's IP does not work, by design.** The SDKs also accept a `clientIp`,
> sent as `X-Forwarded-For`, but the backend reads only the entry its own proxy appended
> (`TRUSTED_PROXY_HOPS`, `src/net.rs`, audit H-01) — any value a client writes is to the left
> of that entry and is ignored, which is what stops a caller spoofing its IP past the rate
> limits. So every request a server makes is attributed to **the server's IP**, which means:
>
> - geo targeting sees the server's location, not the user's;
> - the per-IP serve limit (`RATE_LIMIT_PER_MINUTE`, default **60/min**) is shared by all of
>   that server's users, and every request past it is a `429`;
> - a cloud server IP is on the datacenter list (+0.2 fraud score), and more than 100
>   requests/min from one IP adds +0.3.
>
> Server-side serving therefore suits low-volume pages (server-rendered HTML, emails, previews).
> For user-facing traffic at scale, render with the Web or mobile SDK on the user's own device.
> `clientIp` is kept because it is harmless and becomes effective if the backend ever trusts an
> authenticated server-to-server hop — do not document it as working until then.

---

## 7. SQL-filter-safe encoding (mandatory)

The backend applies a global WAF middleware (`SqlInjectionMiddleware`) that lowercases the **entire
raw query string** and returns **403 `{"error":"Request blocked due to security policy"}`** if it
contains *any* of these as a bare substring:

```
--  ;--  /*  */  @@  @  char  nchar  varchar  nvarchar  alter  begin  cast  create
cursor  declare  delete  drop  end  exec  execute  fetch  insert  kill  open  select
sys  sysobjects  syscolumns  table  update  union  waitfor  xp_  sp_
' or '1'='1   ' or 1=1   1=1   or 1=1
```

Note `end`, `open`, `cast`, `sys`, `char`, `table`, `@`, `select`, `update`, `union` — these appear
constantly inside real URLs and keywords (`weekend`, `broadcast`, `timetable`, `/opensource`,
`user@…`, `/select-plan`, `/updates`). Sending `page_url` / `page_keywords` / `us_privacy` /
`euconsent_v2` with ordinary URL-encoding will therefore **randomly 403 in production**.

> **Status (verified against the running backend):** the middleware described below was
> **deliberately removed** from `theaimart-adnetwork` — see the note at `src/main.rs`, audit M-03:
> it was 403-ing real publisher pages like `/weekend-deals` and `/calendar-2026` (every one of
> those matches `end`) and silently eating fill on the hot path. Live probes of
> `api.adx.theaimart.co` with `select`, `@`, `--`, `1=1` and `' or '1'='1` all return `200`.
> The full-byte encoding below is therefore **defence in depth, not a workaround**: it stays,
> because it costs nothing, keeps every SDK byte-identical on the wire, and immunises us if any
> WAF is ever reintroduced at the edge. Do not remove it — but do not cite it as a live 403 fix.

**Rule:** for the free-text/base64 params (`page_url`, `page_keywords`, `us_privacy`,
`euconsent_v2`, `gpp`, `gpp_sid`), every SDK percent-encodes **every byte** of the value as `%XX` (uppercase hex,
UTF-8). The raw query then contains only `%`, hex digits, `&`, `=` and the (safe) param names, so
no keyword substring can ever survive — while the server still percent-decodes back to the true
value for the handler.

`api_key`, `slot_id`, `slot_name` use ordinary URL-encoding (their charset — `pk_…`, UUIDs,
publisher-chosen slugs — cannot contain a blocked keyword in practice; slot_name is additionally
validated to be keyword-free client-side is *not* required, but full-encoding it is harmless and
some SDKs do so defensively).

Every SDK ships a `test` that reconstructs the exact `SQL_KEYWORDS` list above and asserts the
lowercased raw query it produces for a deliberately nasty `page_url` contains none of them.

> **Flutter exception (verified 2026-09-25).** `buildServeQuery` produces the full-byte form, but
> `package:http` only accepts a `Uri`, and Dart's `Uri.parse` normalises every `%XX` of an
> *unreserved* character (`A-Z a-z 0-9 - . _ ~`) back to the character — so `%77%65%65%6B` goes
> on the wire as `week`. Reserved characters stay encoded and the server decodes both forms to
> the same value, so this changes nothing while no WAF exists; but the Flutter wire query is
> **not** keyword-free, and there is no way to make it so through `package:http`. If a
> substring WAF is ever reintroduced at the edge, Flutter must move to a transport that takes a
> raw request line.

---

## 8. Rate limits & errors

The SDK must tolerate these without crashing; the normalized result for any non-200 or unfillable
response is simply **no-fill** (render nothing, optionally retry with backoff).

| Situation | Status | Body shape |
|---|---|---|
| No fill | 200 | `{"fill": false}` (± `reason`) |
| Missing slot | 400 | `{"fill": false, "error": "slot_id or slot_name is required"}` |
| Handler rate limit | 429 | `{"fill": false, "error": "rate limit exceeded"}` + `Retry-After: 60` |
| Middleware rate/DDoS limit | 429 | `{"error": "..."}` (no `fill` key) + maybe `Retry-After` |
| WAF / SQLi block | 403 | `{"error": "Request blocked due to security policy"}` |
| Malformed query (bad UUID, missing `api_key`) | 400 | **plain text** (not JSON) |

Rate limits (per client IP unless noted): 200 req / 10 s (DDoS), 1000 req/min per IP, on the serve
scope 100 req/min per **(api_key, client IP)** plus a per-api_key ceiling across all visitors
(`SERVE_KEY_LIMIT_PER_MINUTE`, default 20 000), plus a per-IP `RATE_LIMIT_PER_MINUTE` (default 60)
in the serve handler itself. Other routes keep 100 GET / 30 write per api_key per minute.
SDKs default to **client-side throttling** (min interval between requests for the same slot, and
refresh interval floor of 30s) to stay well under these.

> **History:** until 2026-10-10 the serve limit was 100/min per `api_key` across *every*
> visitor of a site, so ~50 concurrent viewers of one refreshing slot throttled the whole
> audience. It is now per (key, visitor IP); lazy loading, visibility gating (§9b) and the
> opt-in refresh (§9a) still matter, because every request an invisible slot makes is a bill
> for an ad nobody saw. The viewability beacon carries no `api_key`.
>
> Separately, every internal fill **bills the advertiser when it is served** (the impression is
> recorded inside `serve_ad`), whether or not the SDK ever draws it. Requesting an ad the SDK
> will not show is therefore not merely wasteful — it charges an advertiser for nothing.

**Parsing rule:** never assume the error body is JSON. On any status ≥ 400, or a body that doesn't
parse as JSON, or `fill != true`, return the normalized **NoFill** result. Surface the HTTP status
+ `Retry-After` on the result object so callers *can* implement backoff, but the default render
path treats everything unfillable as "show nothing."

---

## 9. Continuous fill, refresh & lifecycle (shared across SDKs)

A publisher slot must not go permanently dark because one request came back empty. Every SDK that
renders an ad view therefore implements the same **continuous-fill state machine**, exposed as one
option, `refreshSeconds`, and one pure, unit-tested policy function, `nextDelaySeconds`, which every
platform implements identically.

### 9a. The scheduling policy (`nextDelaySeconds`)

```
nextDelaySeconds(rendered, consecutiveFailures, retryAfterSeconds, refreshSeconds) -> int | null
```

| Input | Meaning |
|---|---|
| `rendered` | The previous cycle actually attached a visible creative (§9c). A no-fill, a transport error, or a fill the platform could not draw are all `false`. |
| `consecutiveFailures` | Consecutive non-rendered cycles *including* the one just finished. Reset to 0 by any rendered cycle. |
| `retryAfterSeconds` | The `Retry-After` header from the last response, if any (§8). |
| `refreshSeconds` | Integrator's requested interval. `0`/absent disables continuous fill. |

Rules, in order:

1. If `refreshSeconds <= 0` → return `null` (single-shot; schedule nothing). Continuous fill is
   **opt-in**: silently turning every existing integration into a repeating request would multiply
   load against the per-key rate limits in §8 and *reduce* fill.
2. If `rendered` → return `max(refreshSeconds, MIN_REFRESH_SECONDS)`.
3. Otherwise (a failure) → exponential backoff from the refresh floor:
   `backoff = min(MIN_REFRESH_SECONDS * 2^(consecutiveFailures - 1), MAX_RETRY_SECONDS)`,
   then return `max(backoff, retryAfterSeconds ?? 0, refreshSeconds)`.

`MIN_REFRESH_SECONDS = 30`, `MAX_RETRY_SECONDS = 300`. A dead slot therefore retries at 30s, 60s,
120s, 240s, then every 300s until it fills, and a `429` is always honoured because `Retry-After` can
only push the delay out, never pull it in. The floor is never undercut: at `refreshSeconds = 30` a
slot costs 2 requests/min **per viewer**. The 100/min budget is per `api_key` across all viewers
(§8), so that is 50 concurrent viewers of one refreshing slot before the site is throttled —
choose `refreshSeconds` with the site's concurrent audience in mind, not one device.

### 9b. Visibility gating

An SDK **must not** run the refresh loop while its ad view is not visible — off-screen, or the app
backgrounded. Suspend on hide, resume on show, and if the scheduled time already passed while
hidden, fire immediately on resume. This protects both the rate limit and the advertiser:
requesting ads nobody can see is what an auditor calls unviewable inventory.

### 9c. The viewability rule (the one that must never be broken)

> **Start viewability tracking only from the code path that actually attached a visible creative —
> never from the ad-received callback.**

A fill the platform cannot draw — an OpenRTB `creative.html` on a surface with no WebView, an image
whose download failed, a creative whose URL failed the §4e scheme allowlist — is **not** an
impression. It must not start a viewability timer, must not fire `/serve/viewable`, and counts as a
**failure** for §9a so the slot backs off and tries again. Reporting a view for an ad that was
never on screen is fraudulent against the advertiser and fails an IAB/MRC audit.

Every SDK surfaces this case through its `onAdFailed` equivalent, and the platform's "did it
actually render" signal is the *only* input allowed to gate the beacon.

- **One viewability beacon per rendered ad**, deduped client-side even though the server also dedups.
  Each refresh cycle resets the dedupe state, because each cycle is a new impression.
- **Lazy load:** banner containers should only fire the first ad request when within ~200px of
  viewport (where the platform supports viewport detection).
- **Teardown:** cancel timers, disconnect viewability observers, and abort in-flight requests when
  the ad view is destroyed.

---

## 10. Onboarding (how an integrator gets credentials)

1. Create a publisher account (`POST /api/v1/auth/signup`, role `publisher`) and log in.
2. Register a site/app (`POST /api/v1/publishers/sites`) → receives `api_key` (`pk_…`).
   `kind` ∈ `web | flutter | react_native | app | ios | android`.
3. Create ad slots (`POST /api/v1/publishers/sites/{site_id}/slots`) → each returns a `slot_id`.
   `format` ∈ `banner | video | interstitial | native | rewarded`, `size` = `"WIDTHxHEIGHT"`.
4. Put `api_key` + `slot_id` into the SDK config. That's all the SDK needs.

> **Format caveats (current backend):** `rewarded` slots cannot be filled by internal demand
> (creative table lacks the format), and `video` uses the excluded VAST path. For v1 SDK rollout,
> use `banner`, `interstitial`, or `native` (image) slots.

---

## 11. Versioning

SDKs follow SemVer independently but all track this contract's major version (`v1`). A breaking
change to the wire contract bumps the major of every SDK. The `X-Adx-Sdk` header (name + version)
is sent by every SDK for observability (it is not part of the UA and does not affect fraud scoring).

---

## 12. Outbound request guard (client-side, mandatory)

Every SDK validates, minimises and rate-bounds what it sends **before** it reaches the network.
The SDKs are clients of the ad server and only clients: they carry nothing but the public site
key, and nothing a page, an app or a hostile response hands them reaches the server unchecked.
All 9 SDKs implement the rules below identically (`guard.ts` in Node/Web/React Native,
`guard.py`, `guard.rs`, `Guard.kt`, `Guard.swift`, `guard.dart`, `Guard.cs`) and assert them with
the **same test vectors** (`node/test/guard.test.ts` is the reference).

### 12a. Config — client-safe or nothing

| Check | Rule |
|---|---|
| `api_key` | Trimmed, then must match `^pk_[A-Za-z0-9_-]{1,97}$` (the `VARCHAR(100)` column, `pk_` prefix). An account JWT, a dashboard token or any other secret is refused. |
| `base_url` | `https://` required. Plain `http://` only for `localhost`, `*.localhost`, `[::1]`, `127/8`, `10/8`, `172.16/12`, `192.168/16` (local development). Refused if it contains `@` (credentials — and the `https://api.adx.theaimart.co@evil.com` trick), `?`, `#`, `\` or whitespace. |

On failure, **server SDKs and Web/React Native throw a config error at construction**
(`AdxConfigError` / `Error`). **Native SDKs (Android, iOS, Flutter, Unity) and Rust never throw
into the host app**: the client is built *disabled* — every request is a local no-fill with
reason `invalid_config`, nothing is sent, and `configError` / `config_error()` says why (logged
once). A Flutter debug build additionally asserts.

### 12b. Request fields

| Field | Rule |
|---|---|
| `slot_id` | Trimmed; must be a UUID. Otherwise the request is **not sent** (the server would answer `400`). |
| `slot_name` | Control chars stripped, trimmed, 1–128 UTF-8 bytes, else not sent. Ignored when `slot_id` is given. |
| `page_url` | Minimised (below), then truncated to 2048 UTF-8 bytes on a character boundary. |
| `page_keywords` | Control chars stripped, trimmed, truncated to 1024 bytes. |
| `us_privacy` | Control chars stripped, trimmed, at most 32 chars. **Never dropped** — the backend reads its third character as the opt-out-of-sale flag; truncation keeps it. |
| `gpp_sid` | Every run of non-digits becomes one `,` (`"7;8"` → `"7,8"`, never `"78"`, which would lose a US opt-out); at most 128 chars, cut on an id boundary. |
| `euconsent_v2`, `gpp` | Control chars stripped, trimmed. Longer than 8192 bytes → **omitted, never truncated**: a cut consent string is a corrupt one, and the backend treats a corrupt TCF string exactly like a missing one (`parse_tcf_string(..).unwrap_or(false)`), so omitting changes nothing but the size. |
| identity cookie (`_an_id`) | Sent and stored only if it matches `^[A-Za-z0-9._+/=-]{1,512}$` — the server's own `<uuid>.<base64>` alphabet. A value with anything else is **not sent** (it used to be control-stripped and sent). |
| forwarded `User-Agent`, `X-Forwarded-For` | Control chars stripped, at most 512 chars. |
| `imp_id` (beacon) | Echoed back only if it matches `^[A-Za-z0-9_-]{1,128}$` (real ones are `<millis>_<uuid>`). Anything else → `Drop`, no request. |

**`page_url` minimisation.** The backend stores `page_url` with the impression and forwards it to
OpenRTB bidders as `site.page` (`openrtb/mod.rs`), and the Web SDK fills it from
`location.href`. So before it leaves the device:

1. control characters are stripped and the value trimmed;
2. the `#fragment` is dropped (OAuth implicit-flow `#access_token=…` lives there);
3. any `user:password@` userinfo in the authority is dropped;
4. every path segment that *looks like a secret* becomes `*` (`/reset/<token>` → `/reset/*`). A
   value looks like a secret when it is 24+ chars of `[A-Za-z0-9_.~=-]` and one of its
   `-._~=`-separated pieces is 16+ chars mixing letters and digits — reset and magic-link tokens,
   session ids, hex digests, JWTs. Words, hyphenated slugs, UUIDs and anything with spaces
   (`+`, `%20`) do not match;
5. each query parameter is dropped when its value looks like a secret (whatever the parameter
   is called), or when its name — `%XX` ASCII escapes decoded, lowercased, `-` read as `_` — is one of
   `code state key sig sid nonce ticket otp pin email phone password pass pwd ssn`, or contains
   one of `token secret passw session auth jwt signature apikey api_key access_key credential
   private`, or when its value contains `@` / `%40` (an email);
6. the result is truncated to 2048 bytes; an empty result is omitted.

Contextual targeting only needs the host, path and ordinary query words, all of which survive.

### 12c. Rate bound — the server never sees a request loop

One guard per (base URL, api key), **shared process-wide** by every client and banner using that
key — the same scope as the server's per-key budget (§8):

- **Token bucket:** 60 requests, refilled continuously at 1/s (`MAX_REQUESTS_PER_MINUTE = 60`,
  which is also the server's per-IP serve limit). Over budget → local no-fill, reason
  `rate_limited`, `retryAfterSeconds` = time to the next token.
- **429 circuit breaker:** a `429` blocks *every* request for that key until its `Retry-After`
  passes (60 s when absent or invalid, capped at 600 s so a hostile header cannot silence a slot
  for good). Blocked → local no-fill, reason `rate_limited`, `retryAfterSeconds` = time left.
  Before this, one slot learned about a `429` and the next slot on the same page sent its own.
  (The server's serve limit is per key *and visitor IP* — §8 — so this breaker is scoped to the
  same device the 429 was about.)

Both local no-fills carry `httpStatus = 0` and a `retryAfterSeconds`, so the §9a scheduler backs
off exactly as it would for a server `429`.

### 12d. Transport

- **Redirects are never followed** on serve/beacon calls (Node `redirect: 'manual'`, Web
  `redirect: 'error'`, Python opener without redirect handling, Rust `redirects(0)`, Android
  `instanceFollowRedirects = false`, Flutter `followRedirects = false`, Unity `redirectLimit = 0`,
  iOS a task delegate on iOS 15+). No serve endpoint redirects, and following one would replay
  the `Cookie` / `X-Forwarded-For` to whatever host it named — Python's `urllib` does exactly that.
  A `3xx` is a no-fill.
- **Response bodies are capped at 512 KiB** (streamed with a limit in Node/Python/Rust/Android/
  Flutter, length-checked in iOS/Unity/Web/React Native — a declared `Content-Length` over the cap
  is refused unread). Larger → no-fill.
- **Every ad request has a timeout** (10 s default everywhere). Web had none until 1.1.0: a
  browser `fetch` waits as long as the browser likes (~300 s in Chrome), and a hung decision held
  that slot's §9a loop for the whole time.
- **Connections are reused.** Rust uses one pooled `ureq::Agent`; Python (1.1.0+) keeps a
  process-wide pool of `http.client` keep-alive connections (thread-safe, reset after `fork`,
  one retry when the server closed an idle socket), falling back to `urllib` when a proxy is
  configured in the environment; Node, Web, React Native, Android, iOS, Flutter and Unity use
  their platform's pooled client. Against production this took a Python request from ~456 ms to
  ~328 ms median (2026-10-20) — the TLS handshake is paid once, not per ad.
- **React Native caveat:** RN's XHR-backed `fetch` follows redirects natively and ignores the
  `redirect` option. The SDK still passes `redirect: 'error'` (honoured by Expo's `fetch`, web and
  Node), and the base URL is validated `https`, but on stock RN a redirect from the configured
  host would be followed.

### 12e. Mediation config (Web)

`GET /api/v1/mediation-config` is cached for `refresh_seconds` clamped to 60–3600 s, concurrent
callers share one fetch, adapters are capped at 50, and a **failed** fetch (unknown key → `404`,
`5xx`, bad JSON, offline) is cached as taimads-only for 60 s and never rejects. Before this, a
failing config endpoint was re-requested by *every* mediated ad request — and the backend answers
an unknown key with an uncached database lookup.

### 12f. Streamlit

`banner_html()` runs its config through the Python guard before embedding it, so the in-browser
component only ever receives values the guard already cleaned, plus the same `imp_id` check and
`redirect: "error"` in its own `fetch` calls.
