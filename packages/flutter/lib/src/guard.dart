// Outbound request guard (CONTRACT.md §12).
//
// Everything this SDK puts on the wire to the ad server passes through here first: the config is
// held to a client-safe shape (a public `pk_` key over TLS), every request field is validated,
// minimised and length-bounded, and the request rate is capped on the device so a buggy
// integration — a rebuild loop, a retry storm — never reaches the server as load.
//
// Implements exactly the rules of the Node/Web/React Native `guard.ts` and is asserted with the
// same test vectors.
import 'dart:convert';
import 'dart:math' as math;

const int maxPageUrlBytes = 2048;
const int maxKeywordsBytes = 1024;
const int maxSlotNameBytes = 128;
const int maxConsentBytes = 8192;
const int maxUsPrivacyChars = 32;
const int maxGppSidChars = 128;
const int maxHeaderValueChars = 512;
const int maxResponseBytes = 512 * 1024;
const int maxRequestsPerMinute = 60;
const int defaultRateLimitBackoffSeconds = 60;
const int maxRateLimitBackoffSeconds = 600;

/// Local no-fill reasons. No request was sent for any of them.
const String reasonInvalidRequest = 'invalid_request';
const String reasonRateLimited = 'rate_limited';
const String reasonInvalidConfig = 'invalid_config';

final RegExp _publishableKey = RegExp(r'^pk_[A-Za-z0-9_-]{1,97}$');
final RegExp _uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
final RegExp _impId = RegExp(r'^[A-Za-z0-9_-]{1,128}$');
final RegExp _identity = RegExp(r'^[A-Za-z0-9._+/=-]{1,512}$');
final RegExp _ipv4 = RegExp(r'^[0-9]{1,3}(\.[0-9]{1,3}){3}$');
final RegExp _control = RegExp('[\u0000-\u001f\u007f-\u009f]');
final RegExp _unsafeUrlChar = RegExp('[\\s@?#\\\\\u0000-\u001f\u007f-\u009f]');
final RegExp _nonDigits = RegExp(r'[^0-9]+');
final RegExp _tokenChars = RegExp(r'^[A-Za-z0-9_.~=-]+$');
final RegExp _tokenSplit = RegExp(r'[-._~=]');
final RegExp _letter = RegExp(r'[A-Za-z]');
final RegExp _digit = RegExp(r'[0-9]');
final RegExp _asciiEscape = RegExp(r'%([0-7][0-9A-Fa-f])');

/// Whether a path segment or query value looks like an opaque credential — a reset/magic-link
/// token, a session id, a hex digest, a JWT — whatever it is called: 24+ chars of
/// `[A-Za-z0-9_.~=-]` with one `-._~=`-separated piece of 16+ chars mixing letters and digits.
bool looksLikeSecret(String value) {
  if (value.length < 24 || !_tokenChars.hasMatch(value)) return false;
  return value.split(_tokenSplit).any((piece) =>
      piece.length >= 16 && _letter.hasMatch(piece) && _digit.hasMatch(piece));
}

String _decodeAsciiEscapes(String value) => value.replaceAllMapped(
    _asciiEscape, (m) => String.fromCharCode(int.parse(m[1]!, radix: 16)));

/// Query-parameter names that carry credentials or personal data, matched exactly.
const List<String> sensitiveParamNames = [
  'code', 'state', 'key', 'sig', 'sid', 'nonce', 'ticket', 'otp', 'pin', //
  'email', 'phone', 'password', 'pass', 'pwd', 'ssn',
];

/// Query-parameter name fragments that carry credentials, matched as substrings.
const List<String> sensitiveParamFragments = [
  'token', 'secret', 'passw', 'session', 'auth', 'jwt', 'signature', //
  'apikey', 'api_key', 'access_key', 'credential', 'private',
];

/// Whether [key] is a publishable site key — never an account token or secret.
bool isPublishableKey(String key) => _publishableKey.hasMatch(key);

bool _isLocalHost(String host) {
  if (host == 'localhost' || host.endsWith('.localhost') || host == '[::1]') {
    return true;
  }
  if (!_ipv4.hasMatch(host)) return false;
  final parts = host.split('.').map(int.parse).toList();
  final a = parts[0], b = parts[1];
  return a == 127 ||
      a == 10 ||
      (a == 192 && b == 168) ||
      (a == 172 && b >= 16 && b <= 31);
}

/// Normalise a base URL, or null if it is unsafe: `https` required, plain `http` only for a
/// loopback or private-network host; no credentials, query, fragment, backslash or whitespace.
String? normalizeBaseUrl(String url) {
  var s = url.trim();
  while (s.endsWith('/')) {
    s = s.substring(0, s.length - 1);
  }
  if (_unsafeUrlChar.hasMatch(s)) return null;
  final lowered = s.toLowerCase();
  final String rest;
  final bool secure;
  if (lowered.startsWith('https://')) {
    rest = lowered.substring(8);
    secure = true;
  } else if (lowered.startsWith('http://')) {
    rest = lowered.substring(7);
    secure = false;
  } else {
    return null;
  }
  final authority = rest.split('/').first;
  final String host;
  if (authority.startsWith('[')) {
    final close = authority.indexOf(']');
    if (close == -1) return null;
    host = authority.substring(0, close + 1);
  } else {
    host = authority.split(':').first;
  }
  if (host.isEmpty || (!secure && !_isLocalHost(host))) return null;
  return s;
}

bool isUuid(String value) => _uuid.hasMatch(value);

/// Whether an `imp_id` may be echoed back to the server. Real ones are `<millis>_<uuid>`.
bool isSafeImpId(String? value) => value != null && _impId.hasMatch(value);

/// Whether an `_an_id` may be stored or sent as a `Cookie`: the server's own alphabet.
bool isSafeIdentityCookie(String? value) =>
    value != null && _identity.hasMatch(value);

String stripControl(String value) => value.replaceAll(_control, '');

/// A header value the caller supplied: control-free and bounded.
String safeHeaderValue(String value) {
  final s = stripControl(value);
  return s.length > maxHeaderValueChars
      ? s.substring(0, maxHeaderValueChars)
      : s;
}

/// Truncate to at most [maxBytes] UTF-8 bytes without splitting a character.
String truncateUtf8(String value, int maxBytes) {
  var bytes = 0;
  var end = 0;
  for (final cp in value.runes) {
    final size = cp < 0x80
        ? 1
        : cp < 0x800
            ? 2
            : cp < 0x10000
                ? 3
                : 4;
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += cp > 0xFFFF ? 2 : 1;
  }
  return value.substring(0, end);
}

int _utf8Length(String value) => utf8.encode(value).length;

bool _isSensitiveParam(String name) {
  final n = _decodeAsciiEscapes(name).toLowerCase().replaceAll('-', '_');
  return sensitiveParamNames.contains(n) ||
      sensitiveParamFragments.any(n.contains);
}

/// Minimise a page URL before it leaves the device: drop the fragment and any userinfo, drop
/// each query parameter whose name is credential-like or whose value contains `@`, and bound it
/// to [maxPageUrlBytes]. The backend stores `page_url` and forwards it to OpenRTB bidders.
String? sanitizePageUrl(String url) {
  var s = stripControl(url).trim();
  final hash = s.indexOf('#');
  if (hash != -1) s = s.substring(0, hash);

  final scheme = s.indexOf('://');
  if (scheme != -1) {
    final start = scheme + 3;
    var end = s.length;
    for (final sep in const ['/', '?']) {
      final at = s.indexOf(sep, start);
      if (at != -1 && at < end) end = at;
    }
    final at = end > start ? s.lastIndexOf('@', end - 1) : -1;
    if (at >= start) s = s.substring(0, start) + s.substring(at + 1);
  }

  // Opaque tokens in the path (`/reset/<token>`, `/magic/<jwt>`) become `*`.
  final q0 = s.indexOf('?');
  final head = q0 == -1 ? s : s.substring(0, q0);
  final tail = q0 == -1 ? '' : s.substring(q0);
  var pathStart = 0;
  if (scheme != -1) {
    final slash = head.indexOf('/', scheme + 3);
    pathStart = slash == -1 ? head.length : slash;
  }
  final path = head
      .substring(pathStart)
      .split('/')
      .map((seg) => looksLikeSecret(seg) ? '*' : seg)
      .join('/');
  s = head.substring(0, pathStart) + path + tail;

  final q = s.indexOf('?');
  if (q != -1) {
    final kept = <String>[];
    for (final part in s.substring(q + 1).split('&')) {
      if (part.isEmpty) continue;
      final eq = part.indexOf('=');
      final name = eq == -1 ? part : part.substring(0, eq);
      final raw = eq == -1 ? '' : part.substring(eq + 1);
      final value = raw.toLowerCase();
      if (_isSensitiveParam(name) ||
          value.contains('@') ||
          value.contains('%40') ||
          looksLikeSecret(raw)) {
        continue;
      }
      kept.add(part);
    }
    s = s.substring(0, q) + (kept.isNotEmpty ? '?${kept.join('&')}' : '');
  }

  s = truncateUtf8(s, maxPageUrlBytes);
  return s.isEmpty ? null : s;
}

String? sanitizeKeywords(String keywords) {
  final s = truncateUtf8(stripControl(keywords).trim(), maxKeywordsBytes);
  return s.isEmpty ? null : s;
}

/// Never dropped or reinterpreted: the backend reads the third character as the opt-out flag.
String? sanitizeUsPrivacy(String value) {
  var s = stripControl(value).trim();
  if (s.length > maxUsPrivacyChars) s = s.substring(0, maxUsPrivacyChars);
  return s.isEmpty ? null : s;
}

/// Keeps every section id: any non-digit becomes `,` (`"7;8"` → `"7,8"`, never `"78"`).
String? sanitizeGppSid(String value) {
  var out = '';
  for (final id in value.split(_nonDigits)) {
    if (id.isEmpty) continue;
    final next = out.isEmpty ? id : '$out,$id';
    if (next.length > maxGppSidChars) break;
    out = next;
  }
  return out.isEmpty ? null : out;
}

/// Over [maxConsentBytes] it is omitted, never truncated — a cut consent string is corrupt.
String? sanitizeConsent(String value) {
  final s = stripControl(value).trim();
  if (s.isEmpty || _utf8Length(s) > maxConsentBytes) return null;
  return s;
}

/// Validate and minimise one serve request. Returns the ordered query params, or null when it
/// must not be sent: no usable slot, a `slot_id` that is not a UUID, an over-long `slot_name`.
List<MapEntry<String, String?>>? guardServeParams(
  String apiKey, {
  String? slotId,
  String? slotName,
  String? pageUrl,
  String? pageKeywords,
  String? usPrivacy,
  String? euconsentV2,
  String? gpp,
  String? gppSid,
}) {
  final id = slotId?.trim() ?? '';
  final name = slotName == null ? '' : stripControl(slotName).trim();
  if (id.isNotEmpty) {
    if (!isUuid(id)) return null;
  } else if (name.isEmpty || _utf8Length(name) > maxSlotNameBytes) {
    return null;
  }
  final byId = id.isNotEmpty;
  return [
    MapEntry('api_key', apiKey),
    MapEntry('slot_id', byId ? id : null),
    MapEntry('slot_name', byId ? null : name),
    MapEntry('page_url', pageUrl == null ? null : sanitizePageUrl(pageUrl)),
    MapEntry('page_keywords',
        pageKeywords == null ? null : sanitizeKeywords(pageKeywords)),
    MapEntry(
        'us_privacy', usPrivacy == null ? null : sanitizeUsPrivacy(usPrivacy)),
    MapEntry('euconsent_v2',
        euconsentV2 == null ? null : sanitizeConsent(euconsentV2)),
    MapEntry('gpp', gpp == null ? null : sanitizeConsent(gpp)),
    MapEntry('gpp_sid', gppSid == null ? null : sanitizeGppSid(gppSid)),
  ];
}

/// Client-side rate bound for one (base URL, api key): a token bucket of
/// [maxRequestsPerMinute] refilled continuously, plus a circuit breaker that stops every request
/// after a `429` until its `Retry-After` has passed. Time is passed in (epoch ms).
class RequestGuard {
  double _tokens = maxRequestsPerMinute.toDouble();
  int? _refilledAt;
  int _blockedUntil = 0;

  /// Take one request slot. Null if the request may go, else seconds to wait.
  int? acquire(int nowMs) {
    if (nowMs < _blockedUntil) return ((_blockedUntil - nowMs) / 1000).ceil();
    const cap = maxRequestsPerMinute * 1.0;
    const perMs = cap / 60000;
    final at = _refilledAt;
    if (at != null) {
      _tokens = math.min(cap, _tokens + math.max(0, nowMs - at) * perMs);
    }
    _refilledAt = nowMs;
    if (_tokens >= 1) {
      _tokens -= 1;
      return null;
    }
    return math.max(1, ((1 - _tokens) / perMs / 1000).ceil());
  }

  /// Record the server's answer. A `429` opens the breaker for its `Retry-After`.
  void record(int status, int? retryAfterSeconds, int nowMs) {
    if (status != 429) return;
    final seconds = retryAfterSeconds != null && retryAfterSeconds > 0
        ? math.min(retryAfterSeconds, maxRateLimitBackoffSeconds)
        : defaultRateLimitBackoffSeconds;
    _blockedUntil = math.max(_blockedUntil, nowMs + seconds * 1000);
  }
}

final Map<String, RequestGuard> _guards = {};

/// The isolate-wide guard for one (base URL, api key) — shared by every client and banner.
RequestGuard requestGuardFor(String baseUrl, String apiKey) =>
    _guards.putIfAbsent('$baseUrl $apiKey', RequestGuard.new);

/// Forget every guard's state. For tests.
void resetRequestGuards() => _guards.clear();
