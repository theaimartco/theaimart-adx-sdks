"""Make ``theaimart_adx`` importable from the ``src/`` layout without an install
(so ``pytest`` works straight from a checkout). Also honored implicitly when running
under pytest; for plain ``unittest`` run with ``PYTHONPATH=src``.
"""

import os
import sys

_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
