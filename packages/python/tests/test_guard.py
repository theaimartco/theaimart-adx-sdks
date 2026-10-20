"""Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts."""

import unittest

from theaimart_adx import Adx
from theaimart_adx.errors import AdxConfigError
from theaimart_adx.guard import (
    MAX_CONSENT_BYTES,
    MAX_KEYWORDS_BYTES,
    MAX_PAGE_URL_BYTES,
    MAX_REQUESTS_PER_MINUTE,
    RequestGuard,
    guard_serve_params,
    is_publishable_key,
    is_safe_identity_cookie,
    is_safe_imp_id,
    looks_like_secret,
    normalize_base_url,
    reset_request_guards,
    sanitize_consent,
    sanitize_gpp_sid,
    sanitize_keywords,
    sanitize_page_url,
    sanitize_us_privacy,
    truncate_utf8,
)
from theaimart_adx.transport import HttpResponse

SLOT = "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"


class GuardVectorTests(unittest.TestCase):
    def test_publishable_key(self):
        for ok in ("pk_x", "pk_0123456789abcdef0123456789abcdef", "pk_virgo_live-1"):
            self.assertTrue(is_publishable_key(ok), ok)
        for bad in ("", "pk_", "sk_live_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x", "pk_a b", "pk_a\n",
                    "PK_x", "pk_" + "a" * 98):
            self.assertFalse(is_publishable_key(bad), repr(bad))

    def test_base_url(self):
        self.assertEqual(normalize_base_url("https://api.adx.theaimart.co/"), "https://api.adx.theaimart.co")
        self.assertEqual(normalize_base_url("  https://h:8443/prefix// "), "https://h:8443/prefix")
        for local in ("http://localhost:8080", "http://127.0.0.1:9", "http://10.0.2.2:8080",
                      "http://192.168.1.5", "http://172.20.0.1", "http://[::1]:80", "http://dev.localhost"):
            self.assertEqual(normalize_base_url(local), local, local)
        for bad in ("http://api.adx.theaimart.co", "http://10.evil.com", "http://172.32.0.1",
                    "https://user:pw@api.adx.theaimart.co", "https://api.adx.theaimart.co@evil.com",
                    "https://h/?x=1", "https://h/#f", "https://h\\@evil.com", "https://h /x",
                    "ftp://h", "javascript:alert(1)", "https://"):
            self.assertIsNone(normalize_base_url(bad), bad)

    def test_imp_id_and_identity(self):
        self.assertTrue(is_safe_imp_id("1751600000000_550e8400-e29b-41d4-a716-446655440000"))
        for bad in ("", "a b", 'x"}', "a\r\nb", "a" * 129, None):
            self.assertFalse(is_safe_imp_id(bad), repr(bad))
        self.assertTrue(is_safe_identity_cookie("550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=="))
        for bad in ("", "a;b", "a b", "ok\r\nSet-Cookie: x", "a,b", "a" * 513):
            self.assertFalse(is_safe_identity_cookie(bad), repr(bad))

    def test_page_url(self):
        cases = [
            ("https://site.com/a/b?q=shoes#access_token=abc", "https://site.com/a/b?q=shoes"),
            ("https://user:pw@site.com/x", "https://site.com/x"),
            ("https://site.com/cb?code=abc&state=xyz&page=2", "https://site.com/cb?page=2"),
            ("https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl",
             "https://site.com/?utm_source=nl"),
            ("https://site.com/?u=alice@example.com&v=bob%40example.com&w=1", "https://site.com/?w=1"),
            ("https://site.com/@handle/post?ref=home", "https://site.com/@handle/post?ref=home"),
            ("https://site.com/x?password=hunter2", "https://site.com/x"),
            ("https://site.com/x?&&a=1&&", "https://site.com/x?a=1"),
            ("app://screen/home", "app://screen/home"),
            ("/settings/profile?email=a@b.c", "/settings/profile"),
            ("  \x00https://site.com/\r\n  ", "https://site.com/"),
            ("https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm", "https://site.com/reset/*/confirm"),
            ("https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln", "https://site.com/m/*"),
            ("https://site.com/blog/how-to-build-a-rest-api-in-rust-2026", "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026"),
            ("https://site.com/p/550e8400-e29b-41d4-a716-446655440000", "https://site.com/p/550e8400-e29b-41d4-a716-446655440000"),
            ("https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes", "https://site.com/?q=shoes"),
            ("https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3", "https://site.com/?page=3"),
            ("https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1", "https://site.com/?q=1"),
            ("https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high",
             "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high"),
            ("#only-a-fragment", None),
            ("", None),
        ]
        for raw, want in cases:
            self.assertEqual(sanitize_page_url(raw), want, repr(raw))
        out = sanitize_page_url("https://site.com/" + "é" * 5000)
        self.assertLessEqual(len(out.encode("utf-8")), MAX_PAGE_URL_BYTES)
        self.assertTrue(out.startswith("https://site.com/éé"))

    def test_looks_like_secret(self):
        for yes in ("9f86d081884c7d659a2feaa0c55ad015",
                    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln",
                    "Zx81kQ2mT7vB4nR9sW3yL6pA", "sess_4f9a8b7c6d5e4f3a2b1c"):
            self.assertTrue(looks_like_secret(yes), yes)
        for no in ("how-to-build-a-rest-api-in-rust-2026", "550e8400-e29b-41d4-a716-446655440000",
                   "nike+air+max+270+review+2026", "supercalifragilisticexpialidocious",
                   "123456789012345678901234567890", "short1a", ""):
            self.assertFalse(looks_like_secret(no), no)

    def test_truncate_utf8(self):
        s = "aé😀b"
        for n, want in ((1, "a"), (2, "a"), (3, "aé"), (6, "aé"), (7, "aé😀"), (99, "aé😀b")):
            self.assertEqual(truncate_utf8(s, n), want, n)

    def test_keywords(self):
        self.assertEqual(sanitize_keywords(" a,b\x07,c "), "a,b,c")
        self.assertIsNone(sanitize_keywords("   "))
        self.assertEqual(len(sanitize_keywords("k" * 5000)), MAX_KEYWORDS_BYTES)

    def test_privacy_signals_are_never_lost(self):
        self.assertEqual(sanitize_us_privacy("1YYN"), "1YYN")
        self.assertEqual(sanitize_us_privacy(" 1-Y-\n"), "1-Y-")
        self.assertEqual(sanitize_us_privacy("1YY" + "x" * 100)[:3], "1YY")
        self.assertEqual(sanitize_gpp_sid("7"), "7")
        self.assertEqual(sanitize_gpp_sid("7_8"), "7,8")
        self.assertEqual(sanitize_gpp_sid("7;8"), "7,8")
        self.assertEqual(sanitize_gpp_sid(" 2 , 7 "), "2,7")
        self.assertIsNone(sanitize_gpp_sid("abc"))
        self.assertLessEqual(len(sanitize_gpp_sid("1," * 200)), 128)
        tcf = "CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA"
        self.assertEqual(sanitize_consent(" %s " % tcf), tcf)
        self.assertEqual(sanitize_consent("C" * MAX_CONSENT_BYTES), "C" * MAX_CONSENT_BYTES)
        self.assertIsNone(sanitize_consent("C" * (MAX_CONSENT_BYTES + 1)))

    def test_invalid_slot_is_never_sent(self):
        self.assertIsNone(guard_serve_params("pk_x"))
        self.assertIsNone(guard_serve_params("pk_x", slot_id="s1"))
        self.assertIsNone(guard_serve_params("pk_x", slot_id=SLOT + "' or 1=1"))
        self.assertIsNone(guard_serve_params("pk_x", slot_name="  "))
        self.assertIsNone(guard_serve_params("pk_x", slot_name="n" * 129))
        by_name = dict(guard_serve_params("pk_x", slot_name=" home-top "))
        self.assertEqual(by_name["slot_name"], "home-top")
        p = dict(guard_serve_params("pk_x", slot_id=" %s " % SLOT, slot_name="ignored",
                                    page_url="https://s.com/#t"))
        self.assertEqual(p, {
            "api_key": "pk_x", "slot_id": SLOT, "slot_name": None, "page_url": "https://s.com/",
            "page_keywords": None, "us_privacy": None, "euconsent_v2": None, "gpp": None,
            "gpp_sid": None,
        })

    def test_request_budget(self):
        g = RequestGuard()
        t0 = 1_000_000
        for _ in range(MAX_REQUESTS_PER_MINUTE):
            self.assertIsNone(g.acquire(t0))
        self.assertEqual(g.acquire(t0), 1)
        self.assertIsNone(g.acquire(t0 + 1000))
        self.assertEqual(g.acquire(t0 + 1000), 1)

    def test_429_breaker(self):
        g = RequestGuard()
        g.record(429, 30, 0)
        self.assertEqual(g.acquire(1000), 29)
        self.assertIsNone(g.acquire(30_000))
        d = RequestGuard()
        d.record(429, None, 0)
        self.assertEqual(d.acquire(0), 60)
        c = RequestGuard()
        c.record(429, 86_400, 0)
        self.assertEqual(c.acquire(0), 600)
        o = RequestGuard()
        o.record(503, 999, 0)
        self.assertIsNone(o.acquire(0))


class _Counting:
    def __init__(self, status=200, body=b'{"fill": false}', headers=None):
        self.calls = []
        self._resp = HttpResponse(status, headers or {}, body)

    def request(self, method, url, headers, body, timeout):
        self.calls.append((method, url, headers, body))
        return self._resp


class ClientGuardTests(unittest.TestCase):
    def setUp(self):
        reset_request_guards()

    def tearDown(self):
        reset_request_guards()

    def test_constructor_refuses_secrets_and_cleartext(self):
        for kwargs in ({"api_key": "sk_live_secret"}, {"api_key": "eyJhbGciOiJIUzI1NiJ9.e30.sig"},
                       {"api_key": "pk_x", "base_url": "http://api.adx.theaimart.co"},
                       {"api_key": "pk_x", "base_url": "https://api.adx.theaimart.co@evil.com"}):
            with self.assertRaises(AdxConfigError, msg=repr(kwargs)):
                Adx(**kwargs)
        Adx(api_key=" pk_x\n", base_url="http://localhost:8080")

    def test_invalid_slot_never_reaches_network(self):
        t = _Counting()
        ad = Adx(api_key="pk_x", transport=t).request_ad(slot_id="s1' OR 1=1")
        self.assertFalse(ad.filled)
        self.assertEqual(ad.reason, "invalid_request")
        self.assertEqual(t.calls, [])

    def test_429_is_shared_across_clients(self):
        t = _Counting(429, b'{"fill": false}', {"retry-after": "60"})
        Adx(api_key="pk_x", transport=t).request_ad(slot_id=SLOT)
        blocked = Adx(api_key="pk_x", transport=t).request_ad(slot_id=SLOT)
        self.assertEqual(len(t.calls), 1)
        self.assertEqual(blocked.reason, "rate_limited")
        self.assertGreaterEqual(blocked.retry_after_seconds, 59)

    def test_request_loop_is_capped(self):
        t = _Counting()
        c = Adx(api_key="pk_x", transport=t)
        for _ in range(100):
            c.request_ad(slot_id=SLOT)
        self.assertEqual(len(t.calls), 60)

    def test_forged_imp_id_is_never_echoed(self):
        t = _Counting(200, b'{"success": true}')
        c = Adx(api_key="pk_x", transport=t)
        self.assertEqual(c.report_viewable_outcome('x", "admin": true, "y": "').value, "drop")
        self.assertEqual(t.calls, [])


if __name__ == "__main__":
    unittest.main()
