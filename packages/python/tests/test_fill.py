"""CONTRACT.md §9 — the continuous-fill driver shared by every Python UI adapter.

These run the real state machine against a fake clock and an inline executor, so the whole
loop (backoff, visibility gating, and the render-gated beacon) is deterministic and needs no
display. They are the coverage the Flet and Kivy adapters rely on.
"""

import unittest
from concurrent.futures import Future
from unittest import mock

from theaimart_adx.constants import MAX_RETRY_SECONDS
from theaimart_adx.fill import AdFill
from theaimart_adx.models import Ad
from theaimart_adx.viewable import VIEWABLE_RETRY_DELAYS_SECONDS, ViewableOutcome

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

IMAGE_BODY = {
    "fill": True,
    "imp_id": "imp-abc",
    "creative": {
        "asset_url": "https://cdn.example/x.png",
        "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=imp-abc",
        "width": 300,
        "height": 250,
    },
}
HTML_BODY = {
    "fill": True,
    "source": "openrtb",
    "imp_id": "imp-html",
    "creative": {"html": "<b>ad</b>", "width": 300, "height": 250},
}


class InlineExecutor:
    """Runs submitted work immediately so tests never race a thread."""

    def __init__(self):
        self.shutdown_called = False

    def submit(self, fn, *args, **kwargs):
        future = Future()
        try:
            future.set_result(fn(*args, **kwargs))
        except BaseException as exc:  # noqa: BLE001 - mirror ThreadPoolExecutor
            future.set_exception(exc)
        return future

    def shutdown(self, wait=False):
        self.shutdown_called = True


class FakeClock:
    def __init__(self):
        self.now = 1_000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class FakeClient:
    user_agent = "theaimart-adx-python/test"

    def __init__(self, bodies, status=200, retry_after=None):
        self._bodies = list(bodies)
        self._status = status
        self._retry_after = retry_after
        self.requests = 0
        self.viewables = []

    def request_ad(self, **kwargs):
        self.requests += 1
        body = self._bodies[min(self.requests - 1, len(self._bodies) - 1)]
        return Ad.from_response(self._status, body, retry_after_seconds=self._retry_after)

    def report_viewable(self, imp_id):
        self.viewables.append(imp_id)
        return True


class Surface:
    """Stands in for a Flet/Kivy view."""

    def __init__(self, fraction=1.0, draws=True):
        self.fraction = fraction
        self.draws = draws
        self.app_active = True
        self.drawn = []
        self.cleared = []

    def draw(self, ad, data):
        self.drawn.append((ad, data))
        return self.draws

    def clear(self, reason):
        self.cleared.append(reason)

    def visible_fraction(self):
        return self.fraction

    def is_app_active(self):
        return self.app_active


def pump(fill, times=2):
    """One tick fires the due request; the next processes its result (as a 250ms UI clock would)."""
    for _ in range(times):
        fill.tick()


def build(client, surface, **kwargs):
    kwargs.setdefault("refresh_seconds", 30)
    clock = kwargs.pop("clock", None) or FakeClock()
    fill = AdFill(
        client,
        {"slot_id": "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"},
        draw=surface.draw,
        clear=surface.clear,
        visible_fraction=surface.visible_fraction,
        app_active=surface.is_app_active,
        monotonic=clock,
        executor=InlineExecutor(),
        **kwargs,
    )
    return fill, clock


class ViewabilityGateTest(unittest.TestCase):
    """§9c — the beacon may only fire for a creative that actually drew."""

    def test_a_creative_that_draws_fires_exactly_one_beacon(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface)
            fill.start()
            fill.tick()
            self.assertTrue(fill.rendered)
            self.assertEqual(1, len(surface.drawn))

            fill.tick()  # first sighting starts the 1s timer
            clock.advance(1.1)
            fill.tick()
            self.assertEqual(["imp-abc"], client.viewables)

            clock.advance(5)
            fill.tick()
            self.assertEqual(["imp-abc"], client.viewables, "beacon must not repeat")

    def test_a_creative_that_fails_to_download_is_never_reported_viewable(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        # The asset 404s, or answers 200 with an HTML error page.
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=None):
            fill, clock = build(client, surface)
            fill.start()
            fill.tick()
            self.assertFalse(fill.rendered)
            self.assertEqual([], surface.drawn, "nothing may be drawn")
            self.assertEqual(["creative could not be rendered"], surface.cleared)

            clock.advance(10)
            fill.tick()
            self.assertEqual([], client.viewables)

    def test_openrtb_fill_on_a_native_surface_is_not_an_impression(self):
        client = FakeClient([HTML_BODY])
        surface = Surface()
        fill, clock = build(client, surface, can_render_html=False)
        fill.start()
        fill.tick()
        self.assertFalse(fill.rendered)
        self.assertEqual([], surface.drawn)
        clock.advance(10)
        fill.tick()
        self.assertEqual([], client.viewables)

    def test_a_surface_that_refuses_to_draw_is_not_an_impression(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface(draws=False)
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface)
            fill.start()
            fill.tick()
            clock.advance(10)
            fill.tick()
        self.assertFalse(fill.rendered)
        self.assertEqual([], client.viewables)

    def test_skipping_verification_disables_the_beacon(self):
        """Without a decode-check we cannot prove the ad drew, so we never claim a view."""
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        fill, clock = build(client, surface, verify_creative=False)
        fill.start()
        fill.tick()
        self.assertTrue(fill.rendered, "the creative is still shown")
        clock.advance(10)
        fill.tick()
        self.assertEqual([], client.viewables, "but no view is ever reported")

    def test_the_beacon_waits_for_a_full_second_at_50_percent(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface(fraction=0.4)
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface)
            fill.start()
            fill.tick()
            clock.advance(5)
            fill.tick()
            self.assertEqual([], client.viewables, "40% on screen is not viewable")

            surface.fraction = 0.6
            fill.tick()
            clock.advance(0.5)
            fill.tick()
            self.assertEqual([], client.viewables, "half a second is not enough")

            surface.fraction = 0.1  # scrolled away — the timer restarts
            fill.tick()
            surface.fraction = 0.9
            fill.tick()
            clock.advance(0.6)
            fill.tick()
            self.assertEqual([], client.viewables, "the continuous second restarted")

            clock.advance(0.5)
            fill.tick()
            self.assertEqual(["imp-abc"], client.viewables)


class ContinuousFillTest(unittest.TestCase):
    """§9a/§9b — a slot must not go permanently dark, and must not burn the rate limit."""

    def test_a_dead_slot_retries_with_backoff_and_recovers(self):
        client = FakeClient([{"fill": False}, {"fill": False}, IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=30)
            fill.start()
            fill.tick()
            self.assertEqual(1, client.requests)
            self.assertAlmostEqual(30, fill.seconds_until_next, places=3)

            clock.advance(30)
            pump(fill)
            self.assertEqual(2, client.requests)
            self.assertAlmostEqual(60, fill.seconds_until_next, places=3, msg="backoff doubles")

            clock.advance(60)
            pump(fill)
            self.assertEqual(3, client.requests)
            self.assertTrue(fill.rendered, "the slot recovered")
            self.assertEqual(0, fill.consecutive_failures)
            self.assertAlmostEqual(30, fill.seconds_until_next, places=3, msg="back to refresh")

    def test_backoff_caps_and_honours_retry_after(self):
        client = FakeClient([{"fill": False}], status=429, retry_after=120)
        surface = Surface()
        fill, clock = build(client, surface, refresh_seconds=30)
        fill.start()
        fill.tick()
        self.assertAlmostEqual(120, fill.seconds_until_next, places=3, msg="Retry-After wins")

        for _ in range(8):
            waiting = fill.seconds_until_next
            self.assertIsNotNone(waiting, "a dead slot must always have a next attempt scheduled")
            clock.advance(waiting)
            pump(fill)
        self.assertLessEqual(fill.seconds_until_next, MAX_RETRY_SECONDS)

    def test_single_shot_never_repeats(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=0)
            fill.start()
            fill.tick()
            self.assertIsNone(fill.seconds_until_next)
            clock.advance(3600)
            for _ in range(5):
                fill.tick()
        self.assertEqual(1, client.requests)

    def test_a_drawn_ad_that_is_off_screen_does_not_refresh(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=30)
            fill.start()
            fill.tick()
            surface.fraction = 0.0  # scrolled out of view
            clock.advance(120)
            fill.tick()
            self.assertEqual(1, client.requests, "no ad requests for a slot nobody can see")

            surface.fraction = 1.0  # back on screen — overdue, so it fires at once
            fill.tick()
            self.assertEqual(2, client.requests)

    def test_a_backgrounded_app_accrues_no_viewable_time(self):
        """An ad in a backgrounded app is not on screen, so its 1-second timer must not run."""
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        # Single-shot, so no refresh can interrupt and reset the viewability timer — this test
        # is only about the timer freezing. (With refresh on, coming back to the foreground while
        # overdue correctly starts a *new* cycle first; see the refresh test below.)
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=0)
            fill.start()
            fill.tick()
            surface.app_active = False
            fill.tick()
            clock.advance(60)
            fill.tick()
            self.assertEqual([], client.viewables, "a backgrounded ad was never seen")

            surface.app_active = True
            fill.tick()          # first sighting after resuming starts the second
            clock.advance(1.1)
            fill.tick()
            self.assertEqual(["imp-abc"], client.viewables)

    def test_a_backgrounded_app_does_not_refresh(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=30)
            fill.start()
            fill.tick()
            surface.app_active = False
            clock.advance(300)
            fill.tick()
            self.assertEqual(1, client.requests)

            surface.app_active = True
            fill.tick()
            self.assertEqual(2, client.requests)

    def test_an_empty_slot_recovers_even_though_nothing_is_on_screen(self):
        """The trap: gating recovery on visibility would leave a dark slot dark forever."""
        client = FakeClient([{"fill": False}, IMAGE_BODY])
        surface = Surface(fraction=0.0)
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=30)
            fill.start()
            fill.tick()
            self.assertFalse(fill.rendered)
            clock.advance(30)
            fill.tick()
            self.assertEqual(2, client.requests, "an empty slot must still retry")

    def test_stop_halts_requests_and_beacons(self):
        client = FakeClient([IMAGE_BODY])
        surface = Surface()
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = build(client, surface, refresh_seconds=30)
            fill.start()
            fill.tick()
            fill.stop()
            clock.advance(3600)
            for _ in range(5):
                fill.tick()
        self.assertEqual(1, client.requests)
        self.assertEqual([], client.viewables)

    def test_a_transport_blow_up_is_just_a_failed_cycle(self):
        class Exploding(FakeClient):
            def request_ad(self, **kwargs):
                self.requests += 1
                raise RuntimeError("network on fire")

        client = Exploding([IMAGE_BODY])
        surface = Surface()
        fill, clock = build(client, surface, refresh_seconds=30)
        fill.start()
        fill.tick()  # must not raise
        self.assertFalse(fill.rendered)
        self.assertEqual(["request failed"], surface.cleared)
        self.assertAlmostEqual(30, fill.seconds_until_next, places=3)


class ScriptedClient(FakeClient):
    """A FakeClient whose beacon answers follow a script, then repeat the last answer."""

    def __init__(self, bodies, outcomes):
        super().__init__(bodies)
        self._outcomes = list(outcomes)

    def report_viewable_outcome(self, imp_id):
        self.viewables.append(imp_id)
        return self._outcomes[min(len(self.viewables) - 1, len(self._outcomes) - 1)]


def _measured(client, **kwargs):
    """Start a fill, draw, and hold it on screen until the first beacon goes out."""
    surface = Surface()
    fill, clock = build(client, surface, **kwargs)
    fill.start()
    fill.tick()  # draw
    fill.tick()  # start the 1s timer
    clock.advance(1.1)
    fill.tick()  # fire
    return fill, clock


class AdFillResendTest(unittest.TestCase):
    def test_a_too_early_internal_beacon_is_resent_until_recorded(self):
        R, OK = ViewableOutcome.RETRY, ViewableOutcome.RECORDED
        client = ScriptedClient([IMAGE_BODY], [R, R, OK])
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = _measured(client)
            self.assertEqual(1, len(client.viewables))
            fill.tick()  # sees RETRY, schedules +1s
            clock.advance(0.9)
            fill.tick()
            self.assertEqual(1, len(client.viewables), "must wait the full delay")
            clock.advance(0.2)
            fill.tick()
            self.assertEqual(2, len(client.viewables))
            fill.tick()  # RETRY again, schedules +2s
            clock.advance(2.1)
            fill.tick()
            self.assertEqual(["imp-abc"] * 3, client.viewables)
            clock.advance(60)
            for _ in range(5):
                fill.tick()
            self.assertEqual(3, len(client.viewables), "a recorded view is never resent")

    def test_resends_stop_after_the_schedule(self):
        client = ScriptedClient([IMAGE_BODY], [ViewableOutcome.RETRY])
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = _measured(client, refresh_seconds=0)
            for _ in range(40):
                fill.tick()
                clock.advance(0.5)
        self.assertEqual(1 + len(VIEWABLE_RETRY_DELAYS_SECONDS), len(client.viewables))

    def test_a_dropped_beacon_is_not_resent(self):
        client = ScriptedClient([IMAGE_BODY], [ViewableOutcome.DROP])
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = _measured(client, refresh_seconds=0)
            for _ in range(40):
                fill.tick()
                clock.advance(0.5)
        self.assertEqual(1, len(client.viewables))

    def test_an_openrtb_beacon_is_sent_once(self):
        # external_impressions never gets a viewable row, so the answer is RETRY forever.
        client = ScriptedClient([HTML_BODY], [ViewableOutcome.RETRY])
        fill, clock = _measured(client, can_render_html=True, refresh_seconds=0)
        for _ in range(40):
            fill.tick()
            clock.advance(0.5)
        self.assertEqual(["imp-html"], client.viewables)

    def test_a_resend_survives_the_next_refresh_cycle(self):
        second = dict(IMAGE_BODY, imp_id="imp-2")
        client = ScriptedClient([IMAGE_BODY, second], [ViewableOutcome.RETRY, ViewableOutcome.RECORDED])
        with mock.patch("theaimart_adx.fill.fetch_creative", return_value=PNG):
            fill, clock = _measured(client, refresh_seconds=30)
            fill.tick()  # RETRY for imp-abc, due in 1s
            clock.advance(30)  # the refresh is due too
            fill.tick()
            fill.tick()
            self.assertIn("imp-abc", client.viewables[1:], "the old view is still delivered")
            self.assertEqual(2, client.requests)


if __name__ == "__main__":
    unittest.main()
