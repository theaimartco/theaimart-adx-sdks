/**
 * Outbound request guard (CONTRACT.md §12).
 *
 * Everything this SDK puts on the wire to the ad server passes through here first: the config is
 * held to a client-safe shape (a public `pk_` key over TLS), every request field is validated,
 * minimised and length-bounded, and the request rate is capped on the client so a buggy
 * integration — a render loop, a retry storm — never reaches the server as load.
 *
 * Vendored byte-for-byte in the Node, Web and React Native packages; every other SDK implements
 * the same rules and asserts them with the same test vectors.
 */

/** Longest `page_url` sent, in UTF-8 bytes. Longer values are truncated. */
export const MAX_PAGE_URL_BYTES = 2048;
/** Longest `page_keywords` sent, in UTF-8 bytes. Longer values are truncated. */
export const MAX_KEYWORDS_BYTES = 1024;
/** Longest `slot_name` accepted, in UTF-8 bytes. A longer one makes the request invalid. */
export const MAX_SLOT_NAME_BYTES = 128;
/** Longest `euconsent_v2` / `gpp` sent, in UTF-8 bytes. A longer one is omitted, never cut. */
export const MAX_CONSENT_BYTES = 8192;
/** Longest `us_privacy` sent, in characters. A real one is 4. */
export const MAX_US_PRIVACY_CHARS = 32;
/** Longest `gpp_sid` sent, in characters. */
export const MAX_GPP_SID_CHARS = 128;
/** Longest identity cookie, header value or forwarded User-Agent sent. */
export const MAX_HEADER_VALUE_CHARS = 512;
/** Largest response body read from the ad server. */
export const MAX_RESPONSE_BYTES = 512 * 1024;
/** Client-side ad-request budget per (base URL, api key), as a token bucket refilled per second. */
export const MAX_REQUESTS_PER_MINUTE = 60;
/** How long every request backs off after a `429` that carried no usable `Retry-After`. */
export const DEFAULT_RATE_LIMIT_BACKOFF_SECONDS = 60;
/** Upper bound on any `429` backoff, so a hostile `Retry-After` cannot silence a slot for good. */
export const MAX_RATE_LIMIT_BACKOFF_SECONDS = 600;

/** No-fill reasons the guard produces locally. No request was sent for either. */
export const LocalReason = {
  /** The request failed validation (e.g. `slot_id` is not a UUID). */
  InvalidRequest: 'invalid_request',
  /** The client-side budget is spent, or the server answered `429` recently. */
  RateLimited: 'rate_limited',
} as const;

const PUBLISHABLE_KEY = /^pk_[A-Za-z0-9_-]{1,97}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IMP_ID = /^[A-Za-z0-9_-]{1,128}$/;
const IDENTITY = /^[A-Za-z0-9._+/=-]{1,512}$/;
const IPV4 = /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const HAS_UNSAFE_URL_CHAR = /[\s@?#\\\u0000-\u001f\u007f-\u009f]/;

/** Query-parameter names that carry credentials or personal data, matched exactly. */
export const SENSITIVE_PARAM_NAMES: readonly string[] = [
  'code', 'state', 'key', 'sig', 'sid', 'nonce', 'ticket', 'otp', 'pin',
  'email', 'phone', 'password', 'pass', 'pwd', 'ssn',
];
/** Query-parameter name fragments that carry credentials, matched as substrings. */
export const SENSITIVE_PARAM_FRAGMENTS: readonly string[] = [
  'token', 'secret', 'passw', 'session', 'auth', 'jwt', 'signature',
  'apikey', 'api_key', 'access_key', 'credential', 'private',
];

/**
 * Whether `key` is a publishable site key. A client SDK only ever carries the public `pk_` key
 * a site is issued — anything else (an account JWT, a dashboard token, a pasted secret) is
 * refused before it can be shipped inside an app or sent in a query string.
 */
export function isPublishableKey(key: string): boolean {
  return PUBLISHABLE_KEY.test(key);
}

function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]') return true;
  if (!IPV4.test(host)) return false;
  const [a, b] = host.split('.').map(Number) as [number, number];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Normalise a base URL, or `null` if it is unsafe. `https` is required; plain `http` is allowed
 * only for a loopback or private-network host (local development). A URL with credentials,
 * a query, a fragment, a backslash or whitespace is refused — each is either a credential leak
 * or a way to make `base + path` point somewhere other than the ad server.
 */
export function normalizeBaseUrl(url: string): string | null {
  const s = url.trim().replace(/\/+$/, '');
  if (HAS_UNSAFE_URL_CHAR.test(s)) return null;
  const lowered = s.toLowerCase();
  let rest: string;
  let secure: boolean;
  if (lowered.startsWith('https://')) {
    rest = lowered.slice(8);
    secure = true;
  } else if (lowered.startsWith('http://')) {
    rest = lowered.slice(7);
    secure = false;
  } else {
    return null;
  }
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  let host: string;
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close === -1) return null;
    host = authority.slice(0, close + 1);
  } else {
    const colon = authority.indexOf(':');
    host = colon === -1 ? authority : authority.slice(0, colon);
  }
  if (host.length === 0) return null;
  if (!secure && !isLocalHost(host)) return null;
  return s;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Whether an `imp_id` may be echoed back to the server. Real ones are `<millis>_<uuid>`. */
export function isSafeImpId(value: string | null | undefined): value is string {
  return typeof value === 'string' && IMP_ID.test(value);
}

/**
 * Whether an `_an_id` value may be stored or sent as a `Cookie`. The server issues
 * `<uuid>.<base64>`; anything outside that alphabet is not something it sent us.
 */
export function isSafeIdentityCookie(value: string | null | undefined): value is string {
  return typeof value === 'string' && IDENTITY.test(value);
}

/** Remove C0, DEL and C1 control characters. */
export function stripControl(value: string): string {
  return value.replace(CONTROL, '');
}

/** A header value the caller supplied (forwarded UA, client IP): control-free and bounded. */
export function safeHeaderValue(value: string): string {
  return stripControl(value).slice(0, MAX_HEADER_VALUE_CHARS);
}

/** Truncate to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) as number;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += ch.length;
  }
  return value.slice(0, end);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

const TOKEN_CHARS = /^[A-Za-z0-9_.~=-]+$/;
const LETTER = /[A-Za-z]/;
const DIGIT = /[0-9]/;

/**
 * Whether a URL path segment or query value looks like an opaque credential — a reset/magic-link
 * token, a session id, a hex digest, a JWT — whatever its parameter is called. At least 24 chars
 * of the token alphabet `[A-Za-z0-9_.~=-]`, with one `-._~=`-separated piece of 16+ chars that
 * mixes letters and digits. Ordinary words, hyphenated slugs (`how-to-build-a-rest-api-2026`),
 * UUIDs and anything with spaces (`+`, `%20`) do not match.
 */
export function looksLikeSecret(value: string): boolean {
  if (value.length < 24 || !TOKEN_CHARS.test(value)) return false;
  return value
    .split(/[-._~=]/)
    .some((piece) => piece.length >= 16 && LETTER.test(piece) && DIGIT.test(piece));
}

/** Decode `%XX` escapes of ASCII characters, so `%74oken` is read as `token`. */
function decodeAsciiEscapes(value: string): string {
  return value.replace(/%([0-7][0-9A-Fa-f])/g, (_m, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function isSensitiveParam(name: string): boolean {
  // `X-Api-Key`, `x_api_key` and `%78-api-key` are the same name to a human; match them the same way.
  const n = decodeAsciiEscapes(name).toLowerCase().replace(/-/g, '_');
  return (
    SENSITIVE_PARAM_NAMES.includes(n) || SENSITIVE_PARAM_FRAGMENTS.some((f) => n.includes(f))
  );
}

/**
 * Minimise a page URL before it leaves the device. The backend uses `page_url` for contextual
 * targeting and brand safety, stores it with the impression and forwards it to OpenRTB bidders —
 * so it must never carry what a URL often does: an OAuth `#access_token`, a `?token=` or
 * `?session=`, a `user:password@` authority, or someone's email address.
 *
 * Drops the fragment and any userinfo; replaces every path segment that {@link looksLikeSecret}
 * with `*`; drops each query parameter whose name (after `%XX` decoding) is credential-like
 * ({@link SENSITIVE_PARAM_NAMES}, {@link SENSITIVE_PARAM_FRAGMENTS}), whose value contains an
 * `@`, or whose value {@link looksLikeSecret}; then truncates to {@link MAX_PAGE_URL_BYTES}.
 * Returns `null` when nothing is left.
 */
export function sanitizePageUrl(url: string): string | null {
  let s = stripControl(url).trim();
  const hash = s.indexOf('#');
  if (hash !== -1) s = s.slice(0, hash);

  const scheme = s.indexOf('://');
  if (scheme !== -1) {
    const start = scheme + 3;
    let end = s.length;
    for (const sep of ['/', '?']) {
      const at = s.indexOf(sep, start);
      if (at !== -1 && at < end) end = at;
    }
    const at = s.lastIndexOf('@', end - 1);
    if (at >= start) s = s.slice(0, start) + s.slice(at + 1);
  }

  // Opaque tokens in the path (`/reset/<token>`, `/magic/<jwt>`) become `*`.
  const q0 = s.indexOf('?');
  const head = q0 === -1 ? s : s.slice(0, q0);
  let pathStart = 0;
  if (scheme !== -1) {
    const slash = head.indexOf('/', scheme + 3);
    pathStart = slash === -1 ? head.length : slash;
  }
  const path = head
    .slice(pathStart)
    .split('/')
    .map((seg) => (looksLikeSecret(seg) ? '*' : seg))
    .join('/');
  s = head.slice(0, pathStart) + path + (q0 === -1 ? '' : s.slice(q0));

  const q = s.indexOf('?');
  if (q !== -1) {
    const kept: string[] = [];
    for (const part of s.slice(q + 1).split('&')) {
      if (part.length === 0) continue;
      const eq = part.indexOf('=');
      const name = eq === -1 ? part : part.slice(0, eq);
      const raw = eq === -1 ? '' : part.slice(eq + 1);
      const value = raw.toLowerCase();
      if (
        isSensitiveParam(name) ||
        value.includes('@') ||
        value.includes('%40') ||
        looksLikeSecret(raw)
      ) {
        continue;
      }
      kept.push(part);
    }
    s = s.slice(0, q) + (kept.length > 0 ? '?' + kept.join('&') : '');
  }

  s = truncateUtf8(s, MAX_PAGE_URL_BYTES);
  return s.length > 0 ? s : null;
}

/** Control-free, trimmed, at most {@link MAX_KEYWORDS_BYTES}; `null` when empty. */
export function sanitizeKeywords(keywords: string): string | null {
  const s = truncateUtf8(stripControl(keywords).trim(), MAX_KEYWORDS_BYTES);
  return s.length > 0 ? s : null;
}

/**
 * `us_privacy` is never dropped or reinterpreted: the backend reads its third character as the
 * opt-out-of-sale flag, so losing it would turn an opted-out user into a personalised one. It is
 * only made control-free and bounded — truncation keeps the leading characters, flag included.
 */
export function sanitizeUsPrivacy(value: string): string | null {
  const s = stripControl(value).trim().slice(0, MAX_US_PRIVACY_CHARS);
  return s.length > 0 ? s : null;
}

/**
 * `gpp_sid` keeps every section id it carries. The backend splits on `,`/`_` and opts the user
 * out if any id is 7–12, so a stray separator (`"7;8"`) must become a separator, not vanish
 * (`"78"` would lose the opt-out). Every non-digit becomes `,`, runs collapse, and the result is
 * bounded at {@link MAX_GPP_SID_CHARS} on an id boundary.
 */
export function sanitizeGppSid(value: string): string | null {
  const ids = value.split(/[^0-9]+/).filter((id) => id.length > 0);
  let out = '';
  for (const id of ids) {
    const next = out.length === 0 ? id : out + ',' + id;
    if (next.length > MAX_GPP_SID_CHARS) break;
    out = next;
  }
  return out.length > 0 ? out : null;
}

/**
 * `euconsent_v2` / `gpp`: control-free and trimmed. One longer than {@link MAX_CONSENT_BYTES} is
 * omitted rather than truncated — a cut consent string is a corrupt one, and the backend treats
 * a corrupt string exactly as it treats a missing one, so omitting changes nothing but the size.
 */
export function sanitizeConsent(value: string): string | null {
  const s = stripControl(value).trim();
  if (s.length === 0 || utf8Length(s) > MAX_CONSENT_BYTES) return null;
  return s;
}

/** The serve-request fields the guard knows how to clean. */
export interface ServeFields {
  slotId?: string | null;
  slotName?: string | null;
  pageUrl?: string | null;
  pageKeywords?: string | null;
  usPrivacy?: string | null;
  euconsentV2?: string | null;
  gpp?: string | null;
  gppSid?: string | null;
}

export type GuardedParam = readonly [string, string | null];

/**
 * Validate and minimise one serve request. Returns the ordered query params to send, or `null`
 * when the request must not be sent at all: no usable slot, a `slot_id` that is not a UUID (the
 * server would answer `400`), or an over-long `slot_name`.
 */
export function guardServeParams(apiKey: string, fields: ServeFields): GuardedParam[] | null {
  const slotId = fields.slotId ? fields.slotId.trim() : '';
  const slotName = fields.slotName ? stripControl(fields.slotName).trim() : '';
  if (slotId.length > 0) {
    if (!isUuid(slotId)) return null;
  } else if (slotName.length === 0 || utf8Length(slotName) > MAX_SLOT_NAME_BYTES) {
    return null;
  }
  const opt = <T>(v: T | null | undefined, f: (x: T) => string | null): string | null =>
    v === null || v === undefined ? null : f(v);
  return [
    ['api_key', apiKey],
    ['slot_id', slotId.length > 0 ? slotId : null],
    ['slot_name', slotId.length > 0 ? null : slotName],
    ['page_url', opt(fields.pageUrl, sanitizePageUrl)],
    ['page_keywords', opt(fields.pageKeywords, sanitizeKeywords)],
    ['us_privacy', opt(fields.usPrivacy, sanitizeUsPrivacy)],
    ['euconsent_v2', opt(fields.euconsentV2, sanitizeConsent)],
    ['gpp', opt(fields.gpp, sanitizeConsent)],
    ['gpp_sid', opt(fields.gppSid, sanitizeGppSid)],
  ];
}

/**
 * Client-side rate bound for one (base URL, api key): a token bucket of
 * {@link MAX_REQUESTS_PER_MINUTE} refilled continuously, plus a circuit breaker that stops every
 * request after a `429` until its `Retry-After` has passed. The server's per-key budget is shared
 * by a site's whole audience (CONTRACT.md §8), so once it says "slow down", every slot on the
 * device backs off together instead of each one finding out with its own request.
 *
 * Time is passed in (epoch ms) so the policy is unit-testable without a clock.
 */
export class RequestGuard {
  private tokens = MAX_REQUESTS_PER_MINUTE;
  private refilledAt: number | null = null;
  private blockedUntil = 0;

  /** Take one request slot. Returns `null` if the request may go, else seconds to wait. */
  acquire(nowMs: number): number | null {
    if (nowMs < this.blockedUntil) return Math.ceil((this.blockedUntil - nowMs) / 1000);
    const perMs = MAX_REQUESTS_PER_MINUTE / 60_000;
    if (this.refilledAt !== null) {
      const elapsed = Math.max(0, nowMs - this.refilledAt);
      this.tokens = Math.min(MAX_REQUESTS_PER_MINUTE, this.tokens + elapsed * perMs);
    }
    this.refilledAt = nowMs;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return null;
    }
    return Math.max(1, Math.ceil((1 - this.tokens) / perMs / 1000));
  }

  /** Record the server's answer. A `429` opens the breaker for its `Retry-After`. */
  record(status: number, retryAfterSeconds: number | null, nowMs: number): void {
    if (status !== 429) return;
    const seconds =
      retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds, MAX_RATE_LIMIT_BACKOFF_SECONDS)
        : DEFAULT_RATE_LIMIT_BACKOFF_SECONDS;
    this.blockedUntil = Math.max(this.blockedUntil, nowMs + seconds * 1000);
  }
}

const guards = new Map<string, RequestGuard>();

/** The process-wide guard for one (base URL, api key) — shared by every client and banner. */
export function requestGuardFor(baseUrl: string, apiKey: string): RequestGuard {
  const id = baseUrl + ' ' + apiKey;
  let guard = guards.get(id);
  if (!guard) {
    guard = new RequestGuard();
    guards.set(id, guard);
  }
  return guard;
}

/** Forget every guard's state. For tests. */
export function resetRequestGuards(): void {
  guards.clear();
}

/** The part of a fetch `Response` {@link readCappedText} needs. */
export interface CappedReadable {
  headers: { get(name: string): string | null };
  body?: { cancel(): Promise<void> } | null;
  text(): Promise<string>;
}

/**
 * Read a response body as text, or `null` when it is larger than {@link MAX_RESPONSE_BYTES}.
 *
 * For runtimes without a streaming reader (browsers' `text()`, React Native's XHR-backed fetch):
 * a declared `Content-Length` over the cap is refused without reading the body, and a body read
 * whole is refused when its length is over the cap. Every UTF-16 code unit encodes to at least
 * one UTF-8 byte, so `text.length > MAX` already proves the body was over the byte cap.
 */
export async function readCappedText(resp: CappedReadable): Promise<string | null> {
  const declared = Number.parseInt(resp.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    try {
      await resp.body?.cancel();
    } catch {
      // nothing to release
    }
    return null;
  }
  const text = await resp.text();
  return text.length > MAX_RESPONSE_BYTES ? null : text;
}
