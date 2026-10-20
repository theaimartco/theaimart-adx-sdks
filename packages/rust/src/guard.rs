//! Outbound request guard (CONTRACT.md §12).
//!
//! Everything this SDK puts on the wire to the ad server passes through here first: the config
//! is held to a client-safe shape (a public `pk_` key over TLS), every request field is
//! validated, minimised and length-bounded, and the request rate is capped on the client so a
//! buggy integration — a render loop, a retry storm — never reaches the server as load.
//!
//! Implements exactly the rules of the Node/Web/React Native `guard.ts` and is asserted with the
//! same test vectors.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Longest `page_url` sent, in UTF-8 bytes. Longer values are truncated.
pub const MAX_PAGE_URL_BYTES: usize = 2048;
/// Longest `page_keywords` sent, in UTF-8 bytes. Longer values are truncated.
pub const MAX_KEYWORDS_BYTES: usize = 1024;
/// Longest `slot_name` accepted, in UTF-8 bytes. A longer one makes the request invalid.
pub const MAX_SLOT_NAME_BYTES: usize = 128;
/// Longest `euconsent_v2` / `gpp` sent, in UTF-8 bytes. A longer one is omitted, never cut.
pub const MAX_CONSENT_BYTES: usize = 8192;
/// Longest `us_privacy` sent, in characters. A real one is 4.
pub const MAX_US_PRIVACY_CHARS: usize = 32;
/// Longest `gpp_sid` sent, in characters.
pub const MAX_GPP_SID_CHARS: usize = 128;
/// Longest forwarded header value sent.
pub const MAX_HEADER_VALUE_CHARS: usize = 512;
/// Largest response body read from the ad server.
pub const MAX_RESPONSE_BYTES: u64 = 512 * 1024;
/// Client-side ad-request budget per (base URL, api key): a token bucket refilled per second.
pub const MAX_REQUESTS_PER_MINUTE: u32 = 60;
/// How long every request backs off after a `429` with no usable `Retry-After`.
pub const DEFAULT_RATE_LIMIT_BACKOFF_SECONDS: u32 = 60;
/// Upper bound on any `429` backoff, so a hostile `Retry-After` cannot silence a slot for good.
pub const MAX_RATE_LIMIT_BACKOFF_SECONDS: u32 = 600;

/// Local no-fill reason: the request failed validation. Nothing was sent.
pub const REASON_INVALID_REQUEST: &str = "invalid_request";
/// Local no-fill reason: the client budget is spent or the server said `429`. Nothing was sent.
pub const REASON_RATE_LIMITED: &str = "rate_limited";
/// Local no-fill reason: the client was built with an unsafe key or base URL. Nothing is sent.
pub const REASON_INVALID_CONFIG: &str = "invalid_config";

/// Query-parameter names that carry credentials or personal data, matched exactly.
pub const SENSITIVE_PARAM_NAMES: &[&str] = &[
    "code", "state", "key", "sig", "sid", "nonce", "ticket", "otp", "pin", "email", "phone",
    "password", "pass", "pwd", "ssn",
];
/// Query-parameter name fragments that carry credentials, matched as substrings.
pub const SENSITIVE_PARAM_FRAGMENTS: &[&str] = &[
    "token", "secret", "passw", "session", "auth", "jwt", "signature", "apikey", "api_key",
    "access_key", "credential", "private",
];

fn is_control(c: char) -> bool {
    matches!(c as u32, 0x00..=0x1f | 0x7f..=0x9f)
}

fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Whether `key` is a publishable site key (`pk_` + 1–97 of `[A-Za-z0-9_-]`). A client SDK only
/// ever carries the public key a site is issued — never an account token or secret.
pub fn is_publishable_key(key: &str) -> bool {
    match key.strip_prefix("pk_") {
        Some(rest) => (1..=97).contains(&rest.len()) && rest.chars().all(is_key_char),
        None => false,
    }
}

fn is_ipv4(host: &str) -> Option<[u32; 4]> {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut out = [0u32; 4];
    for (i, p) in parts.iter().enumerate() {
        if p.is_empty() || p.len() > 3 || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        out[i] = p.parse().ok()?;
    }
    Some(out)
}

fn is_local_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") || host == "[::1]" {
        return true;
    }
    match is_ipv4(host) {
        Some([a, b, _, _]) => {
            a == 127 || a == 10 || (a == 192 && b == 168) || (a == 172 && (16..=31).contains(&b))
        }
        None => false,
    }
}

/// Normalise a base URL, or `None` if it is unsafe. `https` is required; plain `http` only for a
/// loopback or private-network host. Credentials, a query, a fragment, a backslash or whitespace
/// are refused — each is a credential leak or a way to point `base + path` elsewhere.
pub fn normalize_base_url(url: &str) -> Option<String> {
    let s = url.trim().trim_end_matches('/');
    if s
        .chars()
        .any(|c| c.is_whitespace() || is_control(c) || matches!(c, '@' | '?' | '#' | '\\'))
    {
        return None;
    }
    let lowered = s.to_ascii_lowercase();
    let (rest, secure) = if let Some(r) = lowered.strip_prefix("https://") {
        (r, true)
    } else if let Some(r) = lowered.strip_prefix("http://") {
        (r, false)
    } else {
        return None;
    };
    let authority = rest.split('/').next().unwrap_or("");
    let host = if authority.starts_with('[') {
        let close = authority.find(']')?;
        &authority[..=close]
    } else {
        authority.split(':').next().unwrap_or("")
    };
    if host.is_empty() || (!secure && !is_local_host(host)) {
        return None;
    }
    Some(s.to_string())
}

/// Whether `value` is a UUID in 8-4-4-4-12 hex form.
pub fn is_uuid(value: &str) -> bool {
    let b = value.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Whether an `imp_id` may be echoed back to the server. Real ones are `<millis>_<uuid>`.
pub fn is_safe_imp_id(value: &str) -> bool {
    (1..=128).contains(&value.len()) && value.chars().all(is_key_char)
}

/// Whether an `_an_id` may be stored or sent as a `Cookie`: the server's own alphabet.
pub fn is_safe_identity_cookie(value: &str) -> bool {
    (1..=512).contains(&value.len())
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '/' | '=' | '-'))
}

/// Remove C0, DEL and C1 control characters.
pub fn strip_control(value: &str) -> String {
    value.chars().filter(|c| !is_control(*c)).collect()
}

/// A header value the caller supplied (forwarded UA): control-free and bounded.
pub fn safe_header_value(value: &str) -> String {
    value
        .chars()
        .filter(|c| !is_control(*c))
        .take(MAX_HEADER_VALUE_CHARS)
        .collect()
}

/// Truncate to at most `max_bytes` UTF-8 bytes without splitting a character.
pub fn truncate_utf8(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

/// Whether a path segment or query value looks like an opaque credential — a reset/magic-link
/// token, a session id, a hex digest, a JWT — whatever it is called. At least 24 chars of
/// `[A-Za-z0-9_.~=-]` with one `-._~=`-separated piece of 16+ chars mixing letters and digits.
/// Words, hyphenated slugs, UUIDs and anything with spaces do not match.
pub fn looks_like_secret(value: &str) -> bool {
    if value.len() < 24
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '~' | '=' | '-'))
    {
        return false;
    }
    value.split(['-', '.', '_', '~', '=']).any(|piece| {
        piece.len() >= 16
            && piece.chars().any(|c| c.is_ascii_alphabetic())
            && piece.chars().any(|c| c.is_ascii_digit())
    })
}

/// Decode `%XX` escapes of ASCII characters, so `%74oken` is read as `token`. Works on bytes:
/// it never slices inside a multi-byte character, and decoded bytes are ASCII so the result stays
/// valid UTF-8.
fn decode_ascii_escapes(value: &str) -> String {
    fn hex(b: u8) -> Option<u8> {
        (b as char).to_digit(16).map(|d| d as u8)
    }
    let b = value.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(hi), Some(lo)) = (hex(b[i + 1]), hex(b[i + 2])) {
                if hi < 8 {
                    out.push(hi * 16 + lo);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn is_sensitive_param(name: &str) -> bool {
    let n = decode_ascii_escapes(name).to_lowercase().replace('-', "_");
    SENSITIVE_PARAM_NAMES.contains(&n.as_str()) || SENSITIVE_PARAM_FRAGMENTS.iter().any(|f| n.contains(f))
}

fn non_empty(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Minimise a page URL before it leaves the device. The backend stores `page_url` with the
/// impression and forwards it to OpenRTB bidders, so it must never carry an OAuth
/// `#access_token`, a `?token=`/`?session=`, a `user:password@` authority or an email.
///
/// Drops the fragment and any userinfo; drops each query parameter whose name is credential-like
/// or whose value contains `@`; truncates to [`MAX_PAGE_URL_BYTES`]. `None` when nothing is left.
pub fn sanitize_page_url(url: &str) -> Option<String> {
    let cleaned = strip_control(url);
    let mut s = cleaned.trim().to_string();
    if let Some(hash) = s.find('#') {
        s.truncate(hash);
    }

    if let Some(scheme) = s.find("://") {
        let start = scheme + 3;
        let end = s[start..]
            .find(['/', '?'])
            .map_or(s.len(), |i| start + i);
        if let Some(at) = s[start..end].rfind('@') {
            s.replace_range(start..start + at + 1, "");
        }
    }

    // Opaque tokens in the path (`/reset/<token>`, `/magic/<jwt>`) become `*`.
    let q0 = s.find('?').unwrap_or(s.len());
    let path_start = match s.find("://") {
        Some(scheme) => s[scheme + 3..q0].find('/').map_or(q0, |i| scheme + 3 + i),
        None => 0,
    };
    let path: Vec<&str> = s[path_start..q0]
        .split('/')
        .map(|seg| if looks_like_secret(seg) { "*" } else { seg })
        .collect();
    s = format!("{}{}{}", &s[..path_start], path.join("/"), &s[q0..]);

    if let Some(q) = s.find('?') {
        let kept: Vec<&str> = s[q + 1..]
            .split('&')
            .filter(|part| {
                if part.is_empty() {
                    return false;
                }
                let (name, raw) = part.split_once('=').unwrap_or((part, ""));
                let value = raw.to_lowercase();
                !(is_sensitive_param(name)
                    || value.contains('@')
                    || value.contains("%40")
                    || looks_like_secret(raw))
            })
            .collect();
        let query = kept.join("&");
        s.truncate(q);
        if !query.is_empty() {
            s.push('?');
            s.push_str(&query);
        }
    }

    non_empty(truncate_utf8(&s, MAX_PAGE_URL_BYTES).to_string())
}

/// Control-free, trimmed, at most [`MAX_KEYWORDS_BYTES`]; `None` when empty.
pub fn sanitize_keywords(keywords: &str) -> Option<String> {
    let s = strip_control(keywords);
    non_empty(truncate_utf8(s.trim(), MAX_KEYWORDS_BYTES).to_string())
}

/// Never dropped or reinterpreted — the backend reads the third character as the opt-out-of-sale
/// flag. Only made control-free and bounded; truncation keeps that flag.
pub fn sanitize_us_privacy(value: &str) -> Option<String> {
    non_empty(strip_control(value).trim().chars().take(MAX_US_PRIVACY_CHARS).collect())
}

/// Keeps every section id: any non-digit becomes `,` (`"7;8"` → `"7,8"`, never `"78"`, which
/// would lose a US opt-out). Bounded at [`MAX_GPP_SID_CHARS`] on an id boundary.
pub fn sanitize_gpp_sid(value: &str) -> Option<String> {
    let mut out = String::new();
    for id in value.split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty()) {
        let extra = if out.is_empty() { id.len() } else { id.len() + 1 };
        if out.len() + extra > MAX_GPP_SID_CHARS {
            break;
        }
        if !out.is_empty() {
            out.push(',');
        }
        out.push_str(id);
    }
    non_empty(out)
}

/// `euconsent_v2` / `gpp`: control-free, trimmed. One longer than [`MAX_CONSENT_BYTES`] is
/// omitted rather than truncated — a cut consent string is a corrupt one, which the backend
/// treats exactly like a missing one.
pub fn sanitize_consent(value: &str) -> Option<String> {
    let s = strip_control(value);
    let s = s.trim();
    if s.is_empty() || s.len() > MAX_CONSENT_BYTES {
        return None;
    }
    Some(s.to_string())
}

/// The serve-request fields the guard cleans.
#[derive(Debug, Clone, Default)]
pub struct ServeFields<'a> {
    pub slot_id: Option<&'a str>,
    pub slot_name: Option<&'a str>,
    pub page_url: Option<&'a str>,
    pub page_keywords: Option<&'a str>,
    pub us_privacy: Option<&'a str>,
    pub euconsent_v2: Option<&'a str>,
    pub gpp: Option<&'a str>,
    pub gpp_sid: Option<&'a str>,
}

/// Validate and minimise one serve request. Returns the ordered query params, or `None` when it
/// must not be sent: no usable slot, a `slot_id` that is not a UUID (the server would answer
/// `400`), or an over-long `slot_name`.
pub fn guard_serve_params(
    api_key: &str,
    fields: &ServeFields,
) -> Option<Vec<(&'static str, Option<String>)>> {
    let slot_id = fields.slot_id.map(str::trim).unwrap_or("");
    let slot_name = fields.slot_name.map(|n| strip_control(n).trim().to_string()).unwrap_or_default();
    if !slot_id.is_empty() {
        if !is_uuid(slot_id) {
            return None;
        }
    } else if slot_name.is_empty() || slot_name.len() > MAX_SLOT_NAME_BYTES {
        return None;
    }
    let by_id = !slot_id.is_empty();
    Some(vec![
        ("api_key", Some(api_key.to_string())),
        ("slot_id", by_id.then(|| slot_id.to_string())),
        ("slot_name", (!by_id).then_some(slot_name)),
        ("page_url", fields.page_url.and_then(sanitize_page_url)),
        ("page_keywords", fields.page_keywords.and_then(sanitize_keywords)),
        ("us_privacy", fields.us_privacy.and_then(sanitize_us_privacy)),
        ("euconsent_v2", fields.euconsent_v2.and_then(sanitize_consent)),
        ("gpp", fields.gpp.and_then(sanitize_consent)),
        ("gpp_sid", fields.gpp_sid.and_then(sanitize_gpp_sid)),
    ])
}

/// Client-side rate bound for one (base URL, api key): a token bucket of
/// [`MAX_REQUESTS_PER_MINUTE`] refilled continuously, plus a circuit breaker that stops every
/// request after a `429` until its `Retry-After` has passed. Time is passed in (epoch ms).
#[derive(Debug)]
pub struct RequestGuard {
    tokens: f64,
    refilled_at: Option<u64>,
    blocked_until: u64,
}

impl Default for RequestGuard {
    fn default() -> Self {
        RequestGuard {
            tokens: f64::from(MAX_REQUESTS_PER_MINUTE),
            refilled_at: None,
            blocked_until: 0,
        }
    }
}

impl RequestGuard {
    pub fn new() -> Self {
        Self::default()
    }

    /// Take one request slot. `None` if the request may go, else seconds to wait.
    pub fn acquire(&mut self, now_ms: u64) -> Option<u32> {
        if now_ms < self.blocked_until {
            return Some(((self.blocked_until - now_ms) as f64 / 1000.0).ceil() as u32);
        }
        let cap = f64::from(MAX_REQUESTS_PER_MINUTE);
        let per_ms = cap / 60_000.0;
        if let Some(at) = self.refilled_at {
            let elapsed = now_ms.saturating_sub(at) as f64;
            self.tokens = (self.tokens + elapsed * per_ms).min(cap);
        }
        self.refilled_at = Some(now_ms);
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            return None;
        }
        Some((((1.0 - self.tokens) / per_ms / 1000.0).ceil() as u32).max(1))
    }

    /// Record the server's answer. A `429` opens the breaker for its `Retry-After`.
    pub fn record(&mut self, status: u16, retry_after_seconds: Option<u32>, now_ms: u64) {
        if status != 429 {
            return;
        }
        let seconds = match retry_after_seconds {
            Some(s) if s > 0 => s.min(MAX_RATE_LIMIT_BACKOFF_SECONDS),
            _ => DEFAULT_RATE_LIMIT_BACKOFF_SECONDS,
        };
        self.blocked_until = self.blocked_until.max(now_ms + u64::from(seconds) * 1000);
    }
}

type Registry = Mutex<HashMap<String, Arc<Mutex<RequestGuard>>>>;

fn registry() -> &'static Registry {
    static GUARDS: OnceLock<Registry> = OnceLock::new();
    GUARDS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The process-wide guard for one (base URL, api key) — shared by every client.
pub fn request_guard_for(base_url: &str, api_key: &str) -> Arc<Mutex<RequestGuard>> {
    let mut map = registry().lock().unwrap_or_else(|e| e.into_inner());
    map.entry(format!("{base_url} {api_key}"))
        .or_insert_with(|| Arc::new(Mutex::new(RequestGuard::new())))
        .clone()
}

/// Forget every guard's state. For tests.
pub fn reset_request_guards() {
    registry().lock().unwrap_or_else(|e| e.into_inner()).clear();
}
