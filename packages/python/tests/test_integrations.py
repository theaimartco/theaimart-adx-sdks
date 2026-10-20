"""UI-adapter tests.

The heavy lifting (backoff, visibility gating, the render gate) is covered by ``test_fill.py``
against the shared driver, so these cover what is adapter-specific: argument validation, the
generated Streamlit component, and — where the framework is installed — that a real control is
actually built and that the §9c gate survives the adapter layer.

Framework-specific cases skip cleanly when that framework is not installed, so the core suite
still runs in a dependency-free environment.
"""

import importlib.util
import json
import re
import unittest

from theaimart_adx.constants import MAX_RETRY_SECONDS, MIN_REFRESH_SECONDS
from theaimart_adx.integrations.streamlit import banner_html
from theaimart_adx.models import Ad

HAS_FLET = importlib.util.find_spec("flet") is not None
HAS_KIVY = importlib.util.find_spec("kivy") is not None

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

IMAGE_AD = Ad.from_response(
    200,
    {
        "fill": True,
        "imp_id": "imp-abc",
        "creative": {
            "asset_url": "https://cdn.example/x.png",
            "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=imp-abc",
            "headline": "Buy now",
            "width": 320,
            "height": 50,
        },
    },
)
HOSTILE_AD = Ad.from_response(
    200,
    {
        "fill": True,
        "imp_id": "imp-bad",
        "creative": {"asset_url": "javascript:alert(1)", "width": 320, "height": 50},
    },
)


class StreamlitComponentTest(unittest.TestCase):
    def test_html_is_deterministic_so_streamlit_does_not_remount_it(self):
        """A changing string would remount the iframe on every rerun and re-request an ad."""
        first = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", refresh_seconds=60)
        second = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", refresh_seconds=60)
        self.assertEqual(first, second)

    def test_config_cannot_break_out_of_the_script_tag(self):
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", page_url="https://x/</script><b>evil")
        self.assertNotIn("</script><b>evil", html)
        self.assertIn("<\\/script>", html)

    def test_config_carries_the_shared_policy_constants(self):
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", refresh_seconds=45)
        config = json.loads(re.search(r'type="application/json">(.*?)</script>', html, re.S).group(1))
        self.assertEqual(MIN_REFRESH_SECONDS, config["minRefresh"])
        self.assertEqual(MAX_RETRY_SECONDS, config["maxRetry"])
        self.assertEqual(45, config["refreshSeconds"])
        self.assertEqual("https://api.adx.theaimart.co", config["baseUrl"])

    def test_openrtb_markup_is_sandboxed_and_never_same_origin(self):
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        self.assertIn("allow-scripts allow-popups allow-popups-to-escape-sandbox", html)
        self.assertNotIn("allow-same-origin", html)

    def test_component_is_responsive_and_sleeps_while_the_tab_is_hidden(self):
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", refresh_seconds=60)
        self.assertIn('slot.style.aspectRatio', html)
        self.assertIn('img.style.objectFit = "contain"', html)
        self.assertIn('document.addEventListener("visibilitychange"', html)
        self.assertNotIn("setTimeout(request, 1000)", html)

    def test_requires_a_key_and_a_slot(self):
        with self.assertRaises(ValueError):
            banner_html(api_key="", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        with self.assertRaises(ValueError):
            banner_html(api_key="pk_x")


class FletAdapterTest(unittest.TestCase):
    def _page(self):
        class FakePage:
            def __init__(self):
                self.launched = []
                self.updates = 0
                self.on_app_lifecycle_state_change = None

            def run_task(self, fn):
                return None

            def update(self):
                self.updates += 1

            def launch_url(self, url):
                self.launched.append(url)

        return FakePage()

    def test_requires_a_key_and_a_slot(self):
        from theaimart_adx.integrations.flet import BannerAd

        page = self._page()
        with self.assertRaises(ValueError):
            BannerAd(page, slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        with self.assertRaises(ValueError):
            BannerAd(page, api_key="pk_x")

    @unittest.skipUnless(HAS_FLET, "flet is not installed")
    def test_draws_an_image_and_refuses_a_hostile_asset_url(self):
        from theaimart_adx.integrations.flet import BannerAd

        page = self._page()
        banner = BannerAd(page, api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", refresh_seconds=60)
        self.assertFalse(banner.control.visible)
        self.assertEqual(12.0, banner.control.border_radius)
        self.assertEqual("#F3F5F7", banner.control.bgcolor)
        self.assertEqual(0.0, banner._default_visible_fraction())

        self.assertTrue(banner._draw(IMAGE_AD, PNG))
        self.assertTrue(banner.control.visible)
        self.assertEqual(320, banner.control.width)
        self.assertEqual(1.0, banner._default_visible_fraction())
        image = getattr(banner.control.content, "content", banner.control.content)
        self.assertEqual(PNG, image.src)

        # §4e: a javascript: asset never becomes a control.
        self.assertFalse(banner._draw(HOSTILE_AD, PNG))

        banner._clear("no fill")
        self.assertFalse(banner.control.visible)
        self.assertIsNone(banner.control.content)

    @unittest.skipUnless(HAS_FLET, "flet is not installed")
    def test_only_http_click_urls_are_launched(self):
        from theaimart_adx.integrations.flet import BannerAd

        page = self._page()
        banner = BannerAd(page, api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        banner._draw(IMAGE_AD, PNG)
        banner._handle_tap(None)
        self.assertEqual(["https://api.adx.theaimart.co/api/v1/serve/click?id=imp-abc"], page.launched)

        banner._click_url = None  # a rejected scheme leaves no target
        banner._handle_tap(None)
        self.assertEqual(1, len(page.launched))


@unittest.skipUnless(HAS_KIVY, "kivy is not installed")
class KivyAdapterTest(unittest.TestCase):
    def test_junk_bytes_never_become_a_texture(self):
        from theaimart_adx.integrations.kivy import texture_from_bytes

        # An HTML error page served with 200 is the case that used to be counted as an impression.
        self.assertIsNone(texture_from_bytes(b"<!DOCTYPE html><html>404</html>"))
        self.assertIsNone(texture_from_bytes(b""))
        self.assertIsNone(texture_from_bytes(None))
        self.assertIsNone(texture_from_bytes(b"\x00\x01\x02\x03"))

    def test_requires_a_key_and_a_slot(self):
        from theaimart_adx.integrations.kivy import BannerAd

        with self.assertRaises(ValueError):
            BannerAd(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        with self.assertRaises(ValueError):
            BannerAd(api_key="pk_x")


if __name__ == "__main__":
    unittest.main()
