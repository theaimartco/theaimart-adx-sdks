// Wire-contract constants. See ../../../CONTRACT.md — the single source of truth.

export const VERSION = '1.1.0';

/** Production ad server. Override via `new AdxWebClient({ baseUrl })` / `TaimAds.init({ baseUrl })`. */
export const DEFAULT_BASE_URL = 'https://api.adx.theaimart.co';

export const SERVE_AD_PATH = '/api/v1/serve/ad';
export const VIEWABLE_PATH = '/api/v1/serve/viewable';
export const CLICK_PATH = '/api/v1/serve/click';
export const VAST_PATH = '/api/v1/serve/vast';

/**
 * Per-request timeout for the ad decision. Browsers give `fetch` no timeout of their own (Chrome
 * waits ~300 s), and a decision that never answers would hold the slot's fill loop until then.
 */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Auto-refresh floor (CONTRACT.md §9). Values below this are clamped. */
export const MIN_REFRESH_SECONDS = 30;

/** Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a). */
export const MAX_RETRY_SECONDS = 300;

/** Sandbox flags for html/openrtb creatives — identical to the shipped adx.js. */
export const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

/**
 * The Web SDK does NOT send a custom `User-Agent` (the browser controls it) or any custom
 * header — the backend CORS policy only allows `Content-Type`/`Authorization`, so any extra
 * header would turn the request into a preflighted request that fails from publisher origins.
 * Requests are header-less "simple" GETs with credentials. (CONTRACT.md §6, §11)
 */
export const SENDS_CUSTOM_HEADERS = false;
