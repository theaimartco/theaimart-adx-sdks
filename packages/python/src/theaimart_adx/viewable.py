"""Viewability-beacon response classification — CONTRACT.md §5."""

from __future__ import annotations

from enum import Enum
from typing import Any, Tuple

__all__ = ["ViewableOutcome", "viewable_outcome", "VIEWABLE_RETRY_DELAYS_SECONDS"]

#: Wait before each resend of a beacon answered ``RETRY``: attempts land at roughly t = 0, 1,
#: 3 and 7 s. The backend flushes impressions every 500 ms by default, so this covers a slow
#: flush several times over without keeping a dead beacon alive.
VIEWABLE_RETRY_DELAYS_SECONDS: Tuple[int, ...] = (1, 2, 4)


class ViewableOutcome(str, Enum):
    """What a ``POST /serve/viewable`` response means for the view it reported."""

    #: The server recorded the view (or already had it — ``duplicate: true``).
    RECORDED = "recorded"
    #: Not counted, but resending is safe: too early, rate-limited, 5xx or no response.
    RETRY = "retry"
    #: Permanent failure (e.g. ``400``); resending would not help.
    DROP = "drop"


def viewable_outcome(status: int, body: Any) -> ViewableOutcome:
    """Classify a viewability-beacon response. ``status`` 0 means no response.

    The backend writes impressions through an async buffer, so a beacon can arrive before the
    row exists. It then answers ``200 {"success": false, "retry": true}`` and releases its dedup
    key — the view was *not* counted. Reading only the status code turns that into a silent
    success, which is how early beacons used to be lost for good.
    """
    if status == 0 or status == 429 or status >= 500:
        return ViewableOutcome.RETRY
    if not 200 <= status < 300:
        return ViewableOutcome.DROP
    if not isinstance(body, dict):
        return ViewableOutcome.DROP
    # ``is True`` on purpose: a JSON string "true" is not a success.
    if body.get("success") is True:
        return ViewableOutcome.RECORDED
    if body.get("retry") is True:
        return ViewableOutcome.RETRY
    return ViewableOutcome.DROP
