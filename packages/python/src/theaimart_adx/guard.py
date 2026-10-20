"""Outbound request guard (CONTRACT.md §12).

Everything this SDK puts on the wire to the ad server passes through here first: the config is
held to a client-safe shape (a public ``pk_`` key over TLS), every request field is validated,
minimised and length-bounded, and the request rate is capped on the client so a buggy
integration — a render loop, a retry storm — never reaches the server as load.

Implements exactly the rules of the Node/Web/React Native ``guard.ts`` and is asserted with the
same test vectors.
"""

from __future__ import annotations

import math
import re
import threading
from typing import Callable, Dict, List, Optional, Tuple

#: Longest ``page_url`` sent, in UTF-8 bytes. Longer values are truncated.
MAX_PAGE_URL_BYTES = 2048
#: Longest ``page_keywords`` sent, in UTF-8 bytes. Longer values are truncated.
MAX_KEYWORDS_BYTES = 1024
#: Longest ``slot_name`` accepted, in UTF-8 bytes. A longer one makes the request invalid.
MAX_SLOT_NAME_BYTES = 128
#: Longest ``euconsent_v2`` / ``gpp`` sent, in UTF-8 bytes. A longer one is omitted, never cut.
MAX_CONSENT_BYTES = 8192
#: Longest ``us_privacy`` sent, in characters. A real one is 4.
MAX_US_PRIVACY_CHARS = 32
#: Longest ``gpp_sid`` sent, in characters.
MAX_GPP_SID_CHARS = 128
#: Longest forwarded header value (User-Agent, client IP) sent.
MAX_HEADER_VALUE_CHARS = 512
#: Largest response body read from the ad server.
MAX_RESPONSE_BYTES = 512 * 1024
#: Client-side ad-request budget per (base URL, api key): a token bucket refilled per second.
MAX_REQUESTS_PER_MINUTE = 60
#: How long every request backs off after a ``429`` with no usable ``Retry-After``.
DEFAULT_RATE_LIMIT_BACKOFF_SECONDS = 60
#: Upper bound on any ``429`` backoff, so a hostile ``Retry-After`` cannot silence a slot for good.
MAX_RATE_LIMIT_BACKOFF_SECONDS = 600

#: Local no-fill reasons. No request was sent for either.
REASON_INVALID_REQUEST = "invalid_request"
REASON_RATE_LIMITED = "rate_limited"

_PUBLISHABLE_KEY = re.compile(r"pk_[A-Za-z0-9_-]{1,97}")
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_IMP_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
_IDENTITY = re.compile(r"[A-Za-z0-9._+/=-]{1,512}")
_IPV4 = re.compile(r"[0-9]{1,3}(\.[0-9]{1,3}){3}")
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_UNSAFE_URL_CHAR = re.compile(r"[\s@?#\\\x00-\x1f\x7f-\x9f]")
_NON_DIGITS = re.compile(r"[^0-9]+")
_TOKEN_CHARS = re.compile(r"[A-Za-z0-9_.~=-]+")
_TOKEN_SPLIT = re.compile(r"[-._~=]")
_LETTER = re.compile(r"[A-Za-z]")
_DIGIT = re.compile(r"[0-9]")
_ASCII_ESCAPE = re.compile(r"%([0-7][0-9A-Fa-f])")

#: Query-parameter names that carry credentials or personal data, matched exactly.
SENSITIVE_PARAM_NAMES: Tuple[str, ...] = (
    "code", "state", "key", "sig", "sid", "nonce", "ticket", "otp", "pin",
    "email", "phone", "password", "pass", "pwd", "ssn",
)
#: Query-parameter name fragments that carry credentials, matched as substrings.
SENSITIVE_PARAM_FRAGMENTS: Tuple[str, ...] = (
    "token", "secret", "passw", "session", "auth", "jwt", "signature",
    "apikey", "api_key", "access_key", "credential", "private",
)


def is_publishable_key(key: str) -> bool:
    """Whether ``key`` is a publishable site key. A client SDK only ever carries the public
    ``pk_`` key a site is issued — an account JWT, a dashboard token or a pasted secret is
    refused before it can be shipped or sent in a query string."""
    return isinstance(key, str) and _PUBLISHABLE_KEY.fullmatch(key) is not None


def _is_local_host(host: str) -> bool:
    if host == "localhost" or host.endswith(".localhost") or host == "[::1]":
        return True
    if not _IPV4.fullmatch(host):
        return False
    a, b = (int(p) for p in host.split(".")[:2])
    return a == 127 or a == 10 or (a == 192 and b == 168) or (a == 172 and 16 <= b <= 31)


def normalize_base_url(url: str) -> Optional[str]:
    """Normalise a base URL, or ``None`` if it is unsafe. ``https`` is required; plain ``http``
    only for a loopback or private-network host. Credentials, a query, a fragment, a backslash
    or whitespace are refused — each is a credential leak or a way to point ``base + path``
    somewhere other than the ad server."""
    s = url.strip().rstrip("/")
    if _UNSAFE_URL_CHAR.search(s):
        return None
    lowered = s.lower()
    if lowered.startswith("https://"):
        rest, secure = lowered[8:], True
    elif lowered.startswith("http://"):
        rest, secure = lowered[7:], False
    else:
        return None
    authority = rest.split("/", 1)[0]
    if authority.startswith("["):
        close = authority.find("]")
        if close == -1:
            return None
        host = authority[: close + 1]
    else:
        host = authority.split(":", 1)[0]
    if not host:
        return None
    if not secure and not _is_local_host(host):
        return None
    return s


def is_uuid(value: str) -> bool:
    return _UUID.fullmatch(value) is not None


def is_safe_imp_id(value: Optional[str]) -> bool:
    """Whether an ``imp_id`` may be echoed back to the server. Real ones are ``<millis>_<uuid>``."""
    return isinstance(value, str) and _IMP_ID.fullmatch(value) is not None


def is_safe_identity_cookie(value: Optional[str]) -> bool:
    """Whether an ``_an_id`` may be stored or sent as a ``Cookie``: the server's own alphabet."""
    return isinstance(value, str) and _IDENTITY.fullmatch(value) is not None


def strip_control(value: str) -> str:
    """Remove C0, DEL and C1 control characters."""
    return _CONTROL.sub("", value)


def safe_header_value(value: str) -> str:
    """A header value the caller supplied (forwarded UA, client IP): control-free and bounded."""
    return strip_control(value)[:MAX_HEADER_VALUE_CHARS]


def truncate_utf8(value: str, max_bytes: int) -> str:
    """Truncate to at most ``max_bytes`` UTF-8 bytes without splitting a character."""
    encoded = value.encode("utf-8", "surrogatepass")
    if len(encoded) <= max_bytes:
        return value
    return encoded[:max_bytes].decode("utf-8", "ignore")


def _utf8_len(value: str) -> int:
    return len(value.encode("utf-8", "surrogatepass"))


def looks_like_secret(value: str) -> bool:
    """Whether a path segment or query value looks like an opaque credential — a reset/magic-link
    token, a session id, a hex digest, a JWT — whatever it is called. At least 24 chars of
    ``[A-Za-z0-9_.~=-]`` with one ``-._~=``-separated piece of 16+ chars mixing letters and digits.
    Words, hyphenated slugs, UUIDs and anything with spaces do not match."""
    if len(value) < 24 or not _TOKEN_CHARS.fullmatch(value):
        return False
    return any(
        len(p) >= 16 and _LETTER.search(p) and _DIGIT.search(p) for p in _TOKEN_SPLIT.split(value)
    )


def _decode_ascii_escapes(value: str) -> str:
    return _ASCII_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), value)


def _is_sensitive_param(name: str) -> bool:
    n = _decode_ascii_escapes(name).lower().replace("-", "_")
    return n in SENSITIVE_PARAM_NAMES or any(f in n for f in SENSITIVE_PARAM_FRAGMENTS)


def sanitize_page_url(url: str) -> Optional[str]:
    """Minimise a page URL before it leaves the device. The backend stores ``page_url`` with the
    impression and forwards it to OpenRTB bidders, so it must never carry an OAuth
    ``#access_token``, a ``?token=``/``?session=``, a ``user:password@`` authority or an email.

    Drops the fragment and any userinfo; drops each query parameter whose name is
    credential-like or whose value contains ``@``; truncates to :data:`MAX_PAGE_URL_BYTES`.
    Returns ``None`` when nothing is left."""
    s = strip_control(url).strip()
    s = s.split("#", 1)[0]

    scheme = s.find("://")
    if scheme != -1:
        start = scheme + 3
        end = len(s)
        for sep in ("/", "?"):
            at = s.find(sep, start)
            if at != -1 and at < end:
                end = at
        at = s.rfind("@", start, end)
        if at != -1:
            s = s[:start] + s[at + 1:]

    # Opaque tokens in the path (``/reset/<token>``, ``/magic/<jwt>``) become ``*``.
    q0 = s.find("?")
    head, tail = (s, "") if q0 == -1 else (s[:q0], s[q0:])
    path_start = 0
    if scheme != -1:
        slash = head.find("/", scheme + 3)
        path_start = len(head) if slash == -1 else slash
    path = "/".join("*" if looks_like_secret(seg) else seg for seg in head[path_start:].split("/"))
    s = head[:path_start] + path + tail

    q = s.find("?")
    if q != -1:
        kept: List[str] = []
        for part in s[q + 1:].split("&"):
            if not part:
                continue
            name, _, raw = part.partition("=")
            value = raw.lower()
            if (
                _is_sensitive_param(name)
                or "@" in value
                or "%40" in value
                or looks_like_secret(raw)
            ):
                continue
            kept.append(part)
        s = s[:q] + ("?" + "&".join(kept) if kept else "")

    s = truncate_utf8(s, MAX_PAGE_URL_BYTES)
    return s or None


def sanitize_keywords(keywords: str) -> Optional[str]:
    """Control-free, trimmed, at most :data:`MAX_KEYWORDS_BYTES`; ``None`` when empty."""
    s = truncate_utf8(strip_control(keywords).strip(), MAX_KEYWORDS_BYTES)
    return s or None


def sanitize_us_privacy(value: str) -> Optional[str]:
    """Never dropped or reinterpreted — the backend reads the third character as the
    opt-out-of-sale flag. Only made control-free and bounded; truncation keeps that flag."""
    s = strip_control(value).strip()[:MAX_US_PRIVACY_CHARS]
    return s or None


def sanitize_gpp_sid(value: str) -> Optional[str]:
    """Keeps every section id: any non-digit becomes ``,`` (``"7;8"`` → ``"7,8"``, never
    ``"78"``, which would lose a US opt-out). Bounded at :data:`MAX_GPP_SID_CHARS` on an id
    boundary."""
    out = ""
    for sid in _NON_DIGITS.split(value):
        if not sid:
            continue
        nxt = sid if not out else out + "," + sid
        if len(nxt) > MAX_GPP_SID_CHARS:
            break
        out = nxt
    return out or None


def sanitize_consent(value: str) -> Optional[str]:
    """``euconsent_v2`` / ``gpp``: control-free, trimmed. One longer than
    :data:`MAX_CONSENT_BYTES` is omitted rather than truncated — a cut consent string is a corrupt
    one, which the backend treats exactly like a missing one."""
    s = strip_control(value).strip()
    if not s or _utf8_len(s) > MAX_CONSENT_BYTES:
        return None
    return s


def _opt(value: Optional[str], fn: Callable[[str], Optional[str]]) -> Optional[str]:
    return None if value is None else fn(value)


def guard_serve_params(
    api_key: str,
    *,
    slot_id: Optional[str] = None,
    slot_name: Optional[str] = None,
    page_url: Optional[str] = None,
    page_keywords: Optional[str] = None,
    us_privacy: Optional[str] = None,
    euconsent_v2: Optional[str] = None,
    gpp: Optional[str] = None,
    gpp_sid: Optional[str] = None,
) -> Optional[List[Tuple[str, Optional[str]]]]:
    """Validate and minimise one serve request. Returns the ordered query params, or ``None``
    when it must not be sent: no usable slot, a ``slot_id`` that is not a UUID (the server would
    answer ``400``), or an over-long ``slot_name``."""
    sid = str(slot_id).strip() if slot_id else ""
    name = strip_control(slot_name).strip() if slot_name else ""
    if sid:
        if not is_uuid(sid):
            return None
    elif not name or _utf8_len(name) > MAX_SLOT_NAME_BYTES:
        return None
    return [
        ("api_key", api_key),
        ("slot_id", sid or None),
        ("slot_name", None if sid else name),
        ("page_url", _opt(page_url, sanitize_page_url)),
        ("page_keywords", _opt(page_keywords, sanitize_keywords)),
        ("us_privacy", _opt(us_privacy, sanitize_us_privacy)),
        ("euconsent_v2", _opt(euconsent_v2, sanitize_consent)),
        ("gpp", _opt(gpp, sanitize_consent)),
        ("gpp_sid", _opt(gpp_sid, sanitize_gpp_sid)),
    ]


class RequestGuard:
    """Client-side rate bound for one (base URL, api key): a token bucket of
    :data:`MAX_REQUESTS_PER_MINUTE` refilled continuously, plus a circuit breaker that stops every
    request after a ``429`` until its ``Retry-After`` has passed. Thread-safe. Time is passed in
    (epoch ms) so the policy is unit-testable without a clock."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens = float(MAX_REQUESTS_PER_MINUTE)
        self._refilled_at: Optional[float] = None
        self._blocked_until = 0.0

    def acquire(self, now_ms: float) -> Optional[int]:
        """Take one request slot. ``None`` if the request may go, else seconds to wait."""
        with self._lock:
            if now_ms < self._blocked_until:
                return math.ceil((self._blocked_until - now_ms) / 1000)
            per_ms = MAX_REQUESTS_PER_MINUTE / 60_000
            if self._refilled_at is not None:
                elapsed = max(0.0, now_ms - self._refilled_at)
                self._tokens = min(float(MAX_REQUESTS_PER_MINUTE), self._tokens + elapsed * per_ms)
            self._refilled_at = now_ms
            if self._tokens >= 1:
                self._tokens -= 1
                return None
            return max(1, math.ceil((1 - self._tokens) / per_ms / 1000))

    def record(self, status: int, retry_after_seconds: Optional[int], now_ms: float) -> None:
        """Record the server's answer. A ``429`` opens the breaker for its ``Retry-After``."""
        if status != 429:
            return
        if retry_after_seconds is not None and retry_after_seconds > 0:
            seconds = min(retry_after_seconds, MAX_RATE_LIMIT_BACKOFF_SECONDS)
        else:
            seconds = DEFAULT_RATE_LIMIT_BACKOFF_SECONDS
        with self._lock:
            self._blocked_until = max(self._blocked_until, now_ms + seconds * 1000)


_guards: Dict[str, RequestGuard] = {}
_guards_lock = threading.Lock()


def request_guard_for(base_url: str, api_key: str) -> RequestGuard:
    """The process-wide guard for one (base URL, api key) — shared by every client and widget."""
    key = base_url + " " + api_key
    with _guards_lock:
        guard = _guards.get(key)
        if guard is None:
            guard = _guards[key] = RequestGuard()
        return guard


def reset_request_guards() -> None:
    """Forget every guard's state. For tests."""
    with _guards_lock:
        _guards.clear()
