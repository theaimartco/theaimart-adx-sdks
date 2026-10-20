/**
 * CDN / `<script>` entry point. Bundled to `dist/taimads.global.js` (IIFE) and attaches the
 * `TaimAds` singleton to `window`, optionally auto-initializing from the script tag's
 * `data-api-key` / `data-base-url` attributes — the classic adx.js drop-in pattern:
 *
 *   <script src="https://.../taimads.global.js" data-api-key="pk_..."></script>
 *   <div id="taim-ad-<slotId>"></div>
 *   <script>TaimAds.createBanner({ slotId: '...' });</script>
 */

import { TaimAds } from './browser.ts';
import { maybeEnableInspectorFromUrl } from './inspector.ts';

declare global {
  interface Window {
    TaimAds: typeof TaimAds;
    taimAdsAsyncInit?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.TaimAds = TaimAds;
  // On-device ad inspector: append ?adx_debug=1 to any page URL.
  maybeEnableInspectorFromUrl();

  const current =
    typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
  const apiKey = current?.getAttribute('data-api-key') ?? undefined;
  const baseUrl = current?.getAttribute('data-base-url') ?? undefined;
  if (apiKey) {
    try {
      TaimAds.init(baseUrl ? { apiKey, baseUrl } : { apiKey });
    } catch (err) {
      // A bad data-api-key / data-base-url must never break the host page's own scripts.
      console.error('[TaimAds]', err instanceof Error ? err.message : err);
    }
  }

  if (typeof window.taimAdsAsyncInit === 'function') {
    try {
      window.taimAdsAsyncInit();
    } catch {
      /* host callback error — ignore */
    }
  }
}

export { TaimAds };
export default TaimAds;
