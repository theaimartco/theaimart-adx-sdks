"""Tests for parsing the backend's 4-way response union into a normalized Ad."""

import unittest

from theaimart_adx.models import Ad, AdKind, AdSource

INTERNAL = {
    "fill": True,
    "imp_id": "1751600000000_550e8400",
    "identity_id": "id-uuid",
    "auction": {
        "type": "second_price",
        "clearing_price_paise": 120,
        "quality_score": 0.83,
        "effective_bid": 99.6,
        "winner_bid_paise": 150,
    },
    "creative": {
        "id": "creative-uuid",
        "campaign_id": "campaign-uuid",
        "asset_url": "https://cdn/banner.png",
        "click_url": "https://api.adx.theaimart.co/api/v1/serve/click?id=1751600000000_550e8400",
        "headline": "Buy now",
        "description": None,
        "width": 300,
        "height": 250,
    },
}

OPENRTB = {
    "fill": True,
    "source": "openrtb",
    "imp_id": "imp-rtb",
    "identity_id": "id-uuid",
    "dsp": "Some DSP",
    "auction": {"type": "unified", "clearing_price_paise": 140, "winner_ecpm_paise": 160},
    "creative": {"html": "<div>ad</div>", "width": 320, "height": 50},
}

HOUSE = {
    "fill": True,
    "source": "house",
    "identity_id": "id-uuid",
    "creative": {
        "asset_url": "https://cdn/house.png",
        "click_url": "https://advertiser.example/landing",
        "headline": "House ad",
        "description": None,
        "width": 300,
        "height": 250,
    },
}


class ResponseParsingTests(unittest.TestCase):
    def test_internal_fill(self):
        ad = Ad.from_response(200, INTERNAL)
        self.assertTrue(ad.filled)
        self.assertEqual(ad.kind, AdKind.IMAGE)
        self.assertEqual(ad.source, AdSource.INTERNAL)  # no "source" field -> internal
        self.assertEqual(ad.imp_id, "1751600000000_550e8400")
        self.assertTrue(ad.is_trackable)
        self.assertEqual(ad.creative.asset_url, "https://cdn/banner.png")
        self.assertTrue(ad.creative.click_url.endswith("id=1751600000000_550e8400"))
        self.assertEqual(ad.auction.type, "second_price")
        self.assertEqual(ad.auction.clearing_price_paise, 120)
        self.assertAlmostEqual(ad.auction.quality_score, 0.83)

    def test_openrtb_html_fill(self):
        ad = Ad.from_response(200, OPENRTB)
        self.assertTrue(ad.filled)
        self.assertEqual(ad.kind, AdKind.HTML)
        self.assertEqual(ad.source, AdSource.OPENRTB)
        self.assertEqual(ad.dsp, "Some DSP")
        self.assertEqual(ad.creative.html, "<div>ad</div>")
        self.assertEqual(ad.creative.width, 320)
        self.assertEqual(ad.auction.winner_ecpm_paise, 160)
        self.assertTrue(ad.is_trackable)

    def test_house_fill_is_not_trackable(self):
        ad = Ad.from_response(200, HOUSE)
        self.assertTrue(ad.filled)
        self.assertEqual(ad.kind, AdKind.IMAGE)
        self.assertEqual(ad.source, AdSource.HOUSE)
        self.assertIsNone(ad.imp_id)
        self.assertFalse(ad.is_trackable)  # house ads cannot fire a viewability beacon
        self.assertEqual(ad.creative.click_url, "https://advertiser.example/landing")

    def test_no_fill_plain(self):
        ad = Ad.from_response(200, {"fill": False})
        self.assertFalse(ad.filled)
        self.assertEqual(ad.kind, AdKind.NO_FILL)
        self.assertIsNone(ad.reason)

    def test_no_fill_with_reason(self):
        ad = Ad.from_response(200, {"fill": False, "reason": "fraud_rejected"})
        self.assertFalse(ad.filled)
        self.assertEqual(ad.reason, "fraud_rejected")

    def test_non_200_status_is_no_fill(self):
        ad = Ad.from_response(429, {"fill": False, "error": "rate limit exceeded"}, retry_after_seconds=60)
        self.assertFalse(ad.filled)
        self.assertEqual(ad.http_status, 429)
        self.assertEqual(ad.retry_after_seconds, 60)

    def test_non_dict_body_is_no_fill(self):
        for body in (None, "plain text error", 123, ["a"]):
            ad = Ad.from_response(400, body)
            self.assertFalse(ad.filled)
            self.assertEqual(ad.kind, AdKind.NO_FILL)

    def test_creative_dimensions_default(self):
        ad = Ad.from_response(200, {"fill": True, "creative": {"asset_url": "x", "click_url": "y"}})
        self.assertEqual(ad.creative.width, 300)
        self.assertEqual(ad.creative.height, 250)

    def test_identity_cookie_passthrough(self):
        ad = Ad.from_response(200, INTERNAL, set_identity_cookie="abc123")
        self.assertEqual(ad.set_identity_cookie, "abc123")


if __name__ == "__main__":
    unittest.main()
