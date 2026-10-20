/**
 * App/web mediation orchestrator (T2.1, client side).
 *
 * Fetches the publisher's mediation chain from the public config endpoint and
 * executes it: taimads first-party demand and any *bidding* adapters compete
 * in parallel on price; if nothing bids, *waterfall* adapters are called in
 * priority order until one fills.
 *
 * External networks (AdMob, Meta, …) ship proprietary SDKs we cannot bundle,
 * so integrators register an `AdapterFn` per network that wraps their SDK.
 * taimads is always the built-in bidding entry — no adapter needed.
 */

import { AdxWebClient, type WebRequestAdOptions } from './core.ts';
import { DEFAULT_BASE_URL } from './constants.ts';
import { normalizeBaseUrl } from './guard.ts';

/** Bounds on how long a mediation config is reused, whatever `refresh_seconds` says. */
const MIN_CONFIG_TTL_SECONDS = 60;
const MAX_CONFIG_TTL_SECONDS = 3600;
/** How long a failed config fetch is remembered before it is tried again. */
const FAILED_CONFIG_TTL_SECONDS = 60;
const MAX_ADAPTERS = 50;

function clampTtl(seconds: unknown): number {
  const n = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 300;
  return Math.min(MAX_CONFIG_TTL_SECONDS, Math.max(MIN_CONFIG_TTL_SECONDS, n));
}
import type { Ad } from './models.ts';

export interface MediationEntry {
  network: string;
  placement_id: string;
  app_id?: string | null;
  priority: number;
  ecpm_floor_paise: number;
  mode: 'bidding' | 'waterfall';
}

export interface MediationConfig {
  version: number;
  refresh_seconds: number;
  adapters: MediationEntry[];
}

/** The result an external-network adapter resolves with (null = no fill). */
export interface AdapterBid {
  network: string;
  /** Price the adapter reports, in INR paise eCPM; 0 = unknown (waterfall). */
  ecpm_paise: number;
  /** Callback that actually renders the external ad when it wins. */
  render: () => void;
}

export type AdapterFn = (entry: MediationEntry) => Promise<AdapterBid | null>;

export type MediationOutcome =
  | { winner: 'taimads'; ad: Ad; ecpm_paise: number }
  | { winner: string; bid: AdapterBid }
  | { winner: null };

/** Pure winner pick over the bidding round — exported for tests. */
export function pickHighestBid(
  taimads: { ad: Ad; ecpm_paise: number } | null,
  adapterBids: AdapterBid[],
): MediationOutcome {
  let best: MediationOutcome = { winner: null };
  let bestPrice = -1;
  if (taimads) {
    best = { winner: 'taimads', ad: taimads.ad, ecpm_paise: taimads.ecpm_paise };
    bestPrice = taimads.ecpm_paise;
  }
  for (const bid of adapterBids) {
    if (bid.ecpm_paise > bestPrice) {
      best = { winner: bid.network, bid };
      bestPrice = bid.ecpm_paise;
    }
  }
  return best;
}

export class MediationController {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly client: AdxWebClient;
  private readonly adapters = new Map<string, AdapterFn>();
  private config: MediationConfig | null = null;
  private configExpiresAt = 0;
  private inflight: Promise<MediationConfig> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    // The client validates the key and base URL (CONTRACT.md §12) and throws if either is unsafe.
    this.client = new AdxWebClient(options);
    this.apiKey = options.apiKey.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL) as string;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Register the wrapper for an external network's SDK. */
  registerAdapter(network: string, fn: AdapterFn): void {
    this.adapters.set(network.toLowerCase(), fn);
  }

  /**
   * Fetch the publisher's mediation chain, cached for `refresh_seconds` (clamped to 60–3600 s).
   *
   * Never rejects, and never refetches on every ad: a failed fetch (unknown key, 5xx, bad JSON,
   * offline) is cached as taimads-only for 60 s, and concurrent callers share one request. Before
   * this, a failing config endpoint was re-requested by *every* mediated ad request — and the
   * backend answers an unknown key with an uncached database lookup.
   */
  async getConfig(): Promise<MediationConfig> {
    if (this.config && Date.now() < this.configExpiresAt) return this.config;
    if (!this.inflight) {
      this.inflight = this.fetchConfig().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchConfig(): Promise<MediationConfig> {
    const url = `${this.baseUrl}/api/v1/mediation-config?api_key=${encodeURIComponent(this.apiKey)}`;
    let config: MediationConfig | null = null;
    try {
      const res = await this.fetchImpl(url, { redirect: 'error' });
      if (res.ok) {
        const body = (await res.json()) as Partial<MediationConfig> | null;
        if (body && typeof body === 'object') {
          config = {
            version: typeof body.version === 'number' ? body.version : 1,
            refresh_seconds: clampTtl(body.refresh_seconds),
            adapters: Array.isArray(body.adapters) ? body.adapters.slice(0, MAX_ADAPTERS) : [],
          };
        }
      }
    } catch {
      config = null;
    }
    // Fail closed to taimads-only: an unreachable config never breaks serving.
    const result = config ?? { version: 1, refresh_seconds: FAILED_CONFIG_TTL_SECONDS, adapters: [] };
    this.config = result;
    this.configExpiresAt = Date.now() + result.refresh_seconds * 1000;
    return result;
  }

  /**
   * Run one mediated request: bidding round (taimads + bidding adapters in
   * parallel, highest eCPM wins) then the waterfall (priority order, first
   * fill wins). Adapter errors are swallowed — a broken network never blocks.
   */
  async requestAd(options: WebRequestAdOptions): Promise<MediationOutcome> {
    const config = await this.getConfig();

    const biddingEntries = config.adapters.filter(
      (a) => a.mode === 'bidding' && this.adapters.has(a.network),
    );
    const waterfallEntries = config.adapters
      .filter((a) => a.mode === 'waterfall' && this.adapters.has(a.network))
      .sort((a, b) => a.priority - b.priority);

    const [taimadsResult, ...adapterResults] = await Promise.allSettled([
      this.client.requestAd(options),
      ...biddingEntries.map((entry) => this.adapters.get(entry.network)!(entry)),
    ]);

    const taimads =
      taimadsResult.status === 'fulfilled' && taimadsResult.value.filled
        ? {
            ad: taimadsResult.value,
            ecpm_paise: taimadsResult.value.auction?.clearingPricePaise ?? 0,
          }
        : null;
    const adapterBids = adapterResults
      .filter((r): r is PromiseFulfilledResult<AdapterBid | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((b): b is AdapterBid => b !== null);

    const winner = pickHighestBid(taimads, adapterBids);
    if (winner.winner !== null) {
      return winner;
    }

    for (const entry of waterfallEntries) {
      try {
        const bid = await this.adapters.get(entry.network)!(entry);
        if (bid) {
          return { winner: bid.network, bid };
        }
      } catch {
        // next network
      }
    }
    return { winner: null };
  }
}
