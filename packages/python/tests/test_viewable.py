"""CONTRACT.md §5 — viewability-beacon outcomes and the client. AdFill's resend schedule is
tested in test_fill.py, next to the rest of the state machine."""

import unittest
from urllib.parse import parse_qs, urlsplit

from theaimart_adx import Adx
from theaimart_adx.errors import AdxTransportError
from theaimart_adx.transport import HttpResponse
from theaimart_adx.viewable import (
    ViewableOutcome,
    viewable_outcome,
)

TOO_EARLY = {"success": False, "reason": "impression_not_recorded_yet", "retry": True}


class OutcomeTableTest(unittest.TestCase):
    def test_every_contract_response(self):
        cases = [
            (200, {"success": True}, ViewableOutcome.RECORDED),
            (200, {"success": True, "duplicate": True}, ViewableOutcome.RECORDED),
            (200, TOO_EARLY, ViewableOutcome.RETRY),
            (0, None, ViewableOutcome.RETRY),
            (429, {"error": "rate limit"}, ViewableOutcome.RETRY),
            (500, None, ViewableOutcome.RETRY),
            (503, "oops", ViewableOutcome.RETRY),
            (400, "Json deserialize error", ViewableOutcome.DROP),
            (404, None, ViewableOutcome.DROP),
            (200, {"success": False}, ViewableOutcome.DROP),
            (200, None, ViewableOutcome.DROP),
            (200, [True], ViewableOutcome.DROP),
            (200, {"success": "true"}, ViewableOutcome.DROP),
        ]
        for status, body, want in cases:
            with self.subTest(status=status, body=body):
                self.assertIs(want, viewable_outcome(status, body))


class _Transport:
    def __init__(self, status=200, body=b"", error=None):
        self.status, self.body, self.error = status, body, error
        self.calls = []

    def request(self, method, url, headers, body, timeout):
        self.calls.append((method, url, headers, body))
        if self.error is not None:
            raise self.error
        return HttpResponse(self.status, {}, self.body)


class ClientTest(unittest.TestCase):
    def test_a_too_early_beacon_is_not_a_success(self):
        # The regression: this is a 200, so a status-only check used to call it recorded.
        t = _Transport(body=b'{"success": false, "reason": "impression_not_recorded_yet", "retry": true}')
        adx = Adx(api_key="pk_x", transport=t)
        self.assertFalse(adx.report_viewable("imp1"))
        self.assertIs(ViewableOutcome.RETRY, adx.report_viewable_outcome("imp1"))

    def test_duplicate_is_recorded(self):
        adx = Adx(api_key="pk_x", transport=_Transport(body=b'{"success": true, "duplicate": true}'))
        self.assertTrue(adx.report_viewable("imp1"))

    def test_transport_error_is_retry_and_empty_id_is_drop(self):
        t = _Transport(error=AdxTransportError("reset"))
        adx = Adx(api_key="pk_x", transport=t)
        self.assertIs(ViewableOutcome.RETRY, adx.report_viewable_outcome("imp1"))
        self.assertIs(ViewableOutcome.DROP, adx.report_viewable_outcome(""))
        self.assertEqual(1, len(t.calls))

    def test_gpp_is_sent_fully_encoded(self):
        t = _Transport(body=b'{"fill": false}')
        Adx(api_key="pk_x", base_url="https://host", transport=t).request_ad(
            slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", gpp="DBABMA~CPXxRfA", gpp_sid="7,8"
        )
        url = t.calls[0][1]
        self.assertIn("&gpp_sid=%37%2C%38", url)
        self.assertIn("&gpp=%44%42%41%42%4D%41%7E%43%50%58%78%52%66%41", url)
        q = parse_qs(urlsplit(url).query)
        self.assertEqual(["DBABMA~CPXxRfA"], q["gpp"])
        self.assertEqual(["7,8"], q["gpp_sid"])


if __name__ == "__main__":
    unittest.main()
