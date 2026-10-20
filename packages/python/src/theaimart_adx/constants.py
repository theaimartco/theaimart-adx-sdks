"""Wire-contract constants. See ../../../CONTRACT.md — the single source of truth."""

from __future__ import annotations

from ._version import __version__

# Production ad server (the theaimart-adnetwork Rust backend). Override via Adx(base_url=...).
DEFAULT_BASE_URL = "https://api.adx.theaimart.co"

# Serve API paths (CONTRACT.md §2).
SERVE_AD_PATH = "/api/v1/serve/ad"
VIEWABLE_PATH = "/api/v1/serve/viewable"
CLICK_PATH = "/api/v1/serve/click"

DEFAULT_TIMEOUT_SECONDS = 10.0

# Auto-refresh floor (CONTRACT.md §9). The backend rate-limits aggressive polling.
MIN_REFRESH_SECONDS = 30

# Ceiling on the continuous-fill retry backoff (CONTRACT.md §9a).
MAX_RETRY_SECONDS = 300

# Largest creative the UI adapters will download before drawing it (CONTRACT.md §9c).
MAX_CREATIVE_BYTES = 5 * 1024 * 1024

# Fraud-safe User-Agent (CONTRACT.md §6). Must NOT contain any backend bot/fraud
# substring (e.g. "python-requests", "httpclient", "bot"). "python" alone is fine.
DEFAULT_USER_AGENT = "theaimart-adx-python/" + __version__

# X-Adx-Sdk observability header (non-browser SDKs only; does not affect fraud scoring).
SDK_IDENTIFIER = "theaimart-adx-python/" + __version__
