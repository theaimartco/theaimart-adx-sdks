/**
 * Framework-agnostic React Native ad client (no react-native imports, so it is unit-testable
 * off-device). Uses `fetch` with an explicit fraud-safe `User-Agent` header — essential on RN,
 * whose Android networking uses OkHttp whose default UA would be silently no-filled.
 */

import {
  CLICK_PATH,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  SDK_IDENTIFIER,
  SERVE_AD_PATH,
  VERSION,
  VIEWABLE_PATH,
} from './constants.ts';
import { buildServeQuery } from './encoding.ts';
import { AdxConfigError, AdxTransportError } from './errors.ts';
import {
  guardServeParams,
  isPublishableKey,
  isSafeImpId,
  LocalReason,
  normalizeBaseUrl,
  readCappedText,
  requestGuardFor,
  type RequestGuard,
  safeHeaderValue,
} from './guard.ts';
import { type Ad, parseAd } from './models.ts';
import { VIEWABLE_RETRY_DELAYS_SECONDS, ViewableOutcome, viewableOutcome } from './viewable.ts';

export interface AdxClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Explicit UA; the RN entry point builds a platform-aware one. Defaults to a safe value. */
  userAgent?: string;
  fetchImpl?: typeof fetch;
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
  userAgent?: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class AdxClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly raiseOnError: boolean;
  private readonly guard: RequestGuard;

  static readonly version = VERSION;

  constructor(options: AdxClientOptions) {
    if (!options || typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
      throw new AdxConfigError('apiKey is required and must be a non-empty string');
    }
    const apiKey = options.apiKey.trim();
    if (!isPublishableKey(apiKey)) {
      throw new AdxConfigError(
        'apiKey must be a publishable site key (pk_…). Never ship an account token or secret in an app.',
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
    // Shared by every client and banner for this key, so a 429 backs them all off together.
    this.guard = requestGuardFor(baseUrl, apiKey);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? `theaimart-adx-reactnative/${VERSION}`;
    const f = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) throw new AdxConfigError('no fetch implementation available');
    this.fetchImpl = f;
    this.raiseOnError = options.raiseOnError ?? false;
  }

  /** The guarded serve URL, or `null` when the request must not be sent (CONTRACT.md §12). */
  buildAdUrl(options: RequestAdOptions): string | null {
    const params = guardServeParams(this.apiKey, options);
    return params === null ? null : `${this.baseUrl}${SERVE_AD_PATH}?${buildServeQuery(params)}`;
  }

  async requestAd(options: RequestAdOptions): Promise<Ad> {
    if (!options.slotId && !options.slotName) {
      throw new AdxConfigError('requestAd requires either slotId or slotName');
    }
    const url = this.buildAdUrl(options);
    if (url === null) return parseAd(0, { fill: false, reason: LocalReason.InvalidRequest });
    const wait = this.guard.acquire(Date.now());
    if (wait !== null) return parseAd(0, { fill: false, reason: LocalReason.RateLimited }, wait);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent ? safeHeaderValue(options.userAgent) : this.userAgent,
          Accept: 'application/json',
          'X-Adx-Sdk': SDK_IDENTIFIER,
        },
        // Respected where the runtime implements it (Expo's fetch, web, Node tests). React
        // Native's XHR-backed fetch follows redirects natively and cannot be told otherwise.
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await readCappedText(resp);
      if (text === null) {
        if (this.raiseOnError) throw new AdxTransportError('response too large');
        return parseAd(0, null);
      }
      let retryAfter: number | null = null;
      const ra = resp.headers.get('retry-after');
      if (ra !== null) {
        const n = Number.parseInt(ra, 10);
        retryAfter = Number.isFinite(n) ? n : null;
      }
      this.guard.record(resp.status, retryAfter, Date.now());
      return parseAd(resp.status, safeJson(text), retryAfter);
    } catch (err) {
      if (this.raiseOnError) throw new AdxTransportError(err instanceof Error ? err.message : String(err));
      return parseAd(0, null);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolves `true` only when the server recorded the view. See {@link reportViewableOutcome}. */
  async reportViewable(impId: string, userAgent?: string): Promise<boolean> {
    return (await this.reportViewableOutcome(impId, userAgent)) === ViewableOutcome.Recorded;
  }

  /**
   * Send the viewability beacon once and classify the answer (CONTRACT.md §5). `'retry'` means
   * the view was NOT counted — typically the beacon beat the impression into the database — and
   * resending the same `impId` is safe. Never resends by itself; see {@link deliverViewable}.
   */
  async reportViewableOutcome(impId: string, userAgent?: string): Promise<ViewableOutcome> {
    // Only an id the server could have issued is echoed back to it.
    if (!isSafeImpId(impId)) return ViewableOutcome.Drop;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await this.fetchImpl(`${this.baseUrl}${VIEWABLE_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent ? safeHeaderValue(userAgent) : this.userAgent,
          'X-Adx-Sdk': SDK_IDENTIFIER,
        },
        body: JSON.stringify({ imp_id: impId }),
        redirect: 'error',
        signal: controller.signal,
      });
      return viewableOutcome(resp.status, safeJson((await readCappedText(resp)) ?? ''));
    } catch (err) {
      if (this.raiseOnError) throw new AdxTransportError(err instanceof Error ? err.message : String(err));
      return viewableOutcome(0, null);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Deliver a measured view: send the beacon and, while the server answers `'retry'`, resend it
   * after 1 s, 2 s and 4 s, then give up (CONTRACT.md §5). Pass `retryable: false` for anything
   * but an internal impression — an OpenRTB win never gets a row the beacon could mark, so it is
   * sent once. Resolves with the last outcome.
   */
  async deliverViewable(
    impId: string,
    retryable: boolean,
    sleep: (ms: number) => Promise<void> = defaultSleep,
  ): Promise<ViewableOutcome> {
    let outcome = await this.reportViewableOutcome(impId);
    for (const delay of VIEWABLE_RETRY_DELAYS_SECONDS) {
      if (outcome !== ViewableOutcome.Retry || !retryable) break;
      await sleep(delay * 1000);
      outcome = await this.reportViewableOutcome(impId);
    }
    return outcome;
  }

  clickUrl(impId: string): string {
    return `${this.baseUrl}${CLICK_PATH}?id=${encodeURIComponent(impId)}`;
  }
}
