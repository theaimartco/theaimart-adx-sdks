"""High-level synchronous client for the theaimart Ad Network.

Typical server-side usage (e.g. inside a Flask/Django view rendering an ad):

    from theaimart_adx import Adx

    adx = Adx(api_key="pk_...")
    ad = adx.request_ad(
        slot_id="8b1f...-uuid",
        page_url=request.url,
        # Forward the end user's UA: it drives device targeting and the bot filter.
        user_agent=request.headers.get("User-Agent"),
    )
    if ad.filled:
        html = Adx.render_html(ad)          # inject into your page

    # Later — ONLY once your frontend has measured the ad ≥50% on-screen for ≥1s:
    adx.report_viewable(imp_id)

Never call ``report_viewable`` just because the HTML was sent: that reports a view nobody
measured (CONTRACT.md §9c). Note too that the server attributes every request to *this*
server's IP whatever ``client_ip`` says (CONTRACT.md §6), so all of your users share one
per-IP rate limit — server-side serving suits low-volume pages.
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional
from urllib.parse import quote

from ._version import __version__
from .constants import (
    CLICK_PATH,
    DEFAULT_BASE_URL,
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_USER_AGENT,
    SDK_IDENTIFIER,
    SERVE_AD_PATH,
    VIEWABLE_PATH,
)
from .encoding import build_serve_query
from .guard import (
    REASON_INVALID_REQUEST,
    REASON_RATE_LIMITED,
    guard_serve_params,
    is_publishable_key,
    is_safe_identity_cookie,
    is_safe_imp_id,
    normalize_base_url,
    request_guard_for,
    safe_header_value,
)
from .errors import AdxConfigError, AdxTransportError
from .html import render_html as _render_html
from .models import Ad
from .viewable import ViewableOutcome, viewable_outcome
from .transport import (
    Transport,
    UrllibTransport,
    extract_identity_cookie,
    parse_retry_after,
)

__all__ = ["Adx"]

def _parse_json(body: bytes) -> Any:
    if not body:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


class Adx:
    """Client for a single publisher ``api_key``.

    :param api_key: The publisher-site key (``pk_…``). Public client identifier.
    :param base_url: Ad server base URL. Defaults to production.
    :param timeout: Per-request timeout in seconds.
    :param user_agent: Default UA for requests. Must avoid the backend bot substrings
        (CONTRACT.md §6); the SDK default is safe. Can be overridden per request.
    :param transport: Injectable HTTP transport (defaults to stdlib urllib).
    :param raise_on_error: If ``True``, network errors raise :class:`AdxTransportError`
        instead of yielding a no-fill. Defaults to ``False`` (fail-closed).
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        user_agent: str = DEFAULT_USER_AGENT,
        transport: Optional[Transport] = None,
        raise_on_error: bool = False,
    ) -> None:
        if not api_key or not isinstance(api_key, str):
            raise AdxConfigError("api_key is required and must be a non-empty string")
        api_key = api_key.strip()
        if not is_publishable_key(api_key):
            raise AdxConfigError(
                "api_key must be a publishable site key (pk_...). "
                "Never put an account token or secret in an SDK."
            )
        normalized = normalize_base_url(base_url)
        if normalized is None:
            raise AdxConfigError(
                "base_url must be https:// (plain http only for localhost or a private "
                "network), with no credentials, query or fragment"
            )
        self._api_key = api_key
        self._base_url = normalized
        # Shared by every client for this key, so a 429 backs them all off together (§12).
        self._guard = request_guard_for(normalized, api_key)
        self._timeout = float(timeout)
        self._user_agent = user_agent or DEFAULT_USER_AGENT
        self._transport: Transport = transport or UrllibTransport()
        self._raise_on_error = raise_on_error

    def close(self) -> None:
        """Release idle keep-alive connections. Optional — the client stays usable, and a
        transport without ``close`` is left alone."""
        close = getattr(self._transport, "close", None)
        if callable(close):
            close()

    def __enter__(self) -> "Adx":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- public API -----------------------------------------------------------------

    def request_ad(
        self,
        *,
        slot_id: Optional[str] = None,
        slot_name: Optional[str] = None,
        page_url: Optional[str] = None,
        page_keywords: Optional[str] = None,
        us_privacy: Optional[str] = None,
        euconsent_v2: Optional[str] = None,
        gpp: Optional[str] = None,
        gpp_sid: Optional[str] = None,
        user_agent: Optional[str] = None,
        client_ip: Optional[str] = None,
        identity_cookie: Optional[str] = None,
    ) -> Ad:
        """Request an ad decision for a slot.

        Exactly one of ``slot_id`` (preferred) or ``slot_name`` is required. All free-text
        params are SQL-filter-safe-encoded automatically. Returns a normalized :class:`Ad`;
        never raises for a no-fill (only for config errors, or transport errors when
        ``raise_on_error=True``).

        ``gpp`` / ``gpp_sid`` carry the IAB Global Privacy Platform signal. Any US section in
        ``gpp_sid`` (7–12, e.g. ``"7"``) makes the request contextual-only, like a CCPA
        opt-out (CONTRACT.md §3). ``client_ip`` is sent as ``X-Forwarded-For`` but is
        currently ignored by the backend, which attributes the request to this server's IP
        (CONTRACT.md §6).
        """
        if not slot_id and not slot_name:
            raise AdxConfigError("request_ad requires either slot_id or slot_name")

        # CONTRACT.md §12: nothing unvalidated, unminimised or over budget reaches the server.
        params = guard_serve_params(
            self._api_key,
            slot_id=str(slot_id) if slot_id is not None else None,
            slot_name=slot_name,
            page_url=page_url,
            page_keywords=page_keywords,
            us_privacy=us_privacy,
            euconsent_v2=euconsent_v2,
            gpp=gpp,
            gpp_sid=gpp_sid,
        )
        if params is None:
            return Ad.no_fill(http_status=0, reason=REASON_INVALID_REQUEST)
        wait = self._guard.acquire(time.time() * 1000)
        if wait is not None:
            return Ad.no_fill(http_status=0, reason=REASON_RATE_LIMITED, retry_after_seconds=wait)

        url = self._base_url + SERVE_AD_PATH + "?" + build_serve_query(params)
        headers = self._base_headers(user_agent)
        if client_ip:
            headers["X-Forwarded-For"] = safe_header_value(client_ip)
        if is_safe_identity_cookie(identity_cookie):
            headers["Cookie"] = "_an_id=" + str(identity_cookie)

        try:
            resp = self._transport.request("GET", url, headers, None, self._timeout)
        except AdxTransportError:
            if self._raise_on_error:
                raise
            return Ad.no_fill(http_status=0)

        retry_after = parse_retry_after(resp.headers)
        self._guard.record(resp.status, retry_after, time.time() * 1000)
        return Ad.from_response(
            resp.status,
            _parse_json(resp.body),
            retry_after_seconds=retry_after,
            set_identity_cookie=extract_identity_cookie(resp.headers),
        )

    def report_viewable(
        self,
        imp_id: str,
        *,
        user_agent: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> bool:
        """Fire the viewability beacon for an ``imp_id`` (once the ad has been ≥50%
        on-screen for ≥1s). Returns ``True`` only when the server recorded the view. No-ops
        (returns ``False``) for a falsy ``imp_id`` — e.g. house ads, which are not trackable.

        Use :meth:`report_viewable_outcome` to tell a retryable failure from a permanent one.
        """
        outcome = self.report_viewable_outcome(
            imp_id, user_agent=user_agent, client_ip=client_ip
        )
        return outcome is ViewableOutcome.RECORDED

    def report_viewable_outcome(
        self,
        imp_id: str,
        *,
        user_agent: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> ViewableOutcome:
        """Like :meth:`report_viewable`, but returns the :class:`ViewableOutcome`.

        On ``RETRY`` — the beacon beat the impression into the database, or the call failed
        transiently — the view was not counted and resending the same ``imp_id`` later is safe
        (CONTRACT.md §5). This method never sleeps or retries by itself. ``DROP`` for a falsy
        ``imp_id``.
        """
        # Only an id the server could have issued is echoed back to it.
        if not is_safe_imp_id(imp_id):
            return ViewableOutcome.DROP
        body = json.dumps({"imp_id": imp_id}).encode("utf-8")
        headers = self._base_headers(user_agent)
        headers["Content-Type"] = "application/json"
        if client_ip:
            headers["X-Forwarded-For"] = safe_header_value(client_ip)
        url = self._base_url + VIEWABLE_PATH
        try:
            resp = self._transport.request("POST", url, headers, body, self._timeout)
        except AdxTransportError:
            if self._raise_on_error:
                raise
            return viewable_outcome(0, None)
        return viewable_outcome(resp.status, _parse_json(resp.body))

    def click_url(self, imp_id: str) -> str:
        """Build the click-tracker URL for an ``imp_id``.

        You normally do **not** need this: for internal ads ``ad.creative.click_url`` is
        already the wrapped tracker URL, and for house ads it is the raw advertiser URL.
        Provided for completeness / server-side redirects.
        """
        return self._base_url + CLICK_PATH + "?id=" + quote(str(imp_id), safe="")

    @staticmethod
    def render_html(ad: Ad, css_class: str = "theaimart-adx") -> str:
        """Render an :class:`Ad` to an HTML snippet (image anchor, or sandboxed iframe for
        html creatives). Returns ``""`` for a no-fill. See :mod:`theaimart_adx.html`."""
        return _render_html(ad, css_class=css_class)

    # -- internals ------------------------------------------------------------------

    def _base_headers(self, user_agent: Optional[str]) -> Dict[str, str]:
        return {
            "User-Agent": safe_header_value(user_agent) if user_agent else self._user_agent,
            "Accept": "application/json",
            "X-Adx-Sdk": SDK_IDENTIFIER,
        }

    @property
    def version(self) -> str:
        return __version__

    @property
    def user_agent(self) -> str:
        """The fraud-safe default User-Agent this client sends (CONTRACT.md §6).

        Exposed so the UI adapters fetch creatives with the same UA as the ad request.
        """
        return self._user_agent
