"""Exception hierarchy for the theaimart adx SDK."""

from __future__ import annotations


class AdxError(Exception):
    """Base class for all SDK errors."""


class AdxConfigError(AdxError):
    """Raised for programmer mistakes: missing api_key, no slot id/name, etc.

    Distinct from runtime ad failures (no-fill), which never raise — they are
    returned as an un-filled :class:`~theaimart_adx.models.Ad`.
    """


class AdxTransportError(AdxError):
    """Raised by a :class:`~theaimart_adx.transport.Transport` on a network-level
    failure (DNS, connection refused, timeout).

    The high-level client catches this and returns a no-fill result by default so
    that ad serving never crashes the host application (fail-closed). Pass
    ``raise_on_error=True`` to :class:`~theaimart_adx.client.Adx` to surface it.
    """
