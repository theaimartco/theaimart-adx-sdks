"""Tests for the SQL-filter-safe query encoding (CONTRACT.md §7).

The headline test proves that a deliberately hostile page_url — packed with WAF keywords
that appear in ordinary URLs — produces a raw query the backend WAF would accept, while
still round-tripping to the exact original value on decode.
"""

import unittest
from urllib.parse import parse_qs, unquote, urlencode

from theaimart_adx.encoding import (
    SQL_INJECTION_KEYWORDS,
    build_serve_query,
    percent_encode_all,
    raw_query_is_waf_safe,
)

# A single string that contains a large fraction of the WAF keyword list as substrings,
# in the shape real URLs take: weekEND, broadCAST, frontEND, an @, "select", "table",
# "drop", "--", "update", "union", "open", "cast", "1=1", ";".
NASTY_PAGE_URL = (
    "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com"
    "&sel=select a table; drop-- update union open cast 1=1"
)


class PercentEncodeAllTests(unittest.TestCase):
    def test_encodes_every_byte_uppercase_hex(self):
        self.assertEqual(percent_encode_all("aZ0"), "%61%5A%30")

    def test_encodes_reserved_and_unicode(self):
        # '@' -> %40, space -> %20, '=' -> %3D, and a multibyte char -> two %XX bytes.
        self.assertEqual(percent_encode_all("a@ =é"), "%61%40%20%3D%C3%A9")

    def test_roundtrips_via_unquote(self):
        for value in ["", "hello", NASTY_PAGE_URL, "日本語/тест/😀"]:
            self.assertEqual(unquote(percent_encode_all(value)), value)

    def test_output_has_no_ascii_letters_beyond_hex(self):
        encoded = percent_encode_all(NASTY_PAGE_URL)
        for ch in encoded:
            self.assertIn(ch, "%0123456789ABCDEF")


class BuildServeQueryTests(unittest.TestCase):
    def test_skips_none_values(self):
        query = build_serve_query([("api_key", "pk_x"), ("slot_id", None), ("slot_name", "home")])
        self.assertIn("api_key=", query)
        self.assertNotIn("slot_id=", query)
        self.assertIn("slot_name=", query)

    def test_roundtrip_decode_matches_original(self):
        query = build_serve_query(
            [
                ("api_key", "pk_appstore_aiappstore_live"),
                ("slot_id", "8b1f2c3d-1111-2222-3333-444455556666"),
                ("page_url", NASTY_PAGE_URL),
                ("page_keywords", "news,sports,finance@home"),
            ]
        )
        decoded = parse_qs(query, keep_blank_values=True)
        self.assertEqual(decoded["api_key"], ["pk_appstore_aiappstore_live"])
        self.assertEqual(decoded["slot_id"], ["8b1f2c3d-1111-2222-3333-444455556666"])
        self.assertEqual(decoded["page_url"], [NASTY_PAGE_URL])
        self.assertEqual(decoded["page_keywords"], ["news,sports,finance@home"])


class WafSafetyTests(unittest.TestCase):
    def test_built_query_is_waf_safe_even_for_hostile_input(self):
        query = build_serve_query(
            [
                ("api_key", "pk_live_deadbeefcafe"),
                ("slot_id", "11111111-2222-3333-4444-555555555555"),
                ("page_url", NASTY_PAGE_URL),
                ("page_keywords", "select,table,update,cast,end,open"),
                ("us_privacy", "1YNN"),
                ("euconsent_v2", "CPccccccPcccccABCENDcastopen=="),  # base64-ish, keyword-laden
            ]
        )
        lowered = query.lower()
        offenders = [kw for kw in SQL_INJECTION_KEYWORDS if kw in lowered]
        self.assertEqual(offenders, [], "built query leaks WAF keywords: %r" % offenders)
        self.assertTrue(raw_query_is_waf_safe(query))

    def test_naive_urlencoding_would_be_unsafe(self):
        # Proves the danger is real: ordinary urlencode of the same input trips the WAF,
        # which is exactly why the SDK does full byte-encoding instead.
        naive = urlencode({"page_url": NASTY_PAGE_URL})
        self.assertFalse(raw_query_is_waf_safe(naive))

    def test_param_names_are_keyword_free(self):
        names = ["api_key", "slot_id", "slot_name", "page_url", "page_keywords", "us_privacy", "euconsent_v2"]
        for name in names:
            offenders = [kw for kw in SQL_INJECTION_KEYWORDS if kw in name.lower()]
            self.assertEqual(offenders, [], "param name %r contains keyword(s) %r" % (name, offenders))


if __name__ == "__main__":
    unittest.main()
