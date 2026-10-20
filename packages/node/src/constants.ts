// Wire-contract constants. See ../../../CONTRACT.md — the single source of truth.

export const VERSION = '1.1.0';

/** Production ad server (the theaimart-adnetwork backend). Override via `new Adx({ baseUrl })`. */
export const DEFAULT_BASE_URL = 'https://api.adx.theaimart.co';

export const SERVE_AD_PATH = '/api/v1/serve/ad';
export const VIEWABLE_PATH = '/api/v1/serve/viewable';
export const CLICK_PATH = '/api/v1/serve/click';

export const DEFAULT_TIMEOUT_MS = 10_000;

/** Auto-refresh floor (CONTRACT.md §9). */
export const MIN_REFRESH_SECONDS = 30;

/**
 * Fraud-safe User-Agent (CONTRACT.md §6). Must NOT contain a backend bot/fraud substring
 * (`bot`, `okhttp`, `httpclient`, `Go-http-client`, ...). This value is safe.
 */
export const DEFAULT_USER_AGENT = `theaimart-adx-node/${VERSION}`;

/** X-Adx-Sdk observability header (does not affect fraud scoring). */
export const SDK_IDENTIFIER = `theaimart-adx-node/${VERSION}`;
