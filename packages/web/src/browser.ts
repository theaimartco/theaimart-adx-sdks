/**
 * DOM auto-rendering layer — the `TaimAds` global, a typed successor to the shipped adx.js.
 * Browser-only (requires `document`, `IntersectionObserver`). The request/parse/beacon logic
 * is delegated to {@link AdxWebClient} in core.ts.
 */

import { IFRAME_SANDBOX } from './constants.ts';
import { AdxWebClient, isSafeHttpUrl } from './core.ts';
import { type Ad, AdSource } from './models.ts';
import { RenderPlan, renderPlan } from './render.ts';
import { nextDelaySeconds } from './schedule.ts';
import { VIEWABLE_RETRY_DELAYS_SECONDS, ViewableOutcome } from './viewable.ts';

export interface TaimAdsConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface BannerTargeting {
  keywords?: string[];
  categories?: string[];
}

/** Visual treatment only; it never changes the creative or any request parameter. */
export interface BannerAppearance {
  /** Outer corner radius in CSS pixels. Default: 12. */
  borderRadius?: number;
  /** Neutral surface shown while an image decodes. Default: #F3F5F7. */
  backgroundColor?: string;
  /** Soft elevation around the creative. Default: true. */
  elevated?: boolean;
  /** Creative fade-in duration. Reduced-motion preferences always win. Default: 180ms. */
  transitionMs?: number;
}

export interface CreateBannerOptions {
  slotId?: string;
  slotName?: string;
  /** Element, element id, or omitted (defaults to `taim-ad-<slotId|slotName>`). */
  container?: HTMLElement | string;
  targeting?: BannerTargeting;
  /** Consent/privacy strings, if you manage a CMP. */
  usPrivacy?: string;
  euconsentV2?: string;
  /** IAB GPP string and applicable section ids (`'7'` = US national) — CONTRACT.md §3. */
  gpp?: string;
  gppSid?: string;
  /**
   * Continuous fill (CONTRACT.md §9): auto-refresh interval in seconds, clamped up to 30.
   * Omit/0 for a single shot. When set, a no-fill or an undrawable creative is retried with
   * exponential backoff (30s → 300s) instead of leaving the slot dark, and the loop suspends
   * while the tab is hidden or the slot is scrolled off screen.
   */
  refresh?: number;
  /**
   * Only request once the container is within 200px of the viewport. **Default: true.**
   *
   * The server bills an advertiser when it serves an ad, not when it is seen, and a site's
   * whole audience shares one 100-requests-per-minute budget (CONTRACT.md §8). A slot far
   * down the page that requests on load spends both on an ad nobody may ever scroll to. A slot
   * that is already on screen is unaffected: the observer reports it immediately. Set `false`
   * only to request on load regardless of position.
   */
  lazy?: boolean;
  /** Optional visual customization. Does not affect ad serving or tracking. */
  appearance?: BannerAppearance;
  onLoad?: (ad: Ad) => void;
  onError?: (err: Error) => void;
}

interface ActiveBanner {
  destroy(): void;
}

const VIEWABILITY_RATIO = 0.5;
const VIEWABILITY_MS = 1000;
const LAZY_ROOT_MARGIN = '200px';
/** An image that neither loads nor errors must not stall the continuous-fill loop. */
const IMAGE_LOAD_TIMEOUT_MS = 10_000;
const DEFAULT_SURFACE_COLOR = '#F3F5F7';

export class TaimAdsController {
  private client: AdxWebClient | null = null;
  private queue: CreateBannerOptions[] = [];
  private readonly banners = new Set<Banner>();

  /** Configure the SDK. Flushes any banners created before init. */
  init(config: TaimAdsConfig): void {
    this.client = new AdxWebClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });
    const pending = this.queue;
    this.queue = [];
    for (const opts of pending) this.createBanner(opts);
  }

  /** Create (or queue) a banner. Returns a handle with `destroy()`. */
  createBanner(options: CreateBannerOptions): ActiveBanner {
    if (!this.client) {
      this.queue.push(options);
      return { destroy: () => this.dequeue(options) };
    }
    const banner = new Banner(this.client, options);
    this.banners.add(banner);
    banner.start();
    return {
      destroy: () => {
        banner.destroy();
        this.banners.delete(banner);
      },
    };
  }

  /** Destroy every active banner (e.g. on SPA route change). */
  destroyAll(): void {
    for (const b of this.banners) b.destroy();
    this.banners.clear();
  }

  private dequeue(options: CreateBannerOptions): void {
    this.queue = this.queue.filter((o) => o !== options);
  }
}

class Banner implements ActiveBanner {
  private readonly client: AdxWebClient;
  private readonly options: CreateBannerOptions;
  private el: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private viewObserver: IntersectionObserver | null = null;
  private lazyObserver: IntersectionObserver | null = null;
  private onScreenObserver: IntersectionObserver | null = null;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private viewableImpId: string | null = null;
  /** Whether the tracked impression is internal, i.e. its beacon may be resent (§5). */
  private viewableRetryable = false;
  private viewableInRange = false;
  private requestController: AbortController | null = null;
  private destroyed = false;

  // --- Continuous fill (CONTRACT.md §9) ---
  private consecutiveFailures = 0;
  /** Epoch ms the next request is due, or null when nothing is scheduled. */
  private dueAt: number | null = null;
  private onScreen = true;
  private pageVisible = true;
  private readonly onPageVisibility = (): void => {
    this.pageVisible = typeof document === 'undefined' || !document.hidden;
    if (!this.pageVisible && this.viewTimer) {
      clearTimeout(this.viewTimer);
      this.viewTimer = null;
    } else if (this.pageVisible) {
      this.armViewTimer();
    }
    this.armTimer();
  };

  constructor(client: AdxWebClient, options: CreateBannerOptions) {
    this.client = client;
    this.options = options;
  }

  start(): void {
    this.el = this.resolveContainer();
    if (!this.el) return;
    this.watchVisibility();
    if ((this.options.lazy ?? true) && typeof IntersectionObserver !== 'undefined') {
      this.lazyObserver = new IntersectionObserver(
        (entries) => {
          // One batch can hold several entries for the same element; request exactly once.
          if (this.lazyObserver === null || !entries.some((e) => e.isIntersecting)) return;
          this.lazyObserver.disconnect();
          this.lazyObserver = null;
          void this.request();
        },
        { rootMargin: LAZY_ROOT_MARGIN },
      );
      this.lazyObserver.observe(this.el);
    } else {
      void this.request();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.requestController?.abort();
    this.requestController = null;
    this.viewObserver?.disconnect();
    this.lazyObserver?.disconnect();
    this.onScreenObserver?.disconnect();
    this.refreshTimer = this.viewTimer = null;
    this.viewObserver = this.lazyObserver = this.onScreenObserver = null;
    this.viewableImpId = null;
    this.viewableInRange = false;
    this.dueAt = null;
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.onPageVisibility);
    }
  }

  private continuousFill(): boolean {
    const refresh = this.options.refresh;
    return typeof refresh === 'number' && refresh > 0;
  }

  /**
   * §9b — never run the refresh loop for an ad nobody can see: a backgrounded tab or a
   * container scrolled off screen suspends the timer, and showing it again resumes (firing
   * immediately if the slot came due while hidden).
   */
  private watchVisibility(): void {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.pageVisible = !document.hidden;
      document.addEventListener('visibilitychange', this.onPageVisibility);
    }
    if (typeof IntersectionObserver === 'undefined' || !this.el) return;
    this.onScreenObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) this.onScreen = e.isIntersecting;
        this.armTimer();
      },
      { threshold: 0 },
    );
    this.onScreenObserver.observe(this.el);
  }

  private resolveContainer(): HTMLElement | null {
    const { container, slotId, slotName } = this.options;
    if (container instanceof HTMLElement) return container;
    const id = typeof container === 'string' ? container : `taim-ad-${slotId ?? slotName ?? ''}`;
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  private buildKeywords(): string | undefined {
    const t = this.options.targeting;
    if (!t) return undefined;
    const merged = [...(t.keywords ?? []), ...(t.categories ?? [])].filter(Boolean);
    return merged.length ? merged.join(',') : undefined;
  }

  /** Empty the slot without removing it from layout while continuous fill is armed. */
  private clearSlot(): void {
    if (!this.el) return;
    this.el.textContent = '';
    this.el.setAttribute('aria-busy', 'false');
    // A `display: none` container reports as "not intersecting", which would suspend the very
    // refresh loop that is meant to recover the slot — and keeping the box reserved avoids a
    // layout shift between cycles. Only a single-shot banner collapses.
    this.el.style.display = this.continuousFill() ? '' : 'none';
    this.el.style.minHeight = this.continuousFill() ? '1px' : '';
  }

  private async request(): Promise<void> {
    if (this.destroyed || !this.el) return;
    this.resetCycle();
    this.el.setAttribute('aria-busy', 'true');
    this.requestController?.abort();
    const controller = new AbortController();
    this.requestController = controller;

    let rendered = false;
    let retryAfter: number | null = null;
    try {
      const ad = await this.client.requestAd({
        slotId: this.options.slotId,
        slotName: this.options.slotName,
        pageUrl: typeof location !== 'undefined' ? location.href : undefined,
        pageKeywords: this.buildKeywords(),
        usPrivacy: this.options.usPrivacy,
        euconsentV2: this.options.euconsentV2,
        gpp: this.options.gpp,
        gppSid: this.options.gppSid,
        signal: controller.signal,
      });
      if (this.destroyed) return;
      retryAfter = ad.retryAfterSeconds;

      if (!ad.filled || !ad.creative) {
        this.clearSlot();
        this.options.onError?.(new Error(ad.reason ?? 'no fill'));
      } else {
        rendered = await this.render(ad);
        if (this.destroyed) return;
        if (rendered) {
          // §9c: the beacon is gated on a creative that actually attached — never on the
          // ad-received callback. An ad we could not draw is not an impression.
          if (ad.isTrackable && ad.impId) {
            this.trackViewability(ad.impId, ad.source === AdSource.Internal);
          }
          this.options.onLoad?.(ad);
        } else {
          this.clearSlot();
          this.options.onError?.(new Error('creative could not be rendered'));
        }
      }
    } catch (err) {
      if (this.destroyed) return;
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
    if (this.requestController === controller) this.requestController = null;
    this.scheduleNext(rendered, retryAfter);
  }

  /** Each refresh cycle is a new impression: drop the previous cycle's viewability state. */
  private resetCycle(): void {
    if (this.viewTimer) {
      clearTimeout(this.viewTimer);
      this.viewTimer = null;
    }
    this.viewObserver?.disconnect();
    this.viewObserver = null;
    this.viewableImpId = null;
    this.viewableRetryable = false;
    this.viewableInRange = false;
  }

  /** Resolves true only if a creative was actually attached and (for images) loaded. */
  private render(ad: Ad): Promise<boolean> {
    if (!this.el || !ad.creative) return Promise.resolve(false);
    const el = this.el;
    const c = ad.creative;
    el.style.display = '';
    el.textContent = '';
    this.prepareSlot(c.width, c.height);

    const plan = renderPlan(ad, true);
    if (plan === RenderPlan.None) return Promise.resolve(false);

    if (plan === RenderPlan.Html && c.html) {
      const iframe = document.createElement('iframe');
      iframe.width = String(c.width);
      iframe.height = String(c.height);
      iframe.frameBorder = '0';
      iframe.scrolling = 'no';
      iframe.setAttribute('marginwidth', '0');
      iframe.setAttribute('marginheight', '0');
      iframe.setAttribute('sandbox', IFRAME_SANDBOX);
      iframe.setAttribute('title', c.headline ?? 'Advertisement');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      iframe.style.display = 'block';
      iframe.style.borderRadius = 'inherit';
      iframe.srcdoc = c.html;
      el.appendChild(iframe);
      el.setAttribute('aria-busy', 'false');
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const img = document.createElement('img');
      let settled = false;
      let guard: ReturnType<typeof setTimeout> | null = null;
      const settle = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        if (ok) img.style.opacity = '1';
        el.setAttribute('aria-busy', 'false');
        resolve(ok);
      };

      img.addEventListener('load', () => settle(true));
      // A creative that 404s leaves an empty box — not an impression, and it must not be
      // counted as viewable. It backs off and refills instead (§9a).
      img.addEventListener('error', () => settle(false));
      guard = setTimeout(() => settle(false), IMAGE_LOAD_TIMEOUT_MS);

      img.alt = c.headline ?? 'Advertisement';
      img.width = c.width;
      img.height = c.height;
      img.style.border = '0';
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.opacity = '0';
      img.style.transition = this.prefersReducedMotion()
        ? 'none'
        : `opacity ${this.transitionMs()}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      img.style.borderRadius = 'inherit';
      img.decoding = 'async';

      // Only http/https click URLs become a link; a hostile creative's non-http URL is dropped.
      if (c.clickUrl && isSafeHttpUrl(c.clickUrl)) {
        const anchor = document.createElement('a');
        anchor.href = c.clickUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener nofollow sponsored';
        anchor.setAttribute('aria-label', c.headline ?? 'Open advertisement');
        anchor.style.display = 'block';
        anchor.style.width = '100%';
        anchor.style.height = '100%';
        anchor.style.borderRadius = 'inherit';
        anchor.appendChild(img);
        el.appendChild(anchor);
      } else {
        el.appendChild(img);
      }

      img.src = c.assetUrl as string;
      if (img.complete && img.naturalWidth > 0) settle(true);
    });
  }

  /** Reserve a responsive creative box up front to avoid overflow and layout shift. */
  private prepareSlot(width: number, height: number): void {
    if (!this.el) return;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const style = this.el.style;
    style.boxSizing = 'border-box';
    style.width = '100%';
    style.maxWidth = `${safeWidth}px`;
    style.aspectRatio = `${safeWidth} / ${safeHeight}`;
    style.marginInline = 'auto';
    style.overflow = 'hidden';
    style.lineHeight = '0';
    style.contain = 'layout paint';
    style.minHeight = '';
    style.borderRadius = `${this.borderRadius()}px`;
    style.backgroundColor = this.options.appearance?.backgroundColor ?? DEFAULT_SURFACE_COLOR;
    style.boxShadow =
      this.options.appearance?.elevated === false
        ? 'none'
        : '0 10px 30px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)';
    style.transition = this.prefersReducedMotion()
      ? 'none'
      : `box-shadow ${this.transitionMs()}ms ease-out`;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Advertisement');
  }

  private borderRadius(): number {
    const value = this.options.appearance?.borderRadius ?? 12;
    return Number.isFinite(value) ? Math.min(48, Math.max(0, value)) : 12;
  }

  private transitionMs(): number {
    const value = this.options.appearance?.transitionMs ?? 180;
    return Number.isFinite(value) ? Math.min(1_000, Math.max(0, value)) : 180;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private trackViewability(impId: string, retryable: boolean): void {
    if (typeof IntersectionObserver === 'undefined' || !this.el) return;
    this.viewableImpId = impId;
    this.viewableRetryable = retryable;
    this.viewObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= VIEWABILITY_RATIO) {
            this.viewableInRange = true;
            this.armViewTimer();
          } else if (this.viewTimer !== null) {
            this.viewableInRange = false;
            clearTimeout(this.viewTimer);
            this.viewTimer = null;
          } else {
            this.viewableInRange = false;
          }
        }
      },
      { threshold: [0, VIEWABILITY_RATIO, 1] },
    );
    this.viewObserver.observe(this.el);
  }

  private armViewTimer(): void {
    const impId = this.viewableImpId;
    const retryable = this.viewableRetryable;
    if (
      this.destroyed ||
      !this.pageVisible ||
      !this.viewableInRange ||
      !impId ||
      this.viewTimer !== null
    ) {
      return;
    }
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      if (!this.pageVisible || !this.viewableInRange || this.viewableImpId !== impId) return;
      this.viewObserver?.disconnect();
      this.viewObserver = null;
      this.viewableImpId = null;
      this.viewableInRange = false;
      this.deliverViewable(impId, retryable, 0);
    }, VIEWABILITY_MS);
  }

  /**
   * CONTRACT.md §5 — the view has been measured; make sure the server counts it. A beacon that
   * beats the impression into the database is answered `retry` and resent on the fixed
   * schedule, then abandoned. Only internal impressions are resent: an OpenRTB win never gets
   * a row the beacon could mark. Deliberately NOT cancelled by a refresh or by `destroy()` —
   * this is an already-measured view arriving late, not a new one.
   */
  private deliverViewable(impId: string, retryable: boolean, attempt: number): void {
    void this.client.reportViewableOutcome(impId).then((outcome) => {
      if (outcome !== ViewableOutcome.Retry || !retryable) return;
      const delay = VIEWABLE_RETRY_DELAYS_SECONDS[attempt];
      if (delay === undefined) return;
      setTimeout(() => this.deliverViewable(impId, retryable, attempt + 1), delay * 1000);
    });
  }

  /** §9a — decide when (or whether) to request again, then arm the timer subject to §9b. */
  private scheduleNext(rendered: boolean, retryAfterSeconds: number | null): void {
    if (this.destroyed) return;
    this.consecutiveFailures = rendered ? 0 : this.consecutiveFailures + 1;
    const delay = nextDelaySeconds(
      rendered,
      this.consecutiveFailures,
      retryAfterSeconds,
      this.options.refresh ?? 0,
    );
    if (delay === null) {
      this.dueAt = null;
      return;
    }
    this.dueAt = Date.now() + delay * 1000;
    this.armTimer();
  }

  private armTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.destroyed || this.dueAt === null) return;
    // Suspended while hidden; re-armed (possibly to fire at once) when shown again.
    if (!this.pageVisible || !this.onScreen) return;
    const ms = Math.max(0, this.dueAt - Date.now());
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.dueAt = null;
      void this.request();
    }, ms);
  }
}

/** The singleton global, mirroring the classic `window.TaimAds` from adx.js. */
export const TaimAds = new TaimAdsController();
