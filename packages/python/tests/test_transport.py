"""The default transport keeps connections alive — and gives up nothing to do it.

These run the REAL ``UrllibTransport`` against a local HTTP/1.1 server and count TCP
connections, so "reuses the connection" is measured, not assumed.
"""

import json
import os
import threading
import unittest
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from theaimart_adx.errors import AdxTransportError
from theaimart_adx.guard import MAX_RESPONSE_BYTES
from theaimart_adx.transport import UrllibTransport, _ConnectionPool


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        with self.server.lock:  # type: ignore[attr-defined]
            self.server.connections += 1  # type: ignore[attr-defined]

    def _send(self, status, body, headers=()):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        with self.server.lock:  # type: ignore[attr-defined]
            self.server.requests += 1  # type: ignore[attr-defined]
        path = self.path.split("?")[0]
        if path == "/redirect":
            self._send(302, b"", [("Location", "http://evil.invalid/")])
        elif path == "/big":
            self._send(200, b"x" * (MAX_RESPONSE_BYTES + 10))
        elif path == "/cookies":
            self._send(200, b"{}", [("Set-Cookie", "a=1"), ("Set-Cookie", "_an_id=abc.def")])
        elif path == "/drop-after":
            # Answer, then close without announcing it: the client still believes the socket
            # is reusable — exactly what an idle-timeout close by the server looks like.
            self._send(200, b'{"ok":1}')
            self.close_connection = True
        else:
            self._send(200, json.dumps({"path": self.path}).encode())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        self._send(200, body)


class PooledTransportTest(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.lock = threading.Lock()  # type: ignore[attr-defined]
        self.server.connections = 0  # type: ignore[attr-defined]
        self.server.requests = 0  # type: ignore[attr-defined]
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.server.server_address[1]
        self.transport = UrllibTransport(pool=_ConnectionPool())

    def tearDown(self):
        self.transport.close()
        self.server.shutdown()
        self.server.server_close()

    def get(self, path):
        return self.transport.request("GET", self.base + path, {"User-Agent": "t"}, None, 5.0)

    def test_sequential_requests_share_one_connection(self):
        for _ in range(5):
            self.assertEqual(self.get("/ok").status, 200)
        self.assertEqual(self.server.connections, 1)

    def test_query_is_sent_verbatim(self):
        raw = "/api/v1/serve/ad?api_key=pk_x&page_url=%73%65%6C%65%63%74"
        resp = self.get(raw)
        self.assertEqual(json.loads(resp.body)["path"], raw)

    def test_post_body_and_reuse(self):
        resp = self.transport.request("POST", self.base + "/v", {}, b'{"imp_id":"a"}', 5.0)
        self.assertEqual(resp.body, b'{"imp_id":"a"}')
        self.get("/ok")
        self.assertEqual(self.server.connections, 1)

    def test_a_connection_the_server_closed_is_retried_once_on_a_fresh_one(self):
        self.assertEqual(self.get("/drop-after").status, 200)
        resp = self.get("/ok")
        self.assertEqual(resp.status, 200)
        self.assertEqual(self.server.requests, 2)  # the retry did not duplicate the request
        self.assertEqual(self.server.connections, 2)

    def test_redirects_are_never_followed(self):
        resp = self.get("/redirect")
        self.assertEqual(resp.status, 302)
        self.assertEqual(self.server.requests, 1)

    def test_oversized_body_is_an_error_and_the_socket_is_not_reused(self):
        with self.assertRaises(AdxTransportError):
            self.get("/big")
        self.get("/ok")
        self.assertEqual(self.server.connections, 2)

    def test_duplicate_set_cookie_headers_are_kept(self):
        resp = self.get("/cookies")
        self.assertEqual(resp.headers["set-cookie"], "a=1\n_an_id=abc.def")

    def test_connection_refused_is_a_transport_error(self):
        self.server.shutdown()
        self.server.server_close()
        self.transport.close()
        with self.assertRaises(AdxTransportError):
            self.get("/ok")
        # tearDown calls these again; make them harmless.
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()

    def test_a_forked_child_does_not_reuse_the_parents_sockets(self):
        self.get("/ok")
        # The child abandons the inherited socket without closing it (it is the parent's).
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            with mock.patch("os.getpid", return_value=os.getpid() + 1):
                self.get("/ok")
        self.assertEqual(self.server.connections, 2)

    def test_idle_connections_expire(self):
        transport = UrllibTransport(pool=_ConnectionPool(idle_seconds=0.0))
        try:
            for _ in range(2):
                transport.request("GET", self.base + "/ok", {}, None, 5.0)
        finally:
            transport.close()
        self.assertEqual(self.server.connections, 2)

    def test_a_configured_proxy_keeps_using_urllib(self):
        with mock.patch.dict(os.environ, {"http_proxy": "http://proxy.invalid:3128", "no_proxy": ""}):
            transport = UrllibTransport(pool=_ConnectionPool())
            with mock.patch.object(UrllibTransport, "_request_urllib", return_value="via-urllib") as m:
                self.assertEqual(transport.request("GET", self.base + "/ok", {}, None, 5.0), "via-urllib")
                m.assert_called_once()
        self.assertEqual(self.server.connections, 0)

    def test_default_transports_share_one_pool(self):
        self.assertIs(UrllibTransport()._pool, UrllibTransport()._pool)


if __name__ == "__main__":
    unittest.main()
