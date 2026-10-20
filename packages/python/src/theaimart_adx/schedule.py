"""Continuous-fill scheduling policy — CONTRACT.md §9a.

Pure and platform-independent: every SDK in this repository implements this exact function so one
slot behaves identically on every platform. The conformance table in ``tests/test_schedule.py`` is
shared across packages — if you change one, change them all.
"""

from __future__ import annotations

from typing import Optional

from .constants import MAX_RETRY_SECONDS, MIN_REFRESH_SECONDS

__all__ = ["next_delay_seconds"]

# Ceiling on the doubling exponent so the backoff can never overflow a fixed-width int in the
# other SDKs. Python has bignums, but the table must match them exactly.
_MAX_BACKOFF_EXPONENT = 16


def next_delay_seconds(
    rendered: bool,
    consecutive_failures: int,
    retry_after_seconds: Optional[int],
    refresh_seconds: int,
) -> Optional[int]:
    """Seconds to wait before the next ad request, or ``None`` to stop (single shot).

    :param rendered: The cycle just finished actually attached a visible creative (§9c).
    :param consecutive_failures: Consecutive non-rendered cycles *including* the one just finished.
    :param retry_after_seconds: ``Retry-After`` from the last response, if any (§8).
    :param refresh_seconds: Integrator's requested interval; ``<= 0`` disables continuous fill.
    """
    if refresh_seconds <= 0:
        return None
    if rendered:
        return max(refresh_seconds, MIN_REFRESH_SECONDS)

    failures = max(1, int(consecutive_failures))
    exponent = min(failures - 1, _MAX_BACKOFF_EXPONENT)
    backoff = min(MIN_REFRESH_SECONDS * (2**exponent), MAX_RETRY_SECONDS)
    # Retry-After can only push the delay out, never pull it in (§8).
    retry_after = retry_after_seconds if retry_after_seconds and retry_after_seconds > 0 else 0
    return int(max(backoff, retry_after, refresh_seconds))
