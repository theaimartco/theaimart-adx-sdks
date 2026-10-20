/**
 * @theaimart/adx-web — official theaimart Ad Network SDK for the browser.
 *
 * Two entry points:
 *  - `TaimAds` — drop-in auto-rendering banners (successor to the classic adx.js global).
 *  - `AdxWebClient` — framework-agnostic request/parse/beacon core for custom rendering
 *    (React/Vue/etc).
 *
 * See CONTRACT.md for the wire contract this implements.
 */

export { AdxWebClient, isSafeHttpUrl } from './core.ts';
export type { AdxWebOptions, WebRequestAdOptions } from './core.ts';
export { TaimAds, TaimAdsController } from './browser.ts';
export type {
  TaimAdsConfig,
  CreateBannerOptions,
  BannerTargeting,
  BannerAppearance,
} from './browser.ts';
export {
  AdKind,
  AdSource,
  parseAd,
  type Ad,
  type Auction,
  type Creative,
} from './models.ts';
export {
  buildServeQuery,
  percentEncodeAll,
  rawQueryIsWafSafe,
  SQL_INJECTION_KEYWORDS,
  type QueryParam,
} from './encoding.ts';
export { VERSION, DEFAULT_BASE_URL, MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS } from './constants.ts';
export { nextDelaySeconds } from './schedule.ts';
export { ViewableOutcome, viewableOutcome, VIEWABLE_RETRY_DELAYS_SECONDS } from './viewable.ts';
export { RenderPlan, renderPlan } from './render.ts';
export { MediationController, pickHighestBid } from './mediation.ts';
export type { MediationConfig, MediationEntry, AdapterBid, AdapterFn, MediationOutcome } from './mediation.ts';
export { parseVast, playVastAd, type VastAd } from './vast.ts';
export { recordTopic, topTopics, personaSnapshot, clearPersona, type PersonaStore } from './persona.ts';
export { enableInspector, disableInspector, inspectorLog, maybeEnableInspectorFromUrl, type InspectorEntry } from './inspector.ts';
export {
  isPublishableKey,
  isSafeImpId,
  LocalReason,
  MAX_REQUESTS_PER_MINUTE,
  normalizeBaseUrl,
  sanitizePageUrl,
} from './guard.ts';
