// Normalized ad model — parses the backend's 4-way discriminated union (CONTRACT.md §4).

export const AdSource = {
  /** Response carries no `source` field (the common case). */
  Internal: 'internal',
  OpenRtb: 'openrtb',
  House: 'house',
} as const;
export type AdSource = (typeof AdSource)[keyof typeof AdSource];

export const AdKind = {
  NoFill: 'no_fill',
  Image: 'image', // <a><img></a> — internal or house
  Html: 'html', // sandboxed iframe — openrtb markup
} as const;
export type AdKind = (typeof AdKind)[keyof typeof AdKind];

export interface Auction {
  type: string | null;
  clearingPricePaise: number | null;
  qualityScore: number | null;
  effectiveBid: number | null;
  winnerBidPaise: number | null;
  winnerEcpmPaise: number | null;
}

export interface Creative {
  width: number;
  height: number;
  assetUrl: string | null;
  clickUrl: string | null;
  html: string | null;
  headline: string | null;
  description: string | null;
  id: string | null;
  campaignId: string | null;
}

export interface Ad {
  filled: boolean;
  kind: AdKind;
  source: AdSource;
  httpStatus: number;
  impId: string | null;
  identityId: string | null;
  dsp: string | null;
  reason: string | null;
  creative: Creative | null;
  auction: Auction | null;
  retryAfterSeconds: number | null;
  setIdentityCookie: string | null;
  /** True iff a viewability beacon can be fired (an `impId` is present). */
  isTrackable: boolean;
  raw: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toCreative(raw: Record<string, unknown>): Creative {
  const w = asNumber(raw.width);
  const h = asNumber(raw.height);
  return {
    width: w ?? 300,
    height: h ?? 250,
    assetUrl: asString(raw.asset_url),
    clickUrl: asString(raw.click_url),
    html: asString(raw.html),
    headline: asString(raw.headline),
    description: asString(raw.description),
    id: asString(raw.id),
    campaignId: asString(raw.campaign_id),
  };
}

function toAuction(v: unknown): Auction | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  return {
    type: asString(raw.type),
    clearingPricePaise: asNumber(raw.clearing_price_paise),
    qualityScore: asNumber(raw.quality_score),
    effectiveBid: asNumber(raw.effective_bid),
    winnerBidPaise: asNumber(raw.winner_bid_paise),
    winnerEcpmPaise: asNumber(raw.winner_ecpm_paise),
  };
}

/**
 * Parse an HTTP status + decoded JSON body into a normalized {@link Ad}. Fail-closed: any
 * non-200 status, non-object body, or `fill !== true` becomes a no-fill. Parse order matches
 * CONTRACT.md §4: fill? → html? → source==='house'? → internal.
 */
export function parseAd(
  httpStatus: number,
  body: unknown,
  retryAfterSeconds: number | null = null,
  setIdentityCookie: string | null = null,
): Ad {
  const raw =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;

  const noFill = (reason: string | null): Ad => ({
    filled: false,
    kind: AdKind.NoFill,
    source: AdSource.Internal,
    httpStatus,
    impId: null,
    identityId: null,
    dsp: null,
    reason,
    creative: null,
    auction: null,
    retryAfterSeconds,
    setIdentityCookie,
    isTrackable: false,
    raw: body,
  });

  if (httpStatus !== 200 || raw === null) {
    return noFill(raw ? asString(raw.reason) : null);
  }
  if (raw.fill !== true) {
    return noFill(asString(raw.reason));
  }

  const creativeRaw =
    raw.creative !== null && typeof raw.creative === 'object' && !Array.isArray(raw.creative)
      ? (raw.creative as Record<string, unknown>)
      : {};
  const html = asString(creativeRaw.html);

  let kind: AdKind;
  let source: AdSource;
  if (html) {
    kind = AdKind.Html;
    source = AdSource.OpenRtb;
  } else if (raw.source === 'house') {
    kind = AdKind.Image;
    source = AdSource.House;
  } else {
    kind = AdKind.Image;
    source = AdSource.Internal;
  }

  const impId = asString(raw.imp_id);
  return {
    filled: true,
    kind,
    source,
    httpStatus,
    impId,
    identityId: asString(raw.identity_id),
    dsp: asString(raw.dsp),
    reason: null,
    creative: toCreative(creativeRaw),
    auction: toAuction(raw.auction),
    retryAfterSeconds,
    setIdentityCookie,
    isTrackable: impId !== null,
    raw: body,
  };
}
