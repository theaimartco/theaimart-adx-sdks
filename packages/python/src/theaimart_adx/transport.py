"""HTTP transport abstraction.

The default :class:`UrllibTransport` uses only the Python standard library (no third-party
dependencies). It is injectable so callers can plug in ``requests``/``httpx``/a mock — the
client only depends on the small :class:`Transport` protocol.
"""

from __future__ import annotations

import http.client
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

try:  # Protocol is in typing on 3.8+
    from typing import Protocol
except ImportError:  # pragma: no cover
    from typing_extensions import Protocol  # type: ignore

from .errors import AdxTransportError
from .guard import MAX_RESPONSE_BYTES, is_safe_identity_cookie


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse every redirect. No serve endpoint redirects, and urllib would replay the request —
    ``Cookie`` and ``X-Forwarded-For`` included — to whatever host a redirect named. The ``3xx``
    surfaces as an ``HTTPError`` and becomes a no-fill."""

    def redirect_request(  # noqa: D401
        self, req: object, fp: object, code: int, msg: str, headers: object, newurl: str
    ) -> None:
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _read_capped(stream: object) -> bytes:
    """Read the whole body, at most :data:`MAX_RESPONSE_BYTES`; a larger body is a transport
    error. Reads until EOF, so a keep-alive connection is left clean for its next request."""
    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = stream.read(min(65536, MAX_RESPONSE_BYTES + 1 - total))  # type: ignore[attr-defined]
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > MAX_RESPONSE_BYTES:
            raise AdxTransportError("response too large")
    return b"".join(chunks)


@dataclass
class HttpResponse:
    """A minimal HTTP response. ``headers`` keys are lowercased; duplicate headers
    (notably ``set-cookie``) are newline-joined."""

    status: int
    headers: Dict[str, str]
    body: bytes


class Transport(Protocol):
    """Structural interface for a pluggable HTTP transport."""

    def request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Optional[bytes],
        timeout: float,
    ) -> HttpResponse:
        ...


def _headers_to_dict(message: object) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        items = message.items()  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - defensive
        return out
    for key, value in items:
        lk = str(key).lower()
        if lk in out:
            out[lk] = out[lk] + "\n" + str(value)
        else:
            out[lk] = str(value)
    return out


#: A reused keep-alive socket the server already closed fails with one of these *before* any
#: response byte arrives — the request never reached the handler, so one retry on a fresh
#: connection is safe (and is what urllib3/requests do for the same race).
_STALE_CONNECTION_ERRORS = (
    http.client.RemoteDisconnected,
    http.client.CannotSendRequest,
    BrokenPipeError,
    ConnectionResetError,
    ConnectionAbortedError,
)


class _ConnectionPool:
    """Idle keep-alive connections, per (scheme, host, port).

    A connection is checked out by exactly one request at a time, so the pool is safe to share
    between threads (a Flask/Django worker pool, the UI adapters' worker thread). It is reset
    after ``os.fork`` — a pre-forking server (gunicorn ``--preload``) must not have two
    processes interleaving bytes on one inherited socket.
    """

    def __init__(self, max_idle_per_host: int = 8, idle_seconds: float = 30.0) -> None:
        self._max_idle = max_idle_per_host
        self._idle_seconds = idle_seconds
        self._lock = threading.Lock()
        self._idle: Dict[Tuple[str, str, int], List[Tuple[http.client.HTTPConnection, float]]] = {}
        self._pid = os.getpid()

    def _check_fork(self) -> None:
        if self._pid != os.getpid():
            # Inherited sockets belong to the parent: forget them without closing.
            self._idle = {}
            self._pid = os.getpid()

    def take(self, key: Tuple[str, str, int]) -> Optional[http.client.HTTPConnection]:
        now = time.monotonic()
        stale: List[http.client.HTTPConnection] = []
        found: Optional[http.client.HTTPConnection] = None
        with self._lock:
            self._check_fork()
            idle = self._idle.get(key, [])
            while idle:
                conn, since = idle.pop()
                if now - since <= self._idle_seconds:
                    found = conn
                    break
                stale.append(conn)
        for conn in stale:
            conn.close()
        return found

    def give(self, key: Tuple[str, str, int], conn: http.client.HTTPConnection) -> None:
        with self._lock:
            self._check_fork()
            idle = self._idle.setdefault(key, [])
            if len(idle) < self._max_idle:
                idle.append((conn, time.monotonic()))
                return
        conn.close()

    def clear(self) -> None:
        with self._lock:
            idle, self._idle = self._idle, {}
        for conns in idle.values():
            for conn, _ in conns:
                conn.close()


_TLS_CONTEXT = ssl.create_default_context()

#: Shared by every default transport in the process, so many clients (one per banner widget,
#: one per request handler) still share warm connections to the ad server.
_SHARED_POOL = _ConnectionPool()


def _uses_proxy(scheme: str, host: str) -> bool:
    """True when the environment routes this host through a proxy (``HTTPS_PROXY`` & co.,
    honouring ``NO_PROXY``). Those requests keep going through urllib, which implements the
    proxy protocol; the pooled path talks to the origin directly."""
    try:
        return scheme in urllib.request.getproxies() and not urllib.request.proxy_bypass(host)
    except Exception:  # pragma: no cover - platform proxy lookup failures
        return False


class UrllibTransport:
    """Standard-library HTTP transport with keep-alive.

    Requests reuse pooled :mod:`http.client` connections, so a server rendering many pages pays
    the TCP + TLS handshake once per idle period rather than on every ad request (two to three
    round trips, and the TLS CPU, per call). When a proxy is configured in the environment the
    request goes through :mod:`urllib.request` instead, exactly as before.

    Crucially, it sends the request URL verbatim — it does **not** re-encode or normalize
    the query string — so the fully percent-encoded query from
    :func:`~theaimart_adx.encoding.build_serve_query` reaches the server intact and slips
    past the WAF. Redirects are never followed on either path (``http.client`` does not follow
    them at all).
    """

    def __init__(self, pool: Optional[_ConnectionPool] = None) -> None:
        self._pool = pool if pool is not None else _SHARED_POOL
        # Proxy settings are read once per (scheme, host): on Windows and macOS the lookup
        # consults the registry / system configuration, which is not free per ad request.
        self._proxy_cache: Dict[Tuple[str, str], bool] = {}

    def _proxied(self, scheme: str, host: str) -> bool:
        key = (scheme, host)
        cached = self._proxy_cache.get(key)
        if cached is None:
            cached = self._proxy_cache[key] = _uses_proxy(scheme, host)
        return cached

    def close(self) -> None:
        """Close every idle connection in this transport's pool (by default the pool shared by
        every default transport in the process). Safe to call at any time — the next request
        simply opens a new connection."""
        self._pool.clear()

    def request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Optional[bytes],
        timeout: float,
    ) -> HttpResponse:
        parts = urllib.parse.urlsplit(url)
        scheme = parts.scheme.lower()
        host = parts.hostname
        if scheme not in ("http", "https") or not host or self._proxied(scheme, host):
            return self._request_urllib(method, url, headers, body, timeout)
        try:
            port = parts.port or (443 if scheme == "https" else 80)
        except ValueError as exc:
            raise AdxTransportError("invalid port") from exc
        target = parts.path or "/"
        if parts.query:
            target += "?" + parts.query
        key = (scheme, host, port)

        conn = self._pool.take(key)
        if conn is not None:
            try:
                return self._send(key, conn, method, target, headers, body, timeout)
            except _STALE_CONNECTION_ERRORS:
                conn.close()  # the server closed it while it sat idle; use a fresh one
            except AdxTransportError:
                raise
            except (http.client.HTTPException, OSError) as exc:
                conn.close()
                raise AdxTransportError(str(exc) or exc.__class__.__name__) from exc
        conn = self._connect(scheme, host, port, timeout)
        try:
            return self._send(key, conn, method, target, headers, body, timeout)
        except AdxTransportError:
            raise
        except (http.client.HTTPException, OSError) as exc:
            conn.close()
            raise AdxTransportError(str(exc) or exc.__class__.__name__) from exc

    @staticmethod
    def _connect(scheme: str, host: str, port: int, timeout: float) -> http.client.HTTPConnection:
        if scheme == "https":
            return http.client.HTTPSConnection(host, port, timeout=timeout, context=_TLS_CONTEXT)
        return http.client.HTTPConnection(host, port, timeout=timeout)

    def _send(
        self,
        key: Tuple[str, str, int],
        conn: http.client.HTTPConnection,
        method: str,
        target: str,
        headers: Dict[str, str],
        body: Optional[bytes],
        timeout: float,
    ) -> HttpResponse:
        conn.timeout = timeout
        if conn.sock is not None:
            conn.sock.settimeout(timeout)
        conn.request(method, target, body=body, headers=headers)
        resp = conn.getresponse()
        try:
            payload = _read_capped(resp)
        except AdxTransportError:
            conn.close()  # unread bytes are still on the socket — it cannot be reused
            raise
        except (http.client.HTTPException, OSError) as exc:
            conn.close()
            raise AdxTransportError(str(exc) or exc.__class__.__name__) from exc
        result = HttpResponse(int(resp.status), _headers_to_dict(resp.msg), payload)
        if resp.will_close:
            conn.close()
        else:
            self._pool.give(key, conn)
        return result

    def _request_urllib(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        body: Optional[bytes],
        timeout: float,
    ) -> HttpResponse:
        req = urllib.request.Request(url=url, data=body, headers=headers, method=method)
        try:
            with _OPENER.open(req, timeout=timeout) as resp:  # nosec B310 - base URL validated https
                status = getattr(resp, "status", None)
                if status is None:
                    status = resp.getcode()
                return HttpResponse(int(status), _headers_to_dict(resp.headers), _read_capped(resp))
        except urllib.error.HTTPError as exc:
            # A 4xx/5xx is a valid response for us (e.g. 429/403/400) — capture, don't raise.
            payload = b""
            try:
                payload = _read_capped(exc)
            except Exception:  # pragma: no cover - defensive
                payload = b""
            return HttpResponse(int(exc.code), _headers_to_dict(exc.headers), payload)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            raise AdxTransportError(str(reason)) from exc


def parse_retry_after(headers: Dict[str, str]) -> Optional[int]:
    """Extract an integer ``Retry-After`` (seconds) if present and numeric."""
    value = headers.get("retry-after")
    if value is None:
        return None
    try:
        return int(value.strip())
    except (ValueError, AttributeError):
        return None


def extract_identity_cookie(headers: Dict[str, str]) -> Optional[str]:
    """Pull the ``_an_id`` value out of any ``Set-Cookie`` header(s), so callers can
    persist it per-user and resend it for stable identity/frequency capping."""
    raw = headers.get("set-cookie")
    if not raw:
        return None
    cookies: List[str] = raw.split("\n")
    for cookie in cookies:
        for segment in cookie.split(";"):
            segment = segment.strip()
            if segment.startswith("_an_id="):
                value = segment[len("_an_id="):]
                # Only a value in the server's own alphabet is ever stored or replayed.
                return value if is_safe_identity_cookie(value) else None
    return None
