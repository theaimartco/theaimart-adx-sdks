# Changelog

All nine SDKs share one version line. Entries name the packages they touch; the wire contract is
[`CONTRACT.md`](./CONTRACT.md) and stays at v1 (no breaking wire change).

## 1.1.0 — 2026-10-20

The first release after 1.0.0. Everything below is in source; the registries still serve 1.0.0
until the release tags are pushed (see README → Releasing).

### Correctness — what the advertiser is billed for
- **Viewability is gated on what actually drew** (all rendering SDKs, CONTRACT §9c). A fill the
  surface cannot draw — OpenRTB with no WebView, a failed or rejected image — is not an impression
  and fires no beacon. Unity reported a view for every OpenRTB fill before this.
- **Continuous fill** via one `refreshSeconds` option (§9a): 30 s floor, 30 → 300 s backoff,
  `Retry-After` honoured, suspended while hidden or backgrounded.
- **Beacons the server answers `retry` are resent** at 1/2/4 s for internal impressions (§5).
- **Identity cookie persisted** on Android, Flutter and Unity, so frequency caps hold (§3).
- **GPP** (`gpp`, `gpp_sid`) on every SDK; a US section makes the request contextual-only.

### Security
- **Outbound guard** in all nine SDKs (§12): publishable-key-only config, `page_url` stripped of
  fragments, credentials, tokens and emails before it reaches OpenRTB bidders, bounded fields,
  consent never truncated, 60/min token bucket + shared 429 breaker, no redirects, 512 KiB bodies.
- **Android** creative WebView now has a `WebViewClient` (`intent://` in third-party markup could
  launch app components); **Flutter** exports `adNavigation(url)` and a hardened renderer.
- **Web VAST:** `MediaFile`, `Impression` and `ClickThrough` URLs must be `http`/`https` (a
  `javascript:` media URL used to be assigned to `video.src` unchecked); XML entities decoded; the
  clickthrough opens only after the impression fired; the tag fetch is bounded (10 s, 512 KiB);
  new `signal` option removes listeners. New `AdxWebClient.vastTagUrl(slotId)`.
- **Web + React Native:** responses over 512 KiB are refused (a declared `Content-Length` unread);
  React Native passes `redirect: 'error'` (honoured where the runtime supports it).
- **Rust:** declares `rustls >= 0.23.46` (RUSTSEC-2026-0285, -0346, -0348, -0349 — TLS downgrade,
  cross-epoch handshake messages, pre-auth 1 GiB allocation, secrets in `Debug`), so downstream
  lockfiles cannot resolve a vulnerable TLS stack. MSRV corrected to 1.71 (it was already required).
- **Web inspector** escapes persona counts read from `localStorage`.
- **Supply chain:** release CI with OIDC trusted publishing and npm provenance, SHA-pinned actions,
  credential-less checkouts, `npm ci --ignore-scripts`, weekly runtime-dependency audits,
  Dependabot. Dev toolchains updated (esbuild 0.25, React Native 0.88 types).

### Performance
- **Python keeps connections alive.** A process-wide, thread-safe `http.client` pool replaces a
  fresh `urllib` connection per request: median production request ~456 ms → ~328 ms. Proxy
  environments keep using `urllib`. New `Adx.close()` and context-manager support.
- **Web:** ad decisions time out after 10 s (`timeoutMs`); browsers impose none, so a hung request
  used to stall a slot's refresh loop for minutes. Impressions bill at serve, so `lazy` defaults on.
- **Rust:** one pooled `ureq::Agent` instead of an agent per request.

### Packaging
- **SwiftPM installs from the repository URL**: a root `Package.swift` (SwiftPM only reads the
  root); the CocoaPods spec moved to the root so `pod lib lint` and trunk resolve the same paths,
  and both use the `v1.1.0` tag.
- **Flutter** `.pubignore`: the pub archive was 28 MB (a local `build/`), now 43 KB.
- **Unity** package has its `.meta` files (a git-installed UPM package without them imports empty).
- **Web + React Native** build to `dist/` (they built to `dist/src/`, so web would have published
  a stale bundle).
- `scripts/check-versions.mjs` keeps each package's manifest and wire version (`User-Agent`,
  `X-Adx-Sdk`) identical; CI and releases enforce it.
- **Python** passes `mypy --strict` (it declared strict but was never checked).

### Python UI frameworks
- Flet, Kivy (KivMob-shaped `AdxAds`) and Streamlit banner widgets on one shared §9 driver
  (`pip install "theaimart-adx[flet]"` / `[kivy]` / `[streamlit]`).

## 1.0.0

Initial release of all nine SDKs.
