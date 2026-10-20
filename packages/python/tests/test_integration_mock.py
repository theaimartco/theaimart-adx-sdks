"""End-to-end test against a local mock ad server that faithfully reproduces the backend's
SqlInjectionMiddleware. Uses the REAL UrllibTransport, so it proves that:

  1. the SDK's full byte-encoding makes a hostile page_url slip past the WAF (no 403),
  2. the server still decodes that page_url back to the exact original value,
  3. a naive/raw request with the same page_url WOULD be blocked (the danger is real),
  4. the viewability beacon posts the correct body and is accepted.
"""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from theaimart_adx import Adx
from theaimart_adx.encoding import SQL_INJECTION_KEYWORDS
from theaimart_adx.models import AdKind

NASTY_PAGE_URL = (
    "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com"
    "&sel=select a table; drop-- update union open cast 1=1"
)

INTERNAL_BODY = {
    "fill": True,
    "imp_id": "imp-e2e-1",
    "identity_id": "id-e2e",
    "auction": {"type": "second_price", "clearing_price_paise": 120},
    "creative": {
        "asset_url": "https://cdn/x.png",
        "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=imp-e2e-1",
        "headline": "Hello",
        "width": 300,
        "height": 250,
    },
}


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence test noise
        pass

    def _waf_block(self, raw_query):
        lowered = (raw_query or "").lower()
        return any(kw in lowered for kw in SQL_INJECTION_KEYWORDS)

    def _json(self, status, payload, extra_headers=None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, raw_query = self.path.partition("?")
        # Faithful reproduction of the backend WAF: inspect the RAW query string.
        if self._waf_block(raw_query):
            self.server.waf_blocks += 1  # type: ignore[attr-defined]
            self._json(403, {"error": "Request blocked due to security policy"})
            return
        if path == "/api/v1/serve/ad":
            from urllib.parse import parse_qs

            decoded = parse_qs(raw_query, keep_blank_values=True)
            self.server.captured_page_urls.append(decoded.get("page_url", [None])[0])  # type: ignore[attr-defined]
            self._json(200, INTERNAL_BODY, {"Set-Cookie": "_an_id=e2ecookie; Path=/; HttpOnly"})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        if self.path == "/api/v1/serve/viewable":
            try:
                self.server.captured_viewables.append(json.loads(raw.decode()))  # type: ignore[attr-defined]
            except ValueError:
                pass
            self._json(200, {"success": True})
            return
        self._json(404, {"error": "not found"})


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.server.waf_blocks = 0
        cls.server.captured_page_urls = []
        cls.server.captured_viewables = []
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.base_url = "http://%s:%d" % (host, port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_hostile_page_url_is_not_blocked_and_roundtrips(self):
        adx = Adx(api_key="pk_e2e", base_url=self.base_url)
        ad = adx.request_ad(slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", page_url=NASTY_PAGE_URL, page_keywords="select,table,cast")
        self.assertTrue(ad.filled, "expected a fill, got status %s" % ad.http_status)
        self.assertEqual(ad.kind, AdKind.IMAGE)
        self.assertEqual(ad.imp_id, "imp-e2e-1")
        self.assertEqual(ad.set_identity_cookie, "e2ecookie")
        # The server decoded our fully-encoded value back to the original — minus the email,
        # which CONTRACT.md §12 keeps on the device.
        self.assertEqual(
            self.server.captured_page_urls[-1], NASTY_PAGE_URL.replace("&u=alice@example.com", "")
        )

    def test_naive_raw_request_is_blocked_by_the_mock_waf(self):
        # Sanity: the same page_url sent as an ordinary query DOES trip the WAF, proving
        # the mock is faithful and that the SDK's encoding is what saves us.
        from urllib.parse import urlencode

        raw = urlencode({"api_key": "pk_e2e", "slot_id": "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", "page_url": NASTY_PAGE_URL})
        url = self.base_url + "/api/v1/serve/ad?" + raw
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(url, timeout=5)
        self.assertEqual(ctx.exception.code, 403)
        ctx.exception.close()  # avoid ResourceWarning from the error's spooled body

    def test_viewable_beacon(self):
        adx = Adx(api_key="pk_e2e", base_url=self.base_url)
        self.assertTrue(adx.report_viewable("imp-e2e-1"))
        self.assertIn({"imp_id": "imp-e2e-1"}, self.server.captured_viewables)


if __name__ == "__main__":
    unittest.main()
