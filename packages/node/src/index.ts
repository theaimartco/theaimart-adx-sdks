/**
 * @theaimart/adx — official theaimart Ad Network SDK for Node.js (server-side).
 * See CONTRACT.md for the wire contract this implements.
 */

export { Adx } from './client.ts';
export type { AdxOptions, RequestAdOptions, ReportViewableOptions } from './client.ts';
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
  type QueryParam,
} from './encoding.ts';
export {
  FetchTransport,
  extractIdentityCookie,
  parseRetryAfter,
  type HttpResponse,
  type Transport,
  type TransportRequest,
} from './transport.ts';
export { renderHtml, isSafeHttpUrl } from './html.ts';
export {
  guardServeParams,
  isPublishableKey,
  isSafeIdentityCookie,
  isSafeImpId,
  LocalReason,
  MAX_REQUESTS_PER_MINUTE,
  normalizeBaseUrl,
  RequestGuard,
  resetRequestGuards,
  sanitizeConsent,
  sanitizeGppSid,
  sanitizeKeywords,
  sanitizePageUrl,
  sanitizeUsPrivacy,
} from './guard.ts';
export { ViewableOutcome, viewableOutcome } from './viewable.ts';
export {
  VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MIN_REFRESH_SECONDS,
} from './constants.ts';
