"""The §9c render gate, as a pure decision — CONTRACT.md §9c.

Every SDK asks this one question before it draws anything, and the answer is the *only* thing
allowed to arm the viewability beacon. :data:`RenderPlan.NONE` means this surface cannot draw the
creative, so it is not an impression: no beacon, and the slot backs off and refills (§9a).
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from .models import Ad, AdKind

__all__ = ["RenderPlan", "render_plan", "is_safe_http_url", "looks_like_image"]


class RenderPlan(str, Enum):
    """What this surface can actually draw for a given decision."""

    HTML = "html"
    """Draw ``creative.html`` in a sandboxed WebView/iframe."""

    IMAGE = "image"
    """Draw ``creative.asset_url`` as an image."""

    NONE = "none"
    """Nothing can be drawn — not an impression."""


def is_safe_http_url(url: Optional[str]) -> bool:
    """Only http/https URLs may be loaded or opened (CONTRACT.md §4e).

    Rejects ``javascript:`` / ``file:`` / ``data:`` / ``intent:`` payloads from a hostile creative.
    """
    if not url:
        return False
    lowered = url.strip().lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def render_plan(ad: Optional[Ad], can_render_html: bool) -> RenderPlan:
    """Decide what, if anything, this surface can draw.

    :param can_render_html: Whether this surface actually has a WebView available right now.
        Native Python UI toolkits pass ``False``: they cannot draw OpenRTB markup, so those fills
        are refused rather than counted as views of an invisible ad.
    """
    if ad is None or not ad.filled or ad.creative is None:
        return RenderPlan.NONE
    creative = ad.creative
    if ad.kind == AdKind.HTML:
        if creative.html and can_render_html:
            return RenderPlan.HTML
        return RenderPlan.NONE
    if is_safe_http_url(creative.asset_url):
        return RenderPlan.IMAGE
    return RenderPlan.NONE


# Magic bytes for the raster formats an ad server can legitimately serve. A creative that is not
# one of these did not decode, so it never drew, so it is not an impression (§9c).
_IMAGE_MAGIC = (
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"\xff\xd8\xff",  # JPEG
    b"GIF87a",
    b"GIF89a",
    b"BM",  # BMP
)


def looks_like_image(data: Optional[bytes]) -> bool:
    """True if ``data`` starts with the magic bytes of a real raster image.

    Used by the UI adapters to prove a creative actually decoded before any beacon can fire —
    an HTML error page served with a 200 is exactly what this catches.
    """
    if not data or len(data) < 12:
        return False
    if data.startswith(_IMAGE_MAGIC):
        return True
    # WebP: "RIFF" .... "WEBP"
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
