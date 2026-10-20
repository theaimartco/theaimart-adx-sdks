"""Tests for the Adx client, using an injected fake transport (no network)."""

import json
import unittest
from types import SimpleNamespace
from urllib.parse import parse_qs

from theaimart_adx import Adx
from theaimart_adx.encoding import raw_query_is_waf_safe
from theaimart_adx.errors import AdxConfigError, AdxTransportError
from theaimart_adx.models import AdKind
from theaimart_adx.transport import HttpResponse

INTERNAL_BODY = {
    "fill": True,
    "imp_id": "imp123",
    "identity_id": "id123",
    "auction": {"type": "second_price", "clearing_price_paise": 120},
    "creative": {
        "asset_url": "https://cdn/x.png",
        "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=imp123",
        "headline": "Hi",
        "width": 300,
        "height": 250,
    },
}


class FakeTransport:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    def request(self, method, url, headers, body, timeout):
        self.calls.append(
            SimpleNamespace(method=method, url=url, headers=dict(headers), body=body, timeout=timeout)
        )
        if self._error is not None:
            raise self._error
        return self._response

    @property
    def last(self):
        return self.calls[-1]


def _ok(body_dict, status=200, headers=None):
    return HttpResponse(status, headers or {}, json.dumps(body_dict).encode("utf-8"))


class ConstructorTests(unittest.TestCase):
    def test_requires_api_key(self):
        with self.assertRaises(AdxConfigError):
            Adx(api_key="")

    def test_strips_trailing_slash_from_base_url(self):
        c = Adx(api_key="pk_x", base_url="https://host/", transport=FakeTransport(_ok(INTERNAL_BODY)))
        c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        self.assertTrue(c._transport.last.url.startswith("https://host/api/v1/serve/ad?"))


class RequestAdTests(unittest.TestCase):
    def setUp(self):
        self.t = FakeTransport(_ok(INTERNAL_BODY))
        self.c = Adx(api_key="pk_test_key", base_url="https://host", transport=self.t)

    def test_builds_get_with_safe_query(self):
        ad = self.c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", page_url="https://x/weekend/@broadcast?a=select")
        call = self.t.last
        self.assertEqual(call.method, "GET")
        path, _, query = call.url.partition("?")
        self.assertEqual(path, "https://host/api/v1/serve/ad")
        self.assertTrue(raw_query_is_waf_safe(query), "query is not WAF-safe: %s" % query)
        decoded = parse_qs(query)
        self.assertEqual(decoded["api_key"], ["pk_test_key"])
        self.assertEqual(decoded["slot_id"], ["6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"])
        self.assertEqual(decoded["page_url"], ["https://x/weekend/@broadcast?a=select"])
        self.assertTrue(ad.filled)
        self.assertEqual(ad.kind, AdKind.IMAGE)
        self.assertEqual(ad.imp_id, "imp123")

    def test_default_headers(self):
        self.c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        headers = self.t.last.headers
        self.assertEqual(headers["Accept"], "application/json")
        self.assertTrue(headers["User-Agent"].startswith("theaimart-adx-python/"))
        self.assertTrue(headers["X-Adx-Sdk"].startswith("theaimart-adx-python/"))
        # UA must not contain any backend bot substring.
        ua_low = headers["User-Agent"].lower()
        for bad in ("python-requests", "httpclient", "okhttp", "curl/", "bot", "crawler"):
            self.assertNotIn(bad, ua_low)

    def test_per_request_overrides(self):
        self.c.request_ad(
            slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a",
            user_agent="Mozilla/5.0 (iPhone)",
            client_ip="203.0.113.7",
            identity_cookie="cookieval",
        )
        headers = self.t.last.headers
        self.assertEqual(headers["User-Agent"], "Mozilla/5.0 (iPhone)")
        self.assertEqual(headers["X-Forwarded-For"], "203.0.113.7")
        self.assertEqual(headers["Cookie"], "_an_id=cookieval")

    def test_requires_slot(self):
        with self.assertRaises(AdxConfigError):
            self.c.request_ad()

    def test_header_injection_is_scrubbed(self):
        self.c.request_ad(
            slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a",
            client_ip="1.2.3.4\r\nX-Injected: evil",
            identity_cookie="ok\r\nSet-Cookie: pwn",
        )
        headers = self.t.last.headers
        self.assertNotIn("\r", headers["X-Forwarded-For"])
        self.assertNotIn("\n", headers["X-Forwarded-For"])
        # A cookie the server could not have issued is not repaired and sent — it is not sent.
        self.assertNotIn("Cookie", headers)
        self.assertEqual(headers["X-Forwarded-For"], "1.2.3.4X-Injected: evil")

    def test_every_control_character_is_scrubbed_but_spaces_survive(self):
        """CR/LF are the injection vector, but the whole control class is removed — matching
        the Rust SDK's ``char::is_control()`` and the Node SDK's ``\\p{Cc}``. A space is legal
        in a header value (``X-Forwarded-For: a, b``) and must be left alone."""
        self.c.request_ad(
            slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a",
            client_ip="1.2.3.4, 5.6.7.8\x00\x7f\x85\r\n",
            identity_cookie="abc\x00def",
        )
        headers = self.t.last.headers
        for ch in ("\x00", "\x7f", "\x85", "\r", "\n"):
            self.assertNotIn(ch, headers["X-Forwarded-For"])
        self.assertEqual(headers["X-Forwarded-For"], "1.2.3.4, 5.6.7.8")
        self.assertNotIn("Cookie", headers)

    def test_transport_error_fails_closed(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(error=AdxTransportError("boom")))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        self.assertFalse(ad.filled)
        self.assertEqual(ad.http_status, 0)

    def test_transport_error_can_raise(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(error=AdxTransportError("boom")), raise_on_error=True)
        with self.assertRaises(AdxTransportError):
            c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")

    def test_plaintext_error_body_is_no_fill(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(HttpResponse(400, {}, b"Query deserialize error")))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        self.assertFalse(ad.filled)


class ViewableTests(unittest.TestCase):
    def test_posts_correct_body(self):
        t = FakeTransport(_ok({"success": True}))
        c = Adx(api_key="pk_x", base_url="https://host", transport=t)
        self.assertTrue(c.report_viewable("imp999"))
        call = t.last
        self.assertEqual(call.method, "POST")
        self.assertEqual(call.url, "https://host/api/v1/serve/viewable")
        self.assertEqual(json.loads(call.body.decode()), {"imp_id": "imp999"})
        self.assertEqual(call.headers["Content-Type"], "application/json")

    def test_empty_imp_id_is_noop(self):
        t = FakeTransport(_ok({"success": True}))
        c = Adx(api_key="pk_x", transport=t)
        self.assertFalse(c.report_viewable(""))
        self.assertEqual(t.calls, [])

    def test_non_2xx_returns_false(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(HttpResponse(500, {}, b"")))
        self.assertFalse(c.report_viewable("imp1"))


class ClickUrlTests(unittest.TestCase):
    def test_click_url(self):
        c = Adx(api_key="pk_x", base_url="https://host")
        self.assertEqual(c.click_url("imp 1/2"), "https://host/api/v1/serve/click?id=imp%201%2F2")


class RenderHtmlTests(unittest.TestCase):
    def test_image_ad(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(_ok(INTERNAL_BODY)))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        html = Adx.render_html(ad)
        self.assertIn("<a ", html)
        self.assertIn('href="https://api.adx.theaimart.co/api/v1/serve/click?id=imp123"', html)
        self.assertIn('src="https://cdn/x.png"', html)
        self.assertIn('rel="noopener nofollow sponsored"', html)

    def test_html_ad_is_sandboxed(self):
        body = {"fill": True, "source": "openrtb", "imp_id": "i", "creative": {"html": "<b>x</b>", "width": 320, "height": 50}}
        c = Adx(api_key="pk_x", transport=FakeTransport(_ok(body)))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        html = Adx.render_html(ad)
        self.assertIn("<iframe", html)
        self.assertIn("sandbox=", html)
        self.assertIn("srcdoc=", html)
        self.assertIn("&lt;b&gt;x&lt;/b&gt;", html)  # markup is escaped into srcdoc

    def test_no_fill_renders_empty(self):
        c = Adx(api_key="pk_x", transport=FakeTransport(_ok({"fill": False})))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        self.assertEqual(Adx.render_html(ad), "")

    def test_hostile_click_url_is_dropped(self):
        body = {
            "fill": True,
            "imp_id": "i",
            "creative": {
                "asset_url": "https://cdn/x.png",
                "click_url": "javascript:alert(document.cookie)",
                "headline": "Hi",
                "width": 300,
                "height": 250,
            },
        }
        c = Adx(api_key="pk_x", transport=FakeTransport(_ok(body)))
        ad = c.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        html = Adx.render_html(ad)
        self.assertNotIn("<a ", html)  # no navigable link for a javascript: URL
        self.assertNotIn("javascript:", html.lower())
        self.assertIn("<img", html)  # image still renders


if __name__ == "__main__":
    unittest.main()
