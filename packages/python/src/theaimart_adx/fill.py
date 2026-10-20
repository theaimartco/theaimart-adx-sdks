"""Continuous fill for Python UI toolkits — CONTRACT.md §9.

:class:`AdFill` is the framework-agnostic driver every Python UI adapter (Flet, Kivy, and any
other toolkit) sits on top of. It owns the parts that are easy to get wrong and identical
everywhere:

* **§9a** the refresh/backoff clock, so a slot never goes permanently dark after one no-fill;
* **§9b** suspending the loop while the app is backgrounded or the slot is off screen;
* **§9c** arming the viewability beacon **only** from a creative that actually drew;
* **§5** resending a beacon the server answered ``retry`` (it arrived before the impression
  row was written), so a genuinely measured view is not lost.

An adapter supplies four small callables — ``draw``, ``clear``, ``visible_fraction`` and
``app_active`` — and calls :meth:`tick` from its own UI clock. Network work happens on a worker
thread; ``draw``/``clear`` are only ever called from inside :meth:`tick`, i.e. on the UI thread.

Because the driver takes an injectable clock and executor, the whole state machine is unit-tested
without a display — see ``tests/test_fill.py``.
"""

from __future__ import annotations

import time
import urllib.request
from concurrent.futures import Future, ThreadPoolExecutor
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional, Tuple

from .client import Adx
from .constants import DEFAULT_TIMEOUT_SECONDS, MAX_CREATIVE_BYTES, SDK_IDENTIFIER
from .models import Ad, AdSource
from .render import RenderPlan, is_safe_http_url, looks_like_image, render_plan
from .schedule import next_delay_seconds
from .viewable import VIEWABLE_RETRY_DELAYS_SECONDS, ViewableOutcome

__all__ = ["AdFill", "fetch_creative", "VIEWABILITY_RATIO", "VIEWABILITY_SECONDS"]

#: IAB/MRC display standard (CONTRACT.md §5).
VIEWABILITY_RATIO = 0.5
VIEWABILITY_SECONDS = 1.0


@lru_cache(maxsize=1)
def _image_opener() -> urllib.request.OpenerDirector:
    """An opener that speaks **only** http/https.

    The default ``urlopen`` opener includes a ``FileHandler``; a creative URL that redirects to
    ``file://`` must never be readable. Handlers are listed explicitly so no local-filesystem or
    ftp handler is ever installed.
    """
    opener = urllib.request.OpenerDirector()
    opener.add_handler(urllib.request.HTTPHandler())
    opener.add_handler(urllib.request.HTTPSHandler())
    opener.add_handler(urllib.request.HTTPRedirectHandler())
    opener.add_handler(urllib.request.HTTPErrorProcessor())
    return opener


def fetch_creative(
    url: Optional[str],
    *,
    user_agent: str,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = MAX_CREATIVE_BYTES,
) -> Optional[bytes]:
    """Download and validate a creative, or return ``None``.

    This is what makes the §9c rule enforceable in a native Python UI: the toolkits cannot tell us
    whether an image URL loaded, so we fetch and decode-check it ourselves. ``None`` means the
    creative never drew, so it is not an impression.
    """
    if not is_safe_http_url(url):
        return None
    request = urllib.request.Request(
        url=url,  # type: ignore[arg-type]  # guarded by is_safe_http_url
        headers={"User-Agent": user_agent, "Accept": "image/*", "X-Adx-Sdk": SDK_IDENTIFIER},
        method="GET",
    )
    try:
        with _image_opener().open(request, timeout=timeout) as response:
            if getattr(response, "status", 200) != 200:
                return None
            data = response.read(max_bytes + 1)
    except Exception:
        return None
    if not data or len(data) > max_bytes:
        return None
    # A 200 that is actually an HTML error page is exactly what this catches.
    return data if looks_like_image(data) else None


class _InlineFuture(Future):  # type: ignore[type-arg]  # pragma: no cover - trivial
    pass


class _Beacon:
    """One measured view on its way to the server (CONTRACT.md §5).

    Lives independently of the fill cycle: a refresh that starts while a view is still being
    delivered must not cancel that view.
    """

    __slots__ = ("imp_id", "retryable", "attempts", "future", "due_at")

    def __init__(self, imp_id: str, retryable: bool) -> None:
        self.imp_id = imp_id
        # Only internal impressions ever get a row to match; an OpenRTB beacon is answered
        # ``retry`` forever, so it is sent once and never resent.
        self.retryable = retryable
        self.attempts = 0
        self.future: Optional[Future[ViewableOutcome]] = None
        self.due_at: Optional[float] = None


# A bounded shared pool avoids keeping one OS thread alive per banner in feeds and dashboards.
# The network clients already enforce timeouts, so four workers provide concurrency without a
# thread explosion when a screen contains many slots.
_FILL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="adx-fill")


class AdFill:
    """The §9 state machine. See the module docstring.

    :param client: A configured :class:`~theaimart_adx.client.Adx`.
    :param request: Keyword arguments forwarded to :meth:`Adx.request_ad` each cycle.
    :param draw: ``draw(ad, image_bytes) -> bool`` — attach the creative; return whether it
        actually attached. Called on the UI thread from :meth:`tick`.
    :param clear: ``clear(reason) -> None`` — empty the slot.
    :param visible_fraction: ``() -> float`` in ``0.0..1.0``, how much of the slot is on screen.
    :param app_active: ``() -> bool`` — False while backgrounded (§9b).
    :param refresh_seconds: Continuous-fill interval; ``0`` (default) is a single shot.
    :param can_render_html: Whether this surface has a WebView for OpenRTB markup.
    :param verify_creative: Download and decode-check the creative before drawing. Turning this
        off means the SDK cannot prove the ad drew, so **the viewability beacon is disabled** —
        it will never report a view it cannot stand behind.
    """

    def __init__(
        self,
        client: Adx,
        request: Dict[str, Any],
        *,
        draw: Callable[[Ad, Optional[bytes]], bool],
        clear: Callable[[str], None],
        visible_fraction: Callable[[], float],
        app_active: Optional[Callable[[], bool]] = None,
        refresh_seconds: int = 0,
        can_render_html: bool = False,
        verify_creative: bool = True,
        on_loaded: Optional[Callable[[Ad], None]] = None,
        on_failed: Optional[Callable[[str], None]] = None,
        monotonic: Callable[[], float] = time.monotonic,
        executor: Optional[Any] = None,
    ) -> None:
        self._client = client
        self._request = dict(request)
        self._draw = draw
        self._clear = clear
        self._visible_fraction = visible_fraction
        self._app_active = app_active or (lambda: True)
        self.refresh_seconds = int(refresh_seconds)
        self._can_render_html = can_render_html
        self._verify_creative = verify_creative
        self._on_loaded = on_loaded
        self._on_failed = on_failed
        self._monotonic = monotonic

        self._executor: Any = executor or _FILL_EXECUTOR

        self._started = False
        self._stopped = False
        self._cycle = 0
        self._pending: Optional[Future[Any]] = None
        self._ad: Optional[Ad] = None
        self._rendered = False
        self._beacon_allowed = False
        self._beacon_fired = False
        self._visible_since: Optional[float] = None
        self._failures = 0
        self._due_at: Optional[float] = None
        self._beacons: List[_Beacon] = []

    # -- lifecycle ---------------------------------------------------------------------------

    def start(self) -> None:
        """Request the first ad. Safe to call twice."""
        if self._started or self._stopped:
            return
        self._started = True
        self._begin_cycle()

    def stop(self) -> None:
        """Stop for good: no further requests, no further beacons."""
        self._stopped = True
        self._due_at = None
        if self._pending is not None:
            self._pending.cancel()
        self._pending = None

    # -- the UI clock ------------------------------------------------------------------------

    def tick(self) -> None:
        """Advance the state machine. Call from the UI framework's clock (~4x/second)."""
        if self._stopped:
            return
        self._poll_pending()
        self._poll_beacons()
        # §9b: an ad in a backgrounded app is not on screen, so it can neither accrue viewable
        # time nor trigger a refresh. Treating the fraction as 0 handles both in one place.
        active = self._safe_app_active()
        fraction = self._safe_fraction() if active else 0.0
        self._poll_viewability(fraction)
        self._maybe_advance(fraction, active)

    # -- internals ---------------------------------------------------------------------------

    def _begin_cycle(self) -> None:
        self._cycle += 1
        self._rendered = False
        self._beacon_allowed = False
        self._beacon_fired = False
        self._visible_since = None
        self._pending = self._executor.submit(self._work)

    def _work(self) -> Tuple[Optional[Ad], RenderPlan, Optional[bytes]]:
        """Runs on the worker thread: one ad request plus (optionally) the creative bytes."""
        ad = self._client.request_ad(**self._request)
        plan = render_plan(ad, self._can_render_html)
        data: Optional[bytes] = None
        if plan is RenderPlan.IMAGE and self._verify_creative:
            assert ad.creative is not None  # render_plan guarantees it
            data = fetch_creative(ad.creative.asset_url, user_agent=self._client.user_agent)
            if data is None:
                # Downloaded nothing usable — it never drew, so it is not an impression (§9c).
                plan = RenderPlan.NONE
        return ad, plan, data

    def _poll_pending(self) -> None:
        pending = self._pending
        if pending is None or not pending.done():
            return
        self._pending = None

        try:
            ad, plan, data = pending.result()
        except Exception:  # a transport blow-up is just a failed cycle
            ad, plan, data = None, RenderPlan.NONE, None
        self._ad = ad

        rendered = False
        if plan is not RenderPlan.NONE and ad is not None:
            try:
                rendered = bool(self._draw(ad, data))
            except Exception:
                rendered = False

        self._rendered = rendered
        # Without verification we cannot prove an image drew, so the beacon stays disarmed.
        self._beacon_allowed = rendered and (plan is RenderPlan.HTML or self._verify_creative)

        if rendered:
            if self._on_loaded is not None and ad is not None:
                self._on_loaded(ad)
        else:
            reason = self._failure_reason(ad, plan)
            self._safe_clear(reason)
            if self._on_failed is not None:
                self._on_failed(reason)

        self._settle(rendered, ad.retry_after_seconds if ad is not None else None)

    @staticmethod
    def _failure_reason(ad: Optional[Ad], plan: RenderPlan) -> str:
        if ad is None:
            return "request failed"
        if not ad.filled:
            return ad.reason or "no fill"
        if plan is RenderPlan.NONE:
            return "creative could not be rendered"
        return "creative could not be rendered"

    def _settle(self, rendered: bool, retry_after_seconds: Optional[int]) -> None:
        """§9a — once a cycle settles, decide when (or whether) to ask again."""
        self._failures = 0 if rendered else self._failures + 1
        delay = next_delay_seconds(
            rendered, self._failures, retry_after_seconds, self.refresh_seconds
        )
        self._due_at = None if delay is None else self._monotonic() + delay

    def _poll_viewability(self, fraction: float) -> None:
        if not self._beacon_allowed or self._beacon_fired:
            return
        ad = self._ad
        if ad is None or not ad.is_trackable or not ad.imp_id:
            return
        now = self._monotonic()
        if fraction >= VIEWABILITY_RATIO:
            if self._visible_since is None:
                self._visible_since = now
            elif now - self._visible_since >= VIEWABILITY_SECONDS:
                self._beacon_fired = True
                beacon = _Beacon(ad.imp_id, retryable=ad.source is AdSource.INTERNAL)
                self._beacons.append(beacon)
                self._send_beacon(beacon)
        else:
            self._visible_since = None

    def _send_beacon(self, beacon: _Beacon) -> None:
        beacon.attempts += 1
        beacon.due_at = None
        beacon.future = self._executor.submit(self._report_viewable, beacon.imp_id)

    def _report_viewable(self, imp_id: str) -> ViewableOutcome:
        """Runs on the worker thread."""
        report = getattr(self._client, "report_viewable_outcome", None)
        if report is not None:
            outcome: ViewableOutcome = report(imp_id)
            return outcome
        # A duck-typed client that only has the boolean call cannot say "retry".
        recorded = self._client.report_viewable(imp_id)
        return ViewableOutcome.RECORDED if recorded else ViewableOutcome.DROP

    def _poll_beacons(self) -> None:
        """Resend beacons the server answered ``retry``, on the §5 schedule, then give up."""
        if not self._beacons:
            return
        now = self._monotonic()
        for beacon in list(self._beacons):
            future = beacon.future
            if future is not None:
                if not future.done():
                    continue
                beacon.future = None
                try:
                    outcome = future.result()
                except Exception:
                    outcome = ViewableOutcome.RETRY
                if (
                    outcome is ViewableOutcome.RETRY
                    and beacon.retryable
                    and beacon.attempts <= len(VIEWABLE_RETRY_DELAYS_SECONDS)
                ):
                    beacon.due_at = now + VIEWABLE_RETRY_DELAYS_SECONDS[beacon.attempts - 1]
                else:
                    self._beacons.remove(beacon)
            elif beacon.due_at is not None and now >= beacon.due_at:
                self._send_beacon(beacon)

    def _maybe_advance(self, fraction: float, app_active: bool) -> None:
        if self._due_at is None or self._pending is not None:
            return
        # §9b: nothing is requested while the app is backgrounded…
        if not app_active:
            return
        # …and a drawn ad that is off screen waits, while a slot showing nothing must still be
        # able to recover.
        if self._rendered and fraction <= 0.0:
            return
        if self._monotonic() < self._due_at:
            return
        self._due_at = None
        self._begin_cycle()

    def _safe_fraction(self) -> float:
        try:
            return float(self._visible_fraction())
        except Exception:
            return 0.0

    def _safe_app_active(self) -> bool:
        try:
            return bool(self._app_active())
        except Exception:
            return True

    def _safe_clear(self, reason: str) -> None:
        try:
            self._clear(reason)
        except Exception:
            pass

    # -- introspection (used by tests and adapters) ------------------------------------------

    @property
    def ad(self) -> Optional[Ad]:
        return self._ad

    @property
    def rendered(self) -> bool:
        return self._rendered

    @property
    def beacon_fired(self) -> bool:
        return self._beacon_fired

    @property
    def consecutive_failures(self) -> int:
        return self._failures

    @property
    def seconds_until_next(self) -> Optional[float]:
        if self._due_at is None:
            return None
        return max(0.0, self._due_at - self._monotonic())
