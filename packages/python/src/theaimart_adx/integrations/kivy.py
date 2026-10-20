"""Kivy integration — a banner widget, plus a KivMob-shaped facade for easy migration.

    from theaimart_adx.integrations.kivy import BannerAd

    class Root(BoxLayout):
        def __init__(self, **kw):
            super().__init__(**kw)
            self.banner = BannerAd(api_key="pk_...", slot_id="8b1f-uuid", refresh_seconds=60)
            self.add_widget(self.banner)
            self.banner.start()

If you are coming from KivMob, :class:`AdxAds` mirrors its call shape::

    ads = AdxAds("pk_...")
    ads.new_banner("8b1f-uuid", refresh_seconds=60)
    ads.request_banner()
    ads.show_banner()

Implements CONTRACT.md §9 in full. Kivy is the strongest of the Python surfaces for this: widgets
expose real geometry, so the viewability beacon is a genuine "≥50% of the widget on screen for ≥1
continuous second" measurement rather than an approximation.

Creatives are downloaded and decoded by the SDK before anything is drawn, so an asset that 404s
or is not a real image never counts as an impression (§9c) — the slot backs off and refills.
"""

from __future__ import annotations

import io
import webbrowser
from typing import Any, Callable, List, Optional

try:
    from kivy.clock import Clock
    from kivy.uix.image import Image as _KivyImage
except ImportError as exc:  # pragma: no cover - depends on the user's environment
    raise ImportError(
        "Kivy is not installed. Install it with: pip install 'theaimart-adx[kivy]'"
    ) from exc

from ..client import Adx
from ..constants import DEFAULT_BASE_URL
from ..fill import AdFill
from ..models import Ad
from ..render import is_safe_http_url

__all__ = ["BannerAd", "AdxAds", "TICK_SECONDS"]

#: How often the driver is pumped. Matches the other SDKs' 250 ms poll.
TICK_SECONDS = 0.25

_EXT_BY_MAGIC = (
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"BM", "bmp"),
)


def _image_ext(data: bytes) -> Optional[str]:
    for magic, ext in _EXT_BY_MAGIC:
        if data.startswith(magic):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def texture_from_bytes(data: Optional[bytes]) -> Optional[Any]:
    """Decode creative bytes into a Kivy texture, or ``None`` if they are not a usable image.

    ``None`` is the §9c signal: nothing drew, so nothing is reported.
    """
    if not data:
        return None
    ext = _image_ext(data)
    if ext is None:
        return None
    try:
        from kivy.core.image import Image as CoreImage  # noqa: PLC0415 - needs a GL context

        return CoreImage(io.BytesIO(data), ext=ext).texture
    except Exception:
        # An unsupported format (e.g. WebP with no provider) never drew.
        return None


class BannerAd(_KivyImage):
    """A Kivy banner widget. Construct it, add it to your tree, then call :meth:`start`."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        slot_id: Optional[str] = None,
        slot_name: Optional[str] = None,
        client: Optional[Adx] = None,
        base_url: str = DEFAULT_BASE_URL,
        refresh_seconds: int = 0,
        page_url: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        us_privacy: Optional[str] = None,
        euconsent_v2: Optional[str] = None,
        app_active: Optional[Callable[[], bool]] = None,
        on_click: Optional[Callable[[str], None]] = None,
        on_ad_loaded: Optional[Callable[[Ad], None]] = None,
        on_ad_failed: Optional[Callable[[str], None]] = None,
        **kwargs: Any,
    ) -> None:
        if client is None and not api_key:
            raise ValueError("BannerAd requires either api_key or a preconfigured client")
        if not slot_id and not slot_name:
            raise ValueError("BannerAd requires either slot_id or slot_name")

        kwargs.setdefault("fit_mode", "contain")
        kwargs.setdefault("size_hint", (None, None))
        super().__init__(**kwargs)

        self.opacity = 0
        self._click_url: Optional[str] = None
        self._on_click = on_click
        self._on_ad_loaded = on_ad_loaded
        self._on_ad_failed = on_ad_failed
        self._event: Optional[Any] = None

        self._client = client or Adx(api_key=api_key or "", base_url=base_url)
        self._fill = AdFill(
            self._client,
            {
                "slot_id": slot_id,
                "slot_name": slot_name,
                "page_url": page_url,
                "page_keywords": ",".join(keywords) if keywords else None,
                "us_privacy": us_privacy,
                "euconsent_v2": euconsent_v2,
            },
            draw=self._draw,
            clear=self._clear,
            visible_fraction=self.visible_fraction,
            app_active=app_active or self._window_focused,
            refresh_seconds=refresh_seconds,
            # A Kivy Image cannot draw OpenRTB markup, so those fills are refused (§9c).
            can_render_html=False,
            on_loaded=self._handle_loaded,
            on_failed=self._handle_failed,
        )

    # -- lifecycle ---------------------------------------------------------------------------

    def start(self) -> None:
        """Request the first ad and begin the continuous-fill loop."""
        if self._event is not None:
            return
        self._fill.start()
        self._event = Clock.schedule_interval(self._tick, TICK_SECONDS)

    def stop(self) -> None:
        """Stop for good: no further requests, no further beacons."""
        if self._event is not None:
            self._event.cancel()
            self._event = None
        self._fill.stop()

    def _tick(self, _dt: float) -> None:
        self._fill.tick()

    # -- the four callables AdFill needs ------------------------------------------------------

    def visible_fraction(self) -> float:
        """Fraction of this widget currently inside the window (CONTRACT.md §5)."""
        if self.texture is None or self.opacity == 0:
            return 0.0
        window = self.get_root_window()
        if window is None:
            return 0.0
        width, height = float(self.width), float(self.height)
        if width <= 0 or height <= 0:
            return 0.0
        x, y = self.to_window(self.x, self.y)
        visible_w = max(0.0, min(x + width, float(window.width)) - max(x, 0.0))
        visible_h = max(0.0, min(y + height, float(window.height)) - max(y, 0.0))
        if visible_w <= 0 or visible_h <= 0:
            return 0.0
        return float((visible_w * visible_h) / (width * height))

    def _window_focused(self) -> bool:
        """§9b — treat an unfocused/absent window as backgrounded."""
        window = self.get_root_window()
        if window is None:
            return False
        return bool(getattr(window, "focus", True))

    def _draw(self, ad: Ad, data: Optional[bytes]) -> bool:
        creative = ad.creative
        texture = texture_from_bytes(data)
        if creative is None or texture is None:
            return False
        self.texture = texture
        self.size = (float(creative.width), float(creative.height))
        self.opacity = 1
        self._click_url = creative.click_url if is_safe_http_url(creative.click_url) else None
        return True

    def _clear(self, _reason: str) -> None:
        self.texture = None
        self.opacity = 0
        self._click_url = None

    # -- events ------------------------------------------------------------------------------

    def on_touch_down(self, touch: Any) -> bool:
        if self.opacity and self._click_url and self.collide_point(*touch.pos):
            self._open(self._click_url)
            return True
        return bool(super().on_touch_down(touch))

    def _open(self, url: str) -> None:
        # §4e: only http/https destinations reach here at all.
        if self._on_click is not None:
            self._on_click(url)
            return
        try:
            webbrowser.open(url)
        except Exception:
            pass

    def _handle_loaded(self, ad: Ad) -> None:
        if self._on_ad_loaded is not None:
            self._on_ad_loaded(ad)

    def _handle_failed(self, reason: str) -> None:
        if self._on_ad_failed is not None:
            self._on_ad_failed(reason)


class AdxAds:
    """KivMob-shaped facade, for apps migrating from ``kivmob.KivMob``.

    KivMob's ``new_banner`` / ``request_banner`` / ``show_banner`` / ``hide_banner`` map onto the
    same calls here. The differences are deliberate:

    * there is no separate "app id" — a theaimart publisher key is all you need;
    * ``request_banner()`` is optional: with ``refresh_seconds`` set, the banner keeps itself
      filled, so you normally call it only to force an immediate refresh.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        client: Optional[Adx] = None,
    ) -> None:
        self._client = client or Adx(api_key=api_key, base_url=base_url)
        self.banner: Optional[BannerAd] = None

    def new_banner(
        self,
        slot_id: Optional[str] = None,
        *,
        slot_name: Optional[str] = None,
        refresh_seconds: int = 0,
        top_pos: bool = False,
        **kwargs: Any,
    ) -> BannerAd:
        """Create the banner and attach it to the running window (bottom by default)."""
        self.destroy_banner()
        banner = BannerAd(
            client=self._client,
            slot_id=slot_id,
            slot_name=slot_name,
            refresh_seconds=refresh_seconds,
            **kwargs,
        )
        self.banner = banner

        window = self._window()
        if window is not None:
            banner.pos_hint = {"top": 1} if top_pos else {"y": 0}
            window.add_widget(banner)
        return banner

    def request_banner(self) -> None:
        """Start (or immediately restart) the fill loop."""
        if self.banner is not None:
            self.banner.start()

    def show_banner(self) -> None:
        if self.banner is not None:
            self.banner.opacity = 1 if self.banner.texture is not None else 0
            self.banner.start()

    def hide_banner(self) -> None:
        """Hide the banner. The loop keeps running but reports 0% visible, so no beacon fires."""
        if self.banner is not None:
            self.banner.opacity = 0

    def destroy_banner(self) -> None:
        banner = self.banner
        if banner is None:
            return
        banner.stop()
        parent = banner.parent
        if parent is not None:
            parent.remove_widget(banner)
        self.banner = None

    @staticmethod
    def _window() -> Optional[Any]:
        try:
            from kivy.core.window import Window  # noqa: PLC0415 - needs a display

            return Window
        except Exception:
            return None
