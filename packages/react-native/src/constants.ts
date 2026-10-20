// Wire-contract constants. See ../../../CONTRACT.md — the single source of truth.

export const VERSION = '1.1.0';

export const DEFAULT_BASE_URL = 'https://api.adx.theaimart.co';

export const SERVE_AD_PATH = '/api/v1/serve/ad';
export const VIEWABLE_PATH = '/api/v1/serve/viewable';
export const CLICK_PATH = '/api/v1/serve/click';

export const DEFAULT_TIMEOUT_MS = 10_000;
/** Auto-refresh floor (CONTRACT.md §9). Values below this are clamped up. */
export const MIN_REFRESH_SECONDS = 30;

/** Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a). */
export const MAX_RETRY_SECONDS = 300;

export const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

/**
 * Fraud-safe User-Agent (CONTRACT.md §6). CRITICAL for React Native: RN's Android networking
 * uses OkHttp under the hood, whose default UA (`okhttp/…`) is on the backend bot blocklist and
 * causes silent no-fill. We ALWAYS send an explicit UA header. `<platform>` is filled at runtime.
 */
export function defaultUserAgent(platform: string, osVersion?: string): string {
  const suffix = osVersion ? ` ${osVersion}` : '';
  return `theaimart-adx-reactnative/${VERSION} (${platform}${suffix})`;
}

export const SDK_IDENTIFIER = `theaimart-adx-reactnative/${VERSION}`;
