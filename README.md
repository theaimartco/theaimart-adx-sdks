<div align="center">

# theaimart Ad Network — Official SDKs

Production, cross-platform client SDKs for the **theaimart** ad network (`api.adx.theaimart.co`).
One wire contract, nine platforms.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Contract](https://img.shields.io/badge/wire%20contract-v1-brightgreen.svg)](./CONTRACT.md)

</div>

---

## What these are

A single ad-serving REST contract (`GET /api/v1/serve/ad` → decision → render → viewability/click
beacons) implemented natively for every major app and web platform. The ad server answers at
`https://api.adx.theaimart.co`; the dashboard/website is `https://adx.theaimart.co`. All SDKs are
thin, dependency-light clients over the same backend and behave identically on the wire. The authoritative spec is
[`CONTRACT.md`](./CONTRACT.md) — read it before touching any package.

The `api_key` these SDKs take is a **public client identifier** (like any ad-SDK publisher key) — it
is designed to be embedded in shipped client binaries. It is not a server secret.

## Packages

Two columns, deliberately separated: **tests** is whether the code is verified, **published** is
whether an integrator can actually install it today. They are not the same thing, and this table
is checked against the registries, not against intent.

| Platform | Package | Language | Distribution | Tests | Source | Published |
|---|---|---|---|---|---|---|
| **Python** | `theaimart-adx` | Python 3.8+ | PyPI | ✅ 125 | 1.1.0 | ✅ 1.0.0 |
| **Node** (server) | `@theaimart/adx` | TypeScript | npm | ✅ 55 | 1.1.0 | ✅ 1.0.0 |
| **Rust** (server) | `theaimart-adx` | Rust 1.71+ | crates.io | ✅ 43 | 1.1.0 | ✅ 1.0.0 |
| **Web** (browser) | `@theaimart/adx-web` | TypeScript | npm / CDN | ✅ 70 | 1.1.0 | ❌ **not published** |
| **React Native** | `@theaimart/adx-react-native` | TypeScript (pure-JS views; WebView optional) | npm | ✅ 37 | 1.1.0 | ❌ **not published** |
| **Android** | `co.theaimart:adx-android` | Kotlin | Maven Central | ✅ 39 | 1.1.0 | ❌ **not published** |
| **Flutter** | `theaimart_adx` | Dart | pub.dev | ✅ 52 | 1.1.0 | ✅ 1.0.0 |
| **iOS** | `TheaimartAdx` | Swift | SwiftPM / CocoaPods | ⚠️ CI-only | 1.1.0 | ❌ **not published** |
| **Unity** | `co.theaimart.adx` | C# | UPM | ⚠️ Editor-only | 1.1.0 | ❌ **not published** |

> **Publishing status (checked against the registries 2026-10-20).** The four published packages
> still serve 1.0.0, which predates the render-gated beacon, continuous fill, the §12 outbound
> guard and everything in [`CHANGELOG.md`](./CHANGELOG.md). SwiftPM and Unity's UPM install
> straight from this git repository, so both also need the source pushed and a `v1.1.0` tag at the
> root before their install instructions resolve. Until a package's **Published** cell is green,
> its install command in the docs will 404 — do not point publishers at it.

> **Python UI frameworks.** Beyond the server-side client, the Python package ships banner
> widgets for **Flet**, **Kivy** (with a KivMob-shaped facade for migrations) and **Streamlit** —
> `pip install "theaimart-adx[flet]"` / `[kivy]` / `[streamlit]`. They share one unit-tested §9
> driver, so continuous fill, visibility gating and the render-gated beacon behave exactly as they
> do on Android and iOS. See [`packages/python/README.md`](./packages/python/README.md#app-ui-frameworks-flet-kivy-streamlit).

> **Verification note.** 382 tests run on a Linux workstation (`make test` covers Python, Node, Web,
> React Native, Rust and Flutter; `make test-android` adds Android's 39 with a local Android SDK).
> **iOS** compiles and tests on the macOS CI job only — no Linux toolchain can build it. **Unity**'s
> `Tests/Editor` need a licensed Unity Editor (Window ▸ General ▸ Test Runner ▸ EditMode) and are
> not covered by CI. The shared §9a/§9c conformance tables are implemented in all nine packages, so
> the two we cannot run here still assert the same table under their own toolchains.

## Design principles (why these are safe to ship)

Every SDK enforces the same production hardening derived from the real backend behavior:

1. **SQL-filter-safe encoding (defence in depth).** Every SDK byte-percent-encodes the free-text
   params, so no keyword substring can survive into the raw query string. The backend WAF this
   originally worked around has since been removed deliberately (it was 403-ing real pages like
   `/weekend-deals` and eating fill); the encoding stays because it costs nothing, keeps all nine
   SDKs byte-identical on the wire, and immunises us if a WAF ever returns at the edge.
   ([`CONTRACT.md` §7](./CONTRACT.md))
2. **Fraud-safe User-Agent.** Default HTTP-client UAs (`okhttp`, `python-requests`, `Java/…`) are on
   the backend's bot blocklist and cause silent no-fill. Every SDK sets an explicit, platform-tagged
   UA. ([`CONTRACT.md` §6](./CONTRACT.md))
3. **Correct union parsing.** The ad response is a 4-way discriminated union (internal / openrtb /
   house / no-fill); internal wins carry no `source`, house ads carry no `imp_id`. SDKs normalize
   all four and never mis-track. ([`CONTRACT.md` §4](./CONTRACT.md))
4. **IAB viewability, gated on what actually drew.** One beacon per ad, fired at ≥50% visible for
   ≥1s, deduped client-side — and armed *only* from the code path that attached a visible creative.
   A fill the surface cannot draw (an OpenRTB creative with no WebView, an image whose download
   failed, a URL rejected by the scheme allowlist) is **not** an impression: no beacon, and the slot
   backs off and refills instead. Reporting a view for an ad that was never on screen is fraud
   against the advertiser and fails an IAB/MRC audit. ([`CONTRACT.md` §9c](./CONTRACT.md))
5. **Continuous fill.** Every rendering SDK takes one `refreshSeconds` option and then keeps the
   slot alive: refresh on a floor of 30s, exponential backoff (30s → 300s) on anything that did not
   render, `Retry-After` always honoured, and the whole loop suspended while the app is backgrounded
   or the slot is off screen. One no-fill never leaves a publisher's slot permanently dark.
   ([`CONTRACT.md` §9a](./CONTRACT.md))
6. **Fail-closed rendering.** Any error, non-200, or unparseable body → render nothing. Ads never
   crash the host app.
7. **Security.** HTML/OpenRTB creatives render in a **sandboxed** iframe/WebView (never injected
   into the host DOM); only **http/https** click URLs become navigable links, so a hostile
   creative can't smuggle a `javascript:` / `file:` / `intent:` payload; all interpolated HTML is
   escaped. ([`CONTRACT.md` §4](./CONTRACT.md))

## Repository layout

```
theaimart-adx-sdks/
├── CONTRACT.md          # single source of truth — the wire contract
├── LICENSE              # Apache-2.0
├── packages/
│   ├── python/          # theaimart-adx  (pip)
│   ├── node/            # @theaimart/adx       (npm, server-side)
│   ├── rust/            # theaimart-adx  (crates.io, server-side)
│   ├── web/             # @theaimart/adx-web   (npm/CDN, browser)
│   ├── react-native/    # @theaimart/adx-react-native
│   ├── android/         # co.theaimart:adx-android  (Kotlin)
│   ├── ios/             # TheaimartAdx  (Swift; root Package.swift + TheaimartAdx.podspec point here)
│   ├── flutter/         # theaimart_adx  (Dart)
│   └── unity/           # co.theaimart.adx  (C#/UPM)
└── README.md
```

## Quick start

Each package has its own README with install + usage. The shape is the same everywhere:

```text
1. client = Adx(api_key="pk_...", base_url="https://api.adx.theaimart.co")
2. ad = client.request_ad(slot_id="...", page_url=..., consent=...)
3. if ad.filled: render ad.creative ; when ≥50% visible ≥1s -> client.report_viewable(ad.imp_id)
```

## Releasing

Releases are cut by pushing a tag; CI tests, builds and publishes (`.github/workflows/release.yml`):

```bash
node scripts/check-versions.mjs 1.2.0   # set every package's manifest + wire version
# update CHANGELOG.md, commit, then tag the packages you are shipping:
git tag python-v1.2.0 && git tag node-v1.2.0 && git tag web-v1.2.0 && git tag react-native-v1.2.0
git tag rust-v1.2.0 && git tag flutter-v1.2.0 && git tag v1.2.0   # v… = SwiftPM, UPM, CocoaPods
git push origin --tags
```

A tag whose version differs from what the package reports on the wire is refused. Android
(Maven Central) is still published by hand — it needs the `co.theaimart` namespace verified and a
signing key, neither of which CI has.

## Getting credentials

See [`CONTRACT.md` §10](./CONTRACT.md). In short: sign up as a publisher → register a site/app
(get `api_key`) → create ad slots (get `slot_id`). Use `banner` / `interstitial` / `native` slot
formats for v1 (video/rewarded are not yet served by the current backend).

## Security

Creatives are treated as hostile: sandboxed rendering, no WebView JS bridge, `http(s)`-only
navigation, header-injection scrubbing, TLS validation always on, fail-closed. Full threat model in
[`SECURITY.md`](./SECURITY.md). Report issues to **contact@theaimart.co**.

## License

Apache-2.0 © 2026 theaimart. See [`LICENSE`](./LICENSE).
