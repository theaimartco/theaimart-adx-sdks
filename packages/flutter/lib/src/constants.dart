// Wire-contract constants. See CONTRACT.md — the single source of truth.
//library;

const String sdkVersion = '1.1.0';

/// Production ad server. Override via `AdxClient(baseUrl: …)`.
const String defaultBaseUrl = 'https://api.adx.theaimart.co';

const String serveAdPath = '/api/v1/serve/ad';
const String viewablePath = '/api/v1/serve/viewable';
const String clickPath = '/api/v1/serve/click';

const Duration defaultTimeout = Duration(seconds: 10);

/// Auto-refresh floor (CONTRACT.md §9). Values below this are clamped up.
const int minRefreshSeconds = 30;

/// Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a).
const int maxRetrySeconds = 300;

/// X-Adx-Sdk observability header value (does not affect fraud scoring).
const String sdkIdentifier = 'theaimart-adx-flutter/$sdkVersion';
