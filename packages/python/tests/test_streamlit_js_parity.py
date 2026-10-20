"""The Streamlit component ships its own JavaScript copy of the §9a policy, because the browser
runs it. This test executes that JavaScript with Node and asserts it agrees with the Python
implementation on the full shared conformance table — so the two can never drift apart silently.

Skipped when Node is unavailable.
"""

import json
import re
import shutil
import subprocess
import unittest

from theaimart_adx.constants import MAX_RETRY_SECONDS, MIN_REFRESH_SECONDS
from theaimart_adx.integrations.streamlit import banner_html
from theaimart_adx.schedule import next_delay_seconds
from theaimart_adx.viewable import viewable_outcome

NODE = shutil.which("node")

# (rendered, consecutive_failures, retry_after, refresh_seconds)
CASES = [
    (True, 0, None, 0),
    (False, 3, None, 0),
    (False, 1, 60, -5),
    (True, 0, None, 60),
    (True, 0, None, 30),
    (True, 0, None, 10),
    (True, 0, None, 1),
    (False, 1, None, 30),
    (False, 2, None, 30),
    (False, 3, None, 30),
    (False, 4, None, 30),
    (False, 5, None, 30),
    (False, 99, None, 30),
    (False, 10**9, None, 30),
    (False, 1, 90, 30),
    (False, 5, 10, 30),
    (False, 1, 0, 30),
    (False, 1, None, 600),
    (True, 0, None, 600),
]


# (status, body) — every beacon response in CONTRACT.md §5, plus the traps.
VIEWABLE_CASES = [
    (200, {"success": True}),
    (200, {"success": True, "duplicate": True}),
    (200, {"success": False, "reason": "impression_not_recorded_yet", "retry": True}),
    (0, None),
    (429, {"error": "rate limit"}),
    (500, None),
    (503, "oops"),
    (400, "Json deserialize error"),
    (404, None),
    (200, {"success": False}),
    (200, None),
    (200, [True]),
    (200, {"success": "true"}),
]


def _extract_function(html: str, name: str) -> str:
    match = re.search(r"function %s\(.*?\n  \}" % name, html, re.S)
    if match is None:  # pragma: no cover - guards a template rewrite
        raise AssertionError("%s() not found in the Streamlit component" % name)
    return match.group(0)


def _extract_next_delay(html: str) -> str:
    return _extract_function(html, "nextDelay")


@unittest.skipUnless(NODE, "node is not installed")
class StreamlitJsParityTest(unittest.TestCase):
    def test_js_policy_matches_python_exactly(self):
        source = _extract_next_delay(banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"))
        script = (
            "var MIN_REFRESH = %d, MAX_RETRY = %d;\n%s\n"
            "var cases = JSON.parse(process.argv[1]);\n"
            "console.log(JSON.stringify(cases.map(function (c) {\n"
            "  return nextDelay(c[0], c[1], c[2] === null ? 0 : c[2], c[3]);\n"
            "})));\n" % (MIN_REFRESH_SECONDS, MAX_RETRY_SECONDS, source)
        )
        result = subprocess.run(
            [NODE, "-e", script, json.dumps(CASES)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        js_answers = json.loads(result.stdout)
        py_answers = [next_delay_seconds(*case) for case in CASES]
        self.assertEqual(py_answers, js_answers)

    def test_js_beacon_outcome_matches_python_exactly(self):
        source = _extract_function(banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"), "viewOutcome")
        script = (
            "%s\n"
            "var cases = JSON.parse(process.argv[1]);\n"
            "console.log(JSON.stringify(cases.map(function (c) {\n"
            "  return viewOutcome(c[0], c[1]);\n"
            "})));\n" % source
        )
        result = subprocess.run(
            [NODE, "-e", script, json.dumps(VIEWABLE_CASES)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        py_answers = [viewable_outcome(*case).value for case in VIEWABLE_CASES]
        self.assertEqual(py_answers, json.loads(result.stdout))
        self.assertEqual({"recorded", "retry", "drop"}, set(py_answers))

    def test_the_whole_component_script_parses(self):
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a", gpp="DBA", gpp_sid="7")
        scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
        self.assertEqual(1, len(scripts))
        result = subprocess.run(
            [NODE, "-e", "new Function(process.argv[1]);", scripts[0]],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(0, result.returncode, result.stderr)

    def _run_beacon(self, answers, retryable):
        """Drive the real sendViewable() with scripted responses and an instant clock."""
        html = banner_html(api_key="pk_x", slot_id="6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a")
        source = "\n".join(
            _extract_function(html, name) for name in ("viewOutcome", "sendViewable")
        )
        script = (
            "var CFG = {baseUrl: 'https://h'}, VIEW_RETRY_S = [1, 2, 4];\n"
            "var answers = JSON.parse(process.argv[1]), sent = [], delays = [];\n"
            "var navigator = {};\n"
            "function setTimeout(fn, ms) { delays.push(ms); fn(); }\n"
            "function fetch(url, init) {\n"
            "  sent.push([url, JSON.parse(init.body).imp_id, init.keepalive]);\n"
            "  var a = answers[Math.min(sent.length - 1, answers.length - 1)];\n"
            "  if (a === null) return Promise.reject(new TypeError('network'));\n"
            "  return Promise.resolve({status: a[0], text: function () {\n"
            "    return Promise.resolve(JSON.stringify(a[1])); }});\n"
            "}\n"
            "%s\n"
            "sendViewable('imp-1', %s, 0);\n"
            "setImmediate(function again(n) {\n"
            "  if (n < 50) return setImmediate(again, n + 1);\n"
            "  console.log(JSON.stringify({sent: sent, delays: delays}));\n"
            "}, 0);\n" % (source, "true" if retryable else "false")
        )
        result = subprocess.run(
            [NODE, "-e", script, json.dumps(answers)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        return json.loads(result.stdout)

    def test_js_resends_a_too_early_beacon_until_recorded(self):
        early = [200, {"success": False, "retry": True}]
        out = self._run_beacon([early, None, [200, {"success": True}]], retryable=True)
        self.assertEqual(3, len(out["sent"]))
        self.assertEqual(["https://h/api/v1/serve/viewable", "imp-1", True], out["sent"][0])
        self.assertEqual([1000, 2000], out["delays"])

    def test_js_gives_up_after_the_schedule(self):
        out = self._run_beacon([[200, {"success": False, "retry": True}]], retryable=True)
        self.assertEqual(4, len(out["sent"]))
        self.assertEqual([1000, 2000, 4000], out["delays"])

    def test_js_never_resends_openrtb_or_a_drop(self):
        early = [[200, {"success": False, "retry": True}]]
        self.assertEqual(1, len(self._run_beacon(early, retryable=False)["sent"]))
        self.assertEqual(1, len(self._run_beacon([[400, "bad"]], retryable=True)["sent"]))

    def test_the_table_actually_exercises_the_interesting_paths(self):
        answers = [next_delay_seconds(*case) for case in CASES]
        self.assertIn(None, answers, "single-shot")
        self.assertIn(MIN_REFRESH_SECONDS, answers, "the floor")
        self.assertIn(MAX_RETRY_SECONDS, answers, "the cap")
        self.assertIn(90, answers, "Retry-After winning")


if __name__ == "__main__":
    unittest.main()
