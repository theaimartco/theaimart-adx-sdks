"""Flet integration — a drop-in banner for Flet apps (desktop, mobile and web).

    import flet as ft
    from theaimart_adx.integrations.flet import BannerAd

    def main(page: ft.Page):
        banner = BannerAd(page, api_key="pk_...", slot_id="8b1f-uuid", refresh_seconds=60)
        page.add(ft.Column([ft.Text("My app"), banner.control]))
        banner.start()

    ft.app(main)

Implements CONTRACT.md §9: continuous fill with backoff, the loop suspended while the app is
backgrounded, and a viewability beacon armed only by a creative that actually loaded.

**Viewability caveat — read this before shipping.** Flet exposes no geometry for a control, so
this adapter cannot measure "50% of the pixels on screen". Its default
:func:`visible_fraction` reports 1.0 when the banner control is ``visible`` and the app is in the
foreground, and 0.0 otherwise. That is accurate for a banner pinned to an app bar or bottom bar —
the normal placement — but it will over-report if you put the banner inside a scrollable that
moves it off screen. In that case pass your own ``visible_fraction`` callable, or set
``verify_creative=False`` to disable beacons entirely.
"""

from __future__ import annotations

import asyncio
import inspect
from typing import Any, Callable, Dict, List, Optional

from ..client import Adx
from ..constants import DEFAULT_BASE_URL
from ..fill import AdFill
from ..models import Ad
from ..render import is_safe_http_url

__all__ = ["BannerAd"]

#: How often the driver is pumped. Matches the other SDKs' 250 ms poll.
TICK_SECONDS = 0.25


def _require_flet() -> Any:
    try:
        import flet as ft  # noqa: PLC0415 - optional dependency, imported on demand
    except ImportError as exc:  # pragma: no cover - depends on the user's environment
        raise ImportError(
            "Flet is not installed. Install it with: pip install 'theaimart-adx[flet]'"
        ) from exc
    return ft


def _contain_fit(ft: Any) -> Any:
    """``BoxFit`` in Flet >= 0.70, ``ImageFit`` before that."""
    box_fit = getattr(ft, "BoxFit", None) or getattr(ft, "ImageFit", None)
    return getattr(box_fit, "CONTAIN", None) if box_fit is not None else None


class BannerAd:
    """A Flet banner. Add :attr:`control` to your page, then call :meth:`start`."""

    def __init__(
        self,
        page: Any,
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
        width: Optional[int] = None,
        height: Optional[int] = None,
        border_radius: float = 12,
        surface_color: str = "#F3F5F7",
        elevated: bool = True,
        verify_creative: bool = True,
        visible_fraction: Optional[Callable[[], float]] = None,
        on_ad_loaded: Optional[Callable[[Ad], None]] = None,
        on_ad_failed: Optional[Callable[[str], None]] = None,
    ) -> None:
        if client is None and not api_key:
            raise ValueError("BannerAd requires either api_key or a preconfigured client")
        if not slot_id and not slot_name:
            raise ValueError("BannerAd requires either slot_id or slot_name")

        ft = _require_flet()
        self._ft = ft
        self._page = page
        self._client = client or Adx(api_key=api_key or "", base_url=base_url)
        self._on_ad_loaded = on_ad_loaded
        self._on_ad_failed = on_ad_failed
        self._forced_width = width
        self._forced_height = height
        self._click_url: Optional[str] = None
        self._app_active = True
        self._needs_update = False
        self._task: Optional[Any] = None
        self._running = False

        #: The control to add to your page. The visual treatment is deliberately neutral so the
        #: advertiser creative stays intact while the surrounding app gets a polished surface.
        control_options: Dict[str, Any] = {
            "content": None,
            "visible": False,
            "width": width,
            "height": height,
            "bgcolor": surface_color,
            "border_radius": max(0.0, min(48.0, float(border_radius))),
        }
        clip_behavior = getattr(getattr(ft, "ClipBehavior", None), "ANTI_ALIAS", None)
        if clip_behavior is not None:
            control_options["clip_behavior"] = clip_behavior
        if elevated and hasattr(ft, "BoxShadow"):
            try:
                control_options["shadow"] = ft.BoxShadow(
                    blur_radius=28,
                    color="#1F0F172A",
                    offset=ft.Offset(0, 8) if hasattr(ft, "Offset") else None,
                )
            except Exception:
                pass
        try:
            self.control = ft.Container(**control_options)
        except TypeError:
            self.control = ft.Container(content=None, visible=False, width=width, height=height)

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
            visible_fraction=visible_fraction or self._default_visible_fraction,
            app_active=lambda: self._app_active,
            refresh_seconds=refresh_seconds,
            # Flet renders through Flutter and has no WebView control here, so OpenRTB markup
            # cannot be drawn — those fills are refused rather than counted (§9c).
            can_render_html=False,
            verify_creative=verify_creative,
            on_loaded=self._handle_loaded,
            on_failed=self._handle_failed,
        )
        self._hook_lifecycle()

    # -- lifecycle ---------------------------------------------------------------------------

    def start(self) -> None:
        """Request the first ad and begin the continuous-fill loop."""
        if self._running:
            return
        self._running = True
        self._fill.start()
        self._task = self._page.run_task(self._loop)

    def dispose(self) -> None:
        """Stop the loop. Call when the view goes away."""
        self._running = False
        self._fill.stop()

    async def _loop(self) -> None:
        while self._running:
            self._fill.tick()
            await self._flush()
            await asyncio.sleep(TICK_SECONDS)

    async def _flush(self) -> None:
        """Push any pending control changes, tolerating sync or async ``page.update``."""
        if not self._needs_update:
            return
        self._needs_update = False
        try:
            result = self._page.update()
            if inspect.isawaitable(result):
                await result
        except Exception:
            pass

    def _hook_lifecycle(self) -> None:
        """§9b — freeze the loop while the app is not in the foreground."""
        ft = self._ft
        states = getattr(ft, "AppLifecycleState", None)
        if states is None or not hasattr(self._page, "on_app_lifecycle_state_change"):
            return
        foreground = {
            getattr(states, name)
            for name in ("SHOW", "RESUME", "RESTART")
            if hasattr(states, name)
        }

        def handler(event: Any) -> None:
            state = getattr(event, "state", None)
            self._app_active = state in foreground if foreground else True

        try:
            self._page.on_app_lifecycle_state_change = handler
        except Exception:
            pass

    # -- the four callables AdFill needs ------------------------------------------------------

    def _default_visible_fraction(self) -> float:
        # See the module docstring: control visibility + foreground, not a pixel measurement.
        return 1.0 if (self.control.visible and self._app_active) else 0.0

    def _draw(self, ad: Ad, data: Optional[bytes]) -> bool:
        creative = ad.creative
        # AdFill's render gate already rejected non-http(s) assets; re-check here so a hostile
        # URL can never become a control even if `draw` is called directly (§4e).
        if creative is None or not is_safe_http_url(creative.asset_url):
            return False
        ft = self._ft

        width = self._forced_width or creative.width
        height = self._forced_height or creative.height
        image_options = dict(
            width=width,
            height=height,
            fit=_contain_fit(ft),
            semantics_label=creative.headline or "Advertisement",
        )
        # Modern Flet accepts bytes directly. Reusing the verified payload avoids downloading the
        # same creative twice; retain a URL fallback for older releases and for
        # verify_creative=False (where AdFill intentionally supplies no bytes).
        image_options["src"] = data if data else creative.asset_url
        try:
            image = ft.Image(**image_options)
        except TypeError:
            image_options["src"] = creative.asset_url
            image = ft.Image(**image_options)

        self._click_url = creative.click_url if is_safe_http_url(creative.click_url) else None
        content: Any = image
        if self._click_url:
            content = ft.GestureDetector(content=image, on_tap=self._handle_tap)

        self.control.content = content
        self.control.width = width
        self.control.height = height
        self.control.visible = True
        self._needs_update = True
        return True

    def _clear(self, _reason: str) -> None:
        self.control.content = None
        self.control.visible = False
        self._click_url = None
        self._needs_update = True

    # -- events ------------------------------------------------------------------------------

    def _handle_tap(self, _event: Any) -> None:
        # §4e: only http/https destinations are ever opened.
        url = self._click_url
        if url:
            try:
                self._page.launch_url(url)
            except Exception:
                pass

    def _handle_loaded(self, ad: Ad) -> None:
        if self._on_ad_loaded is not None:
            self._on_ad_loaded(ad)

    def _handle_failed(self, reason: str) -> None:
        if self._on_ad_failed is not None:
            self._on_ad_failed(reason)
