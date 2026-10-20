"""SQL-filter-safe query encoding (CONTRACT.md §7).

The backend runs a WAF middleware (``SqlInjectionMiddleware``) that lowercases the
*entire raw query string* and returns HTTP 403 if it contains any of a list of SQL-ish
substrings — including very common ones like ``end``, ``open``, ``cast``, ``select``,
``table`` and ``@`` that appear constantly inside real URLs (``weekend``, ``broadcast``,
``timetable``, ``/opensource``, ``user@host``).

To make ordinary ``page_url`` / ``page_keywords`` / consent values survive the WAF, we
percent-encode **every byte** of each value as ``%XX``. The raw query then contains only
``%``, hex digits, ``&``, ``=`` and the (keyword-free) parameter names, so no blocked
substring can ever appear — while the server still percent-decodes each value back to its
true form for the handler.
"""

from __future__ import annotations

from typing import Iterable, List, Optional, Tuple

# Verbatim mirror of the backend keyword list (theaimart-adnetwork
# src/middleware/sql_injection.rs). Kept here only for the self-check + tests; the
# guarantee comes from full byte-encoding, not from scrubbing these out.
SQL_INJECTION_KEYWORDS: Tuple[str, ...] = (
    "--", ";--", "/*", "*/", "@@", "@", "char", "nchar", "varchar", "nvarchar",
    "alter", "begin", "cast", "create", "cursor", "declare", "delete", "drop", "end",
    "exec", "execute", "fetch", "insert", "kill", "open", "select", "sys",
    "sysobjects", "syscolumns", "table", "update", "union", "waitfor", "xp_",
    "sp_", "' or '1'='1", "' or 1=1", "1=1", "or 1=1",
)

_HEX = "0123456789ABCDEF"


def percent_encode_all(value: str) -> str:
    """Percent-encode **every** UTF-8 byte of ``value`` as uppercase ``%XX``.

    The result contains no ASCII letters other than the fixed hex alphabet
    ``0-9A-F``, so it can never contain a SQL keyword substring (none of the
    backend keywords are composed solely of hex characters).
    """
    out: List[str] = []
    for byte in value.encode("utf-8"):
        out.append("%")
        out.append(_HEX[byte >> 4])
        out.append(_HEX[byte & 0x0F])
    return "".join(out)


def build_serve_query(params: Iterable[Tuple[str, Optional[str]]]) -> str:
    """Build a ``a=…&b=…`` query string from ordered ``(name, value)`` pairs.

    Every value is fully percent-encoded (see :func:`percent_encode_all`). Pairs whose
    value is ``None`` are skipped. Parameter *names* are emitted verbatim — they are a
    fixed, audited set (``api_key``, ``slot_id``, ``slot_name``, ``page_url``,
    ``page_keywords``, ``us_privacy``, ``euconsent_v2``) that contains no WAF keyword.
    """
    parts: List[str] = []
    for name, value in params:
        if value is None:
            continue
        parts.append(name + "=" + percent_encode_all(value))
    return "&".join(parts)


def raw_query_is_waf_safe(raw_query: str) -> bool:
    """Return ``False`` if ``raw_query`` (as the backend WAF would see it) contains any
    blocked keyword. This mirrors the server check exactly and is used as a
    belt-and-suspenders assertion in tests. A query built by :func:`build_serve_query`
    always returns ``True`` here.
    """
    lowered = raw_query.lower()
    return not any(keyword in lowered for keyword in SQL_INJECTION_KEYWORDS)
