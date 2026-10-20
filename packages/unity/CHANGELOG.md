# Changelog

All notable changes to the theaimart adx Unity package are documented here. Follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **The package imported as empty when installed from a git URL.** It shipped with no `.meta`
  files, and Unity ignores every asset without one in an immutable (git/registry) package. Every
  file and folder now has a `.meta` with a stable GUID.
- `AdxBanner` never sent any privacy signal. It now has `usPrivacy`, `euconsentV2`, `gpp` and
  `gppSid` fields (Inspector → Privacy).

### Added
- `AdxBanner` persists the server's `_an_id` in `PlayerPrefs` (`theaimart_adx_an_id`) and resends
  it, so frequency caps hold across launches. Skipped on WebGL, where the browser owns cookies.
- A viewability beacon the server answers `retry` is resent after 1 s, 2 s and 4 s for internal
  impressions: `Adx.DeliverViewable`, `ViewableOutcome`, `AdxViewable.Classify`.
  `ReportViewable` takes an optional outcome callback.
- `AdRequest.Gpp` / `AdRequest.GppSid`.

## [1.0.0] - 2026-07-04

### Added
- Initial release. `Adx` client (UnityWebRequest coroutines), `AdxBanner` MonoBehaviour,
  `AdxEncoding` (SQL-filter-safe query encoding), and a dependency-free JSON parser.
- IAB viewability beacon (≥50% on-screen for ≥1s) and fraud-safe User-Agent.
- EditMode NUnit tests for encoding + response parsing.
