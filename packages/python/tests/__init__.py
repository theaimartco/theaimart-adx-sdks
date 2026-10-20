"""Test package for theaimart-adx. Ensures src/ is importable for plain unittest runs."""

import os
import sys

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
_SRC = os.path.abspath(_SRC)
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import unittest  # noqa: E402

from theaimart_adx.guard import reset_request_guards  # noqa: E402

# The client-side rate guard (CONTRACT.md §12) is process-wide by design; give every test a fresh
# one so suites that make more than a minute's budget of requests stay independent.
_run = unittest.TestCase.run


def _run_with_fresh_guards(self, result=None):
    reset_request_guards()
    return _run(self, result)


unittest.TestCase.run = _run_with_fresh_guards
