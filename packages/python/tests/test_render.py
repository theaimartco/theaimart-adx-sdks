"""CONTRACT.md §9c — the render gate. A fill this surface cannot draw is NOT an impression,
so it must never arm the viewability beacon."""

import unittest

from theaimart_adx.models import Ad
from theaimart_adx.render import RenderPlan, is_safe_http_url, looks_like_image, render_plan

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32


def image_ad(asset_url):
    return Ad.from_response(
        200,
        {
            "fill": True,
            "imp_id": "imp1",
            "creative": {
                "asset_url": asset_url,
                "click_url": "https://x/c",
                "width": 300,
                "height": 250,
            },
        },
    )


HTML_BODY = {
    "fill": True,
    "source": "openrtb",
    "imp_id": "imp1",
    "creative": {"html": "<b>ad</b>", "width": 300, "height": 250},
}


class RenderPlanTest(unittest.TestCase):
    def test_no_fill_and_transport_errors_are_never_renderable(self):
        self.assertIs(RenderPlan.NONE, render_plan(Ad.from_response(200, {"fill": False}), True))
        self.assertIs(RenderPlan.NONE, render_plan(Ad.from_response(0, None), True))
        self.assertIs(RenderPlan.NONE, render_plan(None, True))

    def test_ordinary_image_creative_renders(self):
        self.assertIs(RenderPlan.IMAGE, render_plan(image_ad("https://cdn/x.png"), False))
        self.assertIs(RenderPlan.IMAGE, render_plan(image_ad("http://cdn/x.png"), False))

    def test_hostile_asset_url_is_dropped(self):
        for hostile in (
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:image/png;base64,AAAA",
            "intent://x",
        ):
            self.assertIs(RenderPlan.NONE, render_plan(image_ad(hostile), True), hostile)

    def test_openrtb_fill_renders_only_where_a_webview_exists(self):
        self.assertIs(RenderPlan.HTML, render_plan(Ad.from_response(200, HTML_BODY), True))
        # A native Python toolkit has no WebView, so OpenRTB demand is refused rather than
        # counted as a view of an invisible ad.
        self.assertIs(RenderPlan.NONE, render_plan(Ad.from_response(200, HTML_BODY), False))

    def test_house_ad_renders_but_is_not_trackable(self):
        house = Ad.from_response(
            200,
            {
                "fill": True,
                "source": "house",
                "creative": {
                    "asset_url": "https://cdn/h.png",
                    "click_url": "https://adv/x",
                    "width": 300,
                    "height": 250,
                },
            },
        )
        self.assertIs(RenderPlan.IMAGE, render_plan(house, True))
        self.assertFalse(house.is_trackable)

    def test_safe_url_allowlist(self):
        self.assertTrue(is_safe_http_url("https://x.example/a"))
        self.assertTrue(is_safe_http_url("HTTP://x.example"))
        self.assertTrue(is_safe_http_url("  https://x.example  "))
        self.assertFalse(is_safe_http_url("javascript:alert(1)"))
        self.assertFalse(is_safe_http_url(None))
        self.assertFalse(is_safe_http_url(""))


class ImageSniffTest(unittest.TestCase):
    def test_accepts_real_raster_formats(self):
        for data in (PNG, JPEG, WEBP, b"GIF89a" + b"\x00" * 32, b"BM" + b"\x00" * 32):
            self.assertTrue(looks_like_image(data))

    def test_rejects_html_error_pages_and_junk(self):
        # An ad server that answers 200 with an HTML error page must not count as a creative.
        self.assertFalse(looks_like_image(b"<!DOCTYPE html><html>404 not found</html>"))
        self.assertFalse(looks_like_image(b""))
        self.assertFalse(looks_like_image(None))
        self.assertFalse(looks_like_image(b"\x00\x01"))
        self.assertFalse(looks_like_image(b"RIFF\x00\x00\x00\x00AVI "))


if __name__ == "__main__":
    unittest.main()
