/**
 * High-level async client for the theaimart Ad Network (server-side).
 *
 * ```ts
 * import { Adx } from '@theaimart/adx-node';
 *
 * const adx = new Adx({ apiKey: 'pk_...' });
 * const ad = await adx.requestAd({
 *   slotId: '8b1f-uuid',
 *   pageUrl: req.originalUrl,
 *   // Forward the end user's UA: it drives device targeting and the bot filter.
 *   userAgent: req.headers['user-agent'],
 * });
 * if (ad.filled) res.send(Adx.renderHtml(ad));
 *
 * // Later, ONLY when your frontend has measured the ad ≥50% on-screen for ≥1s:
 * await adx.reportViewable(impId);
 * ```
 *
 * Never call `reportViewable` just because the HTML was sent — that reports a view nobody
 * measured (CONTRACT.md §9c). And note the server attributes every request to *this*
 * server's IP, whatever `clientIp` says (CONTRACT.md §6), so server-side serving shares one
 * per-IP rate limit across all of your users.
 */

import {
  CLICK_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  SDK_IDENTIFIER,
  SERVE_AD_PATH,
  VERSION,
  VIEWABLE_PATH,
} from './constants.ts';
import { buildServeQuery } from './encoding.ts';
import {
  guardServeParams,
  isPublishableKey,
  isSafeIdentityCookie,
  isSafeImpId,
  LocalReason,
  normalizeBaseUrl,
  requestGuardFor,
  type RequestGuard,
  safeHeaderValue,
} from './guard.ts';
import { AdxConfigError, AdxTransportError } from './errors.ts';
import { renderHtml } from './html.ts';
import { type Ad, parseAd } from './models.ts';
import { ViewableOutcome, viewableOutcome } from './viewable.ts';
import {
  extractIdentityCookie,
  FetchTransport,
  type HttpResponse,
  parseRetryAfter,
  type Transport,
} from './transport.ts';

export interface AdxOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
  transport?: Transport;
  /** If true, network errors throw instead of yielding a no-fill. Default: false (fail-closed). */
  raiseOnError?: boolean;
}

export interface RequestAdOptions {
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
  /** Forward the end user's UA when proxying (CONTRACT.md §6). */
  userAgent?: string;
  /**
   * Sent as `X-Forwarded-For`. **Currently ignored by the backend** — it only trusts the entry
   * its own proxy appends, so requests are attributed to this server's IP (CONTRACT.md §6).
   */
  clientIp?: string;
  /** Previously stored `_an_id` value for stable identity/frequency capping. */
  identityCookie?: string;
}

export interface ReportViewableOptions {
  userAgent?: string;
  clientIp?: string;
}

function parseJson(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export class Adx {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly transport: Transport;
  private readonly raiseOnError: boolean;
  private readonly guard: RequestGuard;

  static readonly version = VERSION;

  constructor(options: AdxOptions) {
    if (!options || typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
      throw new AdxConfigError('apiKey is required and must be a non-empty string');
    }
    const apiKey = options.apiKey.trim();
    if (!isPublishableKey(apiKey)) {
      throw new AdxConfigError(
        'apiKey must be a publishable site key (pk_…). Never put an account token or secret in an SDK.',
      );
    }
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    if (baseUrl === null) {
      throw new AdxConfigError(
        'baseUrl must be https:// (plain http only for localhost or a private network), with no credentials, query or fragment',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.guard = requestGuardFor(baseUrl, apiKey);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.transport = options.transport ?? new FetchTransport();
    this.raiseOnError = options.raiseOnError ?? false;
  }

  /** Request an ad decision. Exactly one of `slotId` (preferred) / `slotName` is required. */
  async requestAd(options: RequestAdOptions): Promise<Ad> {
    if (!options.slotId && !options.slotName) {
      throw new AdxConfigError('requestAd requires either slotId or slotName');
    }
    // CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server.
    const params = guardServeParams(this.apiKey, options);
    if (params === null) return parseAd(0, { fill: false, reason: LocalReason.InvalidRequest });
    const wait = this.guard.acquire(Date.now());
    if (wait !== null) return parseAd(0, { fill: false, reason: LocalReason.RateLimited }, wait);

    const url = `${this.baseUrl}${SERVE_AD_PATH}?${buildServeQuery(params)}`;
    const headers = this.baseHeaders(options.userAgent);
    if (options.clientIp) headers['X-Forwarded-For'] = safeHeaderValue(options.clientIp);
    if (isSafeIdentityCookie(options.identityCookie)) {
      headers['Cookie'] = `_an_id=${options.identityCookie}`;
    }

    let resp: HttpResponse;
    try {
      resp = await this.transport.request({ method: 'GET', url, headers, timeoutMs: this.timeoutMs });
    } catch (err) {
      if (this.raiseOnError) throw err;
      if (err instanceof AdxTransportError) return parseAd(0, null);
      throw err;
    }
    const retryAfter = parseRetryAfter(resp);
    this.guard.record(resp.status, retryAfter, Date.now());
    return parseAd(resp.status, parseJson(resp.body), retryAfter, extractIdentityCookie(resp));
  }

  /**
   * Fire the viewability beacon for an `impId` (once the ad has been ≥50% on-screen for
   * ≥1s). Resolves `true` only when the server recorded the view; no-ops (`false`) for a
   * falsy `impId` (e.g. house ads). See {@link reportViewableOutcome} to tell a retryable
   * failure from a permanent one.
   */
  async reportViewable(impId: string, options: ReportViewableOptions = {}): Promise<boolean> {
    return (await this.reportViewableOutcome(impId, options)) === ViewableOutcome.Recorded;
  }

  /**
   * Like {@link reportViewable}, but returns the {@link ViewableOutcome}. On `'retry'` — the
   * beacon beat the impression into the database, or the call failed transiently — the view
   * was not counted and resending the same `impId` later is safe (CONTRACT.md §5). This
   * method never sleeps or retries by itself. `'drop'`, without a request, for an `impId` the
   * server could not have issued (empty, or outside `[A-Za-z0-9_-]{1,128}`).
   */
  async reportViewableOutcome(
    impId: string,
    options: ReportViewableOptions = {},
  ): Promise<ViewableOutcome> {
    // Only an id the server could have issued is echoed back to it.
    if (!isSafeImpId(impId)) return ViewableOutcome.Drop;
    const headers = this.baseHeaders(options.userAgent);
    headers['Content-Type'] = 'application/json';
    if (options.clientIp) headers['X-Forwarded-For'] = safeHeaderValue(options.clientIp);
    const url = `${this.baseUrl}${VIEWABLE_PATH}`;
    let resp: HttpResponse;
    try {
      resp = await this.transport.request({
        method: 'POST',
        url,
        headers,
        body: JSON.stringify({ imp_id: impId }),
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (this.raiseOnError) throw err;
      if (err instanceof AdxTransportError) return viewableOutcome(0, null);
      throw err;
    }
    return viewableOutcome(resp.status, parseJson(resp.body));
  }

  /** Build a click-tracker URL. Rarely needed — prefer `ad.creative.clickUrl`. */
  clickUrl(impId: string): string {
    return `${this.baseUrl}${CLICK_PATH}?id=${encodeURIComponent(impId)}`;
  }

  /** Render an ad to an HTML snippet (image anchor, or sandboxed iframe). */
  static renderHtml(ad: Ad, cssClass = 'theaimart-adx'): string {
    return renderHtml(ad, cssClass);
  }

  private baseHeaders(userAgent?: string): Record<string, string> {
    return {
      'User-Agent': userAgent ? safeHeaderValue(userAgent) : this.userAgent,
      Accept: 'application/json',
      'X-Adx-Sdk': SDK_IDENTIFIER,
    };
  }
}
