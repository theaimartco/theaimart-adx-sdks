"""theaimart Ad Network SDK for Python.

A tiny, dependency-free client for the theaimart ad server. See CONTRACT.md for the wire
contract this implements.

    from theaimart_adx import Adx

    adx = Adx(api_key="pk_...")
    ad = adx.request_ad(slot_id="...")
    if ad.filled:
        print(Adx.render_html(ad))

    # Only once the ad has actually been measured ≥50% on-screen for ≥1s:
    adx.report_viewable(imp_id)
"""

from __future__ import annotations

from ._version import __version__
from .client import Adx
from .encoding import (
    SQL_INJECTION_KEYWORDS,
    build_serve_query,
    percent_encode_all,
    raw_query_is_waf_safe,
)
from .errors import AdxConfigError, AdxError, AdxTransportError
from .guard import (
    MAX_REQUESTS_PER_MINUTE,
    is_publishable_key,
    is_safe_imp_id,
    normalize_base_url,
    sanitize_page_url,
)
from .html import is_safe_http_url, render_html
from .models import Ad, AdKind, AdSource, Auction, Creative
from .transport import HttpResponse, Transport, UrllibTransport
from .viewable import VIEWABLE_RETRY_DELAYS_SECONDS, ViewableOutcome, viewable_outcome

__all__ = [
    "MAX_REQUESTS_PER_MINUTE",
    "is_publishable_key",
    "is_safe_imp_id",
    "normalize_base_url",
    "sanitize_page_url",
    "__version__",
    "Adx",
    "Ad",
    "AdKind",
    "AdSource",
    "Auction",
    "Creative",
    "AdxError",
    "AdxConfigError",
    "AdxTransportError",
    "Transport",
    "UrllibTransport",
    "HttpResponse",
    "render_html",
    "is_safe_http_url",
    "build_serve_query",
    "percent_encode_all",
    "raw_query_is_waf_safe",
    "SQL_INJECTION_KEYWORDS",
    "ViewableOutcome",
    "viewable_outcome",
    "VIEWABLE_RETRY_DELAYS_SECONDS",
]
