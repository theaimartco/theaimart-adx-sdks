"""CONTRACT.md §9a — the continuous-fill scheduling policy.

This is the shared conformance table. Every SDK in the repository ships the same cases;
if you change one, change them all.
"""

import unittest

from theaimart_adx.constants import MAX_RETRY_SECONDS, MIN_REFRESH_SECONDS
from theaimart_adx.schedule import next_delay_seconds


class ScheduleTest(unittest.TestCase):
    def test_refresh_disabled_is_single_shot(self):
        self.assertIsNone(next_delay_seconds(True, 0, None, 0))
        self.assertIsNone(next_delay_seconds(False, 3, None, 0))
        self.assertIsNone(next_delay_seconds(False, 1, 60, -5))

    def test_rendered_ad_refreshes_at_requested_interval_floored_at_30s(self):
        self.assertEqual(60, next_delay_seconds(True, 0, None, 60))
        self.assertEqual(30, next_delay_seconds(True, 0, None, 30))
        self.assertEqual(MIN_REFRESH_SECONDS, next_delay_seconds(True, 0, None, 10))
        self.assertEqual(MIN_REFRESH_SECONDS, next_delay_seconds(True, 0, None, 1))

    def test_failures_back_off_and_cap(self):
        self.assertEqual(30, next_delay_seconds(False, 1, None, 30))
        self.assertEqual(60, next_delay_seconds(False, 2, None, 30))
        self.assertEqual(120, next_delay_seconds(False, 3, None, 30))
        self.assertEqual(240, next_delay_seconds(False, 4, None, 30))
        self.assertEqual(MAX_RETRY_SECONDS, next_delay_seconds(False, 5, None, 30))
        self.assertEqual(MAX_RETRY_SECONDS, next_delay_seconds(False, 99, None, 30))
        # A very long outage must not overflow into a negative or absurd delay.
        self.assertEqual(MAX_RETRY_SECONDS, next_delay_seconds(False, 10**9, None, 30))

    def test_retry_after_pushes_out_never_in(self):
        self.assertEqual(90, next_delay_seconds(False, 1, 90, 30))
        self.assertEqual(MAX_RETRY_SECONDS, next_delay_seconds(False, 5, 10, 30))
        self.assertEqual(30, next_delay_seconds(False, 1, 0, 30))
        self.assertEqual(30, next_delay_seconds(False, 1, None, 30))

    def test_slow_requested_interval_is_honoured_on_failure_too(self):
        self.assertEqual(600, next_delay_seconds(False, 1, None, 600))
        self.assertEqual(600, next_delay_seconds(True, 0, None, 600))

    def test_loop_stays_inside_the_per_key_rate_limit(self):
        floor = next_delay_seconds(True, 0, None, 1)
        assert floor is not None
        self.assertLessEqual(60 / floor, 2)


if __name__ == "__main__":
    unittest.main()
