"""UI-framework adapters for the theaimart Ad Network SDK.

Each adapter is a thin shell over :class:`theaimart_adx.fill.AdFill`, which owns the whole
CONTRACT.md §9 state machine — refresh/backoff, visibility gating, and the rule that the
viewability beacon is armed only by a creative that actually drew.

Install the extra you need::

    pip install "theaimart-adx[flet]"
    pip install "theaimart-adx[kivy]"
    pip install "theaimart-adx[streamlit]"

Nothing here is imported by ``theaimart_adx`` itself, so the core SDK stays dependency-free.
"""
