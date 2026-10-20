/**
 * @theaimart/adx-react-native — official theaimart Ad Network SDK for React Native.
 * See CONTRACT.md for the wire contract this implements.
 */

export { AdxClient } from './client.ts';
export type { AdxClientOptions, RequestAdOptions } from './client.ts';
export { BannerAd, platformUserAgent } from './BannerAd.tsx';
export type { BannerAdProps, BannerAppearance } from './BannerAd.tsx';
export { isSafeHttpUrl } from './url.ts';
export {
  AdKind,
  AdSource,
  parseAd,
  type Ad,
  type Auction,
  type Creative,
} from './models.ts';
export { AdxError, AdxConfigError, AdxTransportError } from './errors.ts';
export {
  buildServeQuery,
  percentEncodeAll,
  rawQueryIsWafSafe,
  SQL_INJECTION_KEYWORDS,
} from './encoding.ts';
export { VERSION, DEFAULT_BASE_URL, MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS } from './constants.ts';
export { nextDelaySeconds } from './schedule.ts';
export { ViewableOutcome, viewableOutcome, VIEWABLE_RETRY_DELAYS_SECONDS } from './viewable.ts';
export { RenderPlan, renderPlan } from './render.ts';
export {
  isPublishableKey,
  isSafeImpId,
  LocalReason,
  MAX_REQUESTS_PER_MINUTE,
  normalizeBaseUrl,
  sanitizePageUrl,
} from './guard.ts';
