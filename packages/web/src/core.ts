/**
 * Framework-agnostic browser ad client: build request → fetch decision → parse → beacon.
 * No DOM required, so it is unit-testable and reusable by any web framework wrapper. The
 * DOM auto-rendering layer lives in `browser.ts`.
 *
 * Browser specifics (CONTRACT.md §6/§11): requests are header-less "simple" GETs with
 * `credentials: 'include'` (so the `_an_id` identity cookie flows); no `User-Agent` or
 * custom header is set, to avoid CORS preflight from publisher origins.
 */

import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, SERVE_AD_PATH, VIEWABLE_PATH, CLICK_PATH, VAST_PATH } from './constants.ts';
import { buildServeQuery } from './encoding.ts';
import {
  guardServeParams,
  isPublishableKey,
  isSafeImpId,
  isUuid,
  LocalReason,
  normalizeBaseUrl,
  readCappedText,
  requestGuardFor,
  type RequestGuard,
} from './guard.ts';
import { type Ad, parseAd } from './models.ts';
import { ViewableOutcome, viewableOutcome } from './viewable.ts';

export interface AdxWebOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injectable fetch (for tests / non-standard environments). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Abort an ad decision that has not answered after this long. Default 10 000 ms. */
  timeoutMs?: number;
}

export interface WebRequestAdOptions {
  slotId?: string;
  slotName?: string;
  pageUrl?: string;
  pageKeywords?: string;
  usPrivacy?: string;
  euconsentV2?: string;
  /** IAB GPP string. Passed through; the backend does not parse it yet. */
  gpp?: string;
  /**
   * IAB GPP applicable section ids, e.g. `'7'` or `'7,8'`. Any US section (7–12) makes the
   * request contextual-only, like a CCPA opt-out (CONTRACT.md §3).
   */
  gppSid?: string;
  /** Cancel an in-flight decision when its banner unmounts or starts a newer cycle. */
  signal?: AbortSignal;
}

/**
 * Whether a click URL may become a navigable link. Only http/https are allowed — a hostile
 * creative's `javascript:` / `data:` / `file:` URL is rejected.
 */
export function isSafeHttpUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  return lowered.startsWith('http://') || lowered.startsWith('https://');
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class AdxWebClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly guard: RequestGuard;
  private readonly timeoutMs: number;

  constructor(options: AdxWebOptions) {
    if (!options || typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
      throw new Error('AdxWebClient: apiKey is required');
    }
    const apiKey = options.apiKey.trim();
    if (!isPublishableKey(apiKey)) {
      throw new Error(
        'AdxWebClient: apiKey must be a publishable site key (pk_…). Never put an account token or secret in a web page.',
      );
    }
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    if (baseUrl === null) {
      throw new Error(
        'AdxWebClient: baseUrl must be https:// (plain http only for localhost or a private network), with no credentials, query or fragment',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.guard = requestGuardFor(baseUrl, apiKey);
    this.timeoutMs =
      typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) throw new Error('AdxWebClient: no fetch implementation available');
    this.fetchImpl = f;
  }

  /**
   * Build the guarded, WAF-safe serve URL for a request (exposed for testing/debugging), or
   * `null` when the request is invalid and must not be sent (CONTRACT.md §12).
   */
  buildAdUrl(options: WebRequestAdOptions): string | null {
    const params = guardServeParams(this.apiKey, options);
    return params === null ? null : `${this.baseUrl}${SERVE_AD_PATH}?${buildServeQuery(params)}`;
  }

  /** Request an ad decision. Fail-closed: any error/non-200 → no-fill (never throws). */
  async requestAd(options: WebRequestAdOptions): Promise<Ad> {
    if (!options.slotId && !options.slotName) {
      throw new Error('requestAd requires either slotId or slotName');
    }
    // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server.
    const url = this.buildAdUrl(options);
    if (url === null) return parseAd(0, { fill: false, reason: LocalReason.InvalidRequest });
    const wait = this.guard.acquire(Date.now());
    if (wait !== null) return parseAd(0, { fill: false, reason: LocalReason.RateLimited }, wait);
    // Our own timeout, linked to the caller's signal (`AbortSignal.any` is too new to rely on).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const outer = options.signal;
    const onOuterAbort = (): void => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', onOuterAbort, { once: true });
    }
    try {
      const resp = await this.fetchImpl(url, {
        credentials: 'include',
        // No serve endpoint redirects; following one would carry the identity cookie elsewhere.
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await readCappedText(resp);
      if (text === null) return parseAd(0, null);
      let retryAfter: number | null = null;
      const ra = resp.headers.get('retry-after');
      if (ra !== null) {
        const n = Number.parseInt(ra, 10);
        retryAfter = Number.isFinite(n) ? n : null;
      }
      this.guard.record(resp.status, retryAfter, Date.now());
      return parseAd(resp.status, safeJson(text), retryAfter);
    } catch {
      return parseAd(0, null);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }

  /**
   * Fire the viewability beacon (once the ad has been ≥50% on-screen for ≥1s). Resolves
   * `true` only when the server recorded the view; no-ops (`false`) for a falsy `impId`
   * (e.g. house ads). See {@link reportViewableOutcome}.
   */
  async reportViewable(impId: string): Promise<boolean> {
    return (await this.reportViewableOutcome(impId)) === ViewableOutcome.Recorded;
  }

  /**
   * Send the viewability beacon and classify the answer (CONTRACT.md §5).
   *
   * Uses a `keepalive` fetch, which survives page teardown like `sendBeacon` does — but unlike
   * `sendBeacon` its response can be read. That matters: a beacon that beats the impression
   * into the database is answered `200 {"success": false, "retry": true}`, meaning the view
   * was NOT counted and must be resent. `sendBeacon` reports only "queued", so every such view
   * used to be lost. Resolves `'retry'` on that answer and on any transient failure; it never
   * resends by itself. `'drop'` for a falsy `impId`.
   */
  async reportViewableOutcome(impId: string): Promise<ViewableOutcome> {
    // Only an id the server could have issued is echoed back to it.
    if (!isSafeImpId(impId)) return ViewableOutcome.Drop;
    try {
      const resp = await this.fetchImpl(`${this.baseUrl}${VIEWABLE_PATH}`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imp_id: impId }),
        keepalive: true,
        credentials: 'include',
      });
      return viewableOutcome(resp.status, safeJson((await readCappedText(resp)) ?? ''));
    } catch {
      return viewableOutcome(0, null);
    }
  }

  /**
   * The VAST tag for a `video` / `rewarded` slot, for {@link playVastAd}. `null` when `slotId` is
   * not a UUID (the server would reject it). With a slot id the server runs the billed auction;
   * the impression is recorded when the player fires the `<Impression>` beacon.
   */
  vastTagUrl(slotId: string): string | null {
    const id = typeof slotId === 'string' ? slotId.trim() : '';
    if (!isUuid(id)) return null;
    return `${this.baseUrl}${VAST_PATH}?${buildServeQuery([
      ['api_key', this.apiKey],
      ['slot_id', id],
    ])}`;
  }

  /** Build a click-tracker URL. Rarely needed — prefer `ad.creative.clickUrl`. */
  clickUrl(impId: string): string {
    return `${this.baseUrl}${CLICK_PATH}?id=${encodeURIComponent(impId)}`;
  }
}
