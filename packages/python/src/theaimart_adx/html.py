"""Server-side HTML rendering for an :class:`~theaimart_adx.models.Ad`.

Mirrors the render logic of the official web SDK (``adx.js``): image creatives become a
sponsored ``<a><img></a>``; html/openrtb creatives become a **sandboxed** ``<iframe>``
using ``srcdoc`` so the markup can never touch the host page's DOM. All interpolated
values are HTML-attribute-escaped.
"""

from __future__ import annotations

import html as _html

from .models import Ad, AdKind

__all__ = ["render_html"]

# Matches the web SDK's iframe sandbox: scripts + popups allowed, same-origin denied.
_IFRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox"


def is_safe_http_url(url: str) -> bool:
    """Whether a click URL may become a navigable link. Only http/https are allowed — a hostile
    creative's ``javascript:`` / ``data:`` / ``file:`` / ``intent:`` URL is rejected."""
    lowered = url.strip().lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def render_html(ad: Ad, css_class: str = "theaimart-adx") -> str:
    """Return an HTML snippet for ``ad``, or ``""`` if it cannot/should not be rendered."""
    if not ad.filled or ad.creative is None:
        return ""

    creative = ad.creative
    klass = _html.escape(css_class, quote=True)

    if ad.kind == AdKind.HTML and creative.html:
        srcdoc = _html.escape(creative.html, quote=True)
        return (
            '<iframe class="{klass}" width="{w}" height="{h}" frameborder="0" '
            'scrolling="no" marginwidth="0" marginheight="0" sandbox="{sandbox}" '
            'srcdoc="{srcdoc}"></iframe>'
        ).format(
            klass=klass,
            w=creative.width,
            h=creative.height,
            sandbox=_IFRAME_SANDBOX,
            srcdoc=srcdoc,
        )

    # Image creative (internal or house). Without an asset there is nothing to show.
    if not creative.asset_url:
        return ""

    src = _html.escape(creative.asset_url, quote=True)
    alt = _html.escape(creative.headline or "Advertisement", quote=True)
    img = (
        '<img src="{src}" alt="{alt}" width="{w}" height="{h}" '
        'style="border:0;display:block" />'
    ).format(src=src, alt=alt, w=creative.width, h=creative.height)

    # Only http/https click URLs become a link; a hostile creative's non-http URL is dropped.
    click = creative.click_url
    if click and is_safe_http_url(click):
        href = _html.escape(click, quote=True)
        return (
            '<a class="{klass}" href="{href}" target="_blank" '
            'rel="noopener nofollow sponsored">{img}</a>'
        ).format(klass=klass, href=href, img=img)
    return img
