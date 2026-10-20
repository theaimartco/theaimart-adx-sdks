# Changelog

## 1.1.0

- **Viewability gated on what drew**, continuous fill (`refreshSeconds`), §12 outbound guard,
  `adNavigation(url)` for `htmlBuilder` renderers. See the repository `CHANGELOG.md`.

- **Identity:** `BannerAd` now keeps the server's `_an_id` and resends it, so frequency caps
  hold. New `AdxIdentityStore` (default: process-wide memory; pass `identityStore:` to persist).
  `AdxClient.requestAd` takes an optional `identity:` store.
- **Viewability:** a beacon the server answers `retry` (it arrived before the impression was
  written) is resent after 1 s, 2 s and 4 s for internal impressions. New
  `reportViewableOutcome`, `deliverViewable`, `ViewableOutcome`, `viewableOutcome`.
  `reportViewable` now returns `true` only when the server recorded the view.
- **Privacy:** `gpp` / `gppSid` on `AdRequest` and `BannerAd` (IAB GPP; a US section makes the
  request contextual-only).

## 1.0.0

- Initial release of the official Theaimart ADX Flutter SDK.
- Added the ADX API client.
- Added banner advertisement support.
- Added request and response models.
- Added encoding utilities.
- Added unit tests.
