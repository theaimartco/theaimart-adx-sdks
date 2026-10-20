"""Normalized ad model — parses the backend's 4-way discriminated union (CONTRACT.md §4)
into one consistent object regardless of demand source.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


class AdSource(str, Enum):
    """Which demand source filled the request. ``INTERNAL`` when the response carries
    no ``source`` field (the common case)."""

    INTERNAL = "internal"
    OPENRTB = "openrtb"
    HOUSE = "house"


class AdKind(str, Enum):
    """How to render the ad."""

    NO_FILL = "no_fill"
    IMAGE = "image"  # <a><img></a> — internal or house
    HTML = "html"    # sandboxed iframe/webview — openrtb markup


def _as_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):  # bool is a subclass of int — reject it explicitly
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _as_float(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


@dataclass(frozen=True)
class Auction:
    """Auction outcome. Present for internal/openrtb fills; ``None`` for house/no-fill.
    Fields not applicable to a given source are ``None``."""

    type: Optional[str] = None
    clearing_price_paise: Optional[int] = None
    quality_score: Optional[float] = None
    effective_bid: Optional[float] = None
    winner_bid_paise: Optional[int] = None
    winner_ecpm_paise: Optional[int] = None

    @classmethod
    def from_dict(cls, data: Any) -> "Optional[Auction]":
        if not isinstance(data, dict):
            return None
        return cls(
            type=data.get("type"),
            clearing_price_paise=_as_int(data.get("clearing_price_paise")),
            quality_score=_as_float(data.get("quality_score")),
            effective_bid=_as_float(data.get("effective_bid")),
            winner_bid_paise=_as_int(data.get("winner_bid_paise")),
            winner_ecpm_paise=_as_int(data.get("winner_ecpm_paise")),
        )


@dataclass(frozen=True)
class Creative:
    """The renderable creative. For image ads use ``asset_url`` + ``click_url``; for
    html ads use ``html`` (sandboxed). ``width``/``height`` default to 300x250."""

    width: int = 300
    height: int = 250
    asset_url: Optional[str] = None
    click_url: Optional[str] = None
    html: Optional[str] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    id: Optional[str] = None
    campaign_id: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Any) -> "Creative":
        data = data if isinstance(data, dict) else {}
        w = _as_int(data.get("width"))
        h = _as_int(data.get("height"))
        return cls(
            width=w if w is not None else 300,
            height=h if h is not None else 250,
            asset_url=data.get("asset_url"),
            click_url=data.get("click_url"),
            html=data.get("html"),
            headline=data.get("headline"),
            description=data.get("description"),
            id=data.get("id"),
            campaign_id=data.get("campaign_id"),
        )


@dataclass(frozen=True)
class Ad:
    """A normalized ad decision. Always returned by the client — an unfillable or errored
    request yields ``filled == False`` rather than raising (fail-closed)."""

    filled: bool
    kind: AdKind
    source: AdSource
    http_status: int
    imp_id: Optional[str] = None
    identity_id: Optional[str] = None
    dsp: Optional[str] = None
    reason: Optional[str] = None
    creative: Optional[Creative] = None
    auction: Optional[Auction] = None
    retry_after_seconds: Optional[int] = None
    set_identity_cookie: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None

    @property
    def is_trackable(self) -> bool:
        """True iff a viewability beacon can be fired (i.e. an ``imp_id`` is present).
        House-ad fills are not trackable."""
        return self.imp_id is not None

    @classmethod
    def no_fill(
        cls,
        http_status: int,
        reason: Optional[str] = None,
        retry_after_seconds: Optional[int] = None,
        raw: Optional[Dict[str, Any]] = None,
        set_identity_cookie: Optional[str] = None,
    ) -> "Ad":
        return cls(
            filled=False,
            kind=AdKind.NO_FILL,
            source=AdSource.INTERNAL,
            http_status=http_status,
            reason=reason,
            retry_after_seconds=retry_after_seconds,
            raw=raw,
            set_identity_cookie=set_identity_cookie,
        )

    @classmethod
    def from_response(
        cls,
        http_status: int,
        body: Any,
        retry_after_seconds: Optional[int] = None,
        set_identity_cookie: Optional[str] = None,
    ) -> "Ad":
        """Parse an HTTP status + decoded JSON body into a normalized :class:`Ad`.

        Fail-closed: any non-200 status, non-dict body, or ``fill != true`` becomes a
        no-fill. Parse order matches CONTRACT.md §4: fill? → html? → source==house? →
        internal.
        """
        raw = body if isinstance(body, dict) else None
        if http_status != 200 or raw is None:
            reason = raw.get("reason") if raw is not None else None
            return cls.no_fill(
                http_status,
                reason=reason if isinstance(reason, str) else None,
                retry_after_seconds=retry_after_seconds,
                raw=raw,
                set_identity_cookie=set_identity_cookie,
            )

        if raw.get("fill") is not True:
            reason = raw.get("reason")
            return cls.no_fill(
                http_status,
                reason=reason if isinstance(reason, str) else None,
                retry_after_seconds=retry_after_seconds,
                raw=raw,
                set_identity_cookie=set_identity_cookie,
            )

        creative_raw = raw.get("creative")
        creative_dict: Dict[str, Any] = creative_raw if isinstance(creative_raw, dict) else {}
        html_markup = creative_dict.get("html")
        source_field = raw.get("source")

        if html_markup:
            kind, source = AdKind.HTML, AdSource.OPENRTB
        elif source_field == "house":
            kind, source = AdKind.IMAGE, AdSource.HOUSE
        else:
            kind, source = AdKind.IMAGE, AdSource.INTERNAL

        return cls(
            filled=True,
            kind=kind,
            source=source,
            http_status=http_status,
            imp_id=raw.get("imp_id"),
            identity_id=raw.get("identity_id"),
            dsp=raw.get("dsp"),
            creative=Creative.from_dict(creative_dict),
            auction=Auction.from_dict(raw.get("auction")),
            retry_after_seconds=retry_after_seconds,
            set_identity_cookie=set_identity_cookie,
            raw=raw,
        )
