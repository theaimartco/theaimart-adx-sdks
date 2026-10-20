import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { Adx } from '../src/client.ts';
import { rawQueryIsWafSafe } from '../src/encoding.ts';
import { AdxConfigError, AdxTransportError } from '../src/errors.ts';
import { AdKind } from '../src/models.ts';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());
import type { HttpResponse, Transport, TransportRequest } from '../src/transport.ts';

const INTERNAL_BODY = {
  fill: true,
  imp_id: 'imp123',
  identity_id: 'id123',
  auction: { type: 'second_price', clearing_price_paise: 120 },
  creative: {
    asset_url: 'https://cdn/x.png',
    click_url: 'https://api.adx.theaimart.co/api/v1/serve/click?id=imp123',
    headline: 'Hi',
    width: 300,
    height: 250,
  },
};

class FakeTransport implements Transport {
  calls: TransportRequest[] = [];
  private response: HttpResponse | null;
  private error: Error | null;
  constructor(response: HttpResponse | null, error: Error | null = null) {
    this.response = response;
    this.error = error;
  }
  async request(req: TransportRequest): Promise<HttpResponse> {
    this.calls.push(req);
    if (this.error) throw this.error;
    return this.response as HttpResponse;
  }
  get last(): TransportRequest {
    return this.calls[this.calls.length - 1] as TransportRequest;
  }
}

function ok(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse {
  return {
    status,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    getHeader: (name) => headers[name.toLowerCase()] ?? null,
  };
}

test('constructor requires apiKey', () => {
  assert.throws(() => new Adx({ apiKey: '' }), AdxConfigError);
});

test('requestAd builds a GET with a WAF-safe query and parses the ad', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_test_key', baseUrl: 'https://host/', transport: t });
  const ad = await adx.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    pageUrl: 'https://x/weekend/@broadcast?a=select',
  });
  assert.equal(t.last.method, 'GET');
  const [path, query] = t.last.url.split('?');
  assert.equal(path, 'https://host/api/v1/serve/ad');
  assert.ok(rawQueryIsWafSafe(query as string), `not WAF-safe: ${query}`);
  const params = new URLSearchParams(query);
  assert.equal(params.get('api_key'), 'pk_test_key');
  assert.equal(params.get('slot_id'), '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a');
  assert.equal(params.get('page_url'), 'https://x/weekend/@broadcast?a=select');
  assert.equal(ad.filled, true);
  assert.equal(ad.kind, AdKind.Image);
  assert.equal(ad.impId, 'imp123');
});

test('default headers are fraud-safe', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  const h = t.last.headers;
  assert.equal(h['Accept'], 'application/json');
  assert.match(h['User-Agent'] as string, /^theaimart-adx-node\//);
  assert.match(h['X-Adx-Sdk'] as string, /^theaimart-adx-node\//);
  const uaLow = (h['User-Agent'] as string).toLowerCase();
  for (const bad of ['okhttp', 'httpclient', 'go-http-client', 'python-requests', 'bot', 'crawler']) {
    assert.ok(!uaLow.includes(bad), `UA contains bot substring: ${bad}`);
  }
});

test('per-request overrides set UA, XFF, and Cookie', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  await adx.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    userAgent: 'Mozilla/5.0 (iPhone)',
    clientIp: '203.0.113.7',
    identityCookie: 'cookie.val',
  });
  const h = t.last.headers;
  assert.equal(h['User-Agent'], 'Mozilla/5.0 (iPhone)');
  assert.equal(h['X-Forwarded-For'], '203.0.113.7');
  assert.equal(h['Cookie'], '_an_id=cookie.val');
});

test('header injection via clientIp/identityCookie is scrubbed', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  await adx.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    clientIp: '1.2.3.4\r\nX-Injected: evil',
    identityCookie: 'ok\r\nSet-Cookie: pwn',
  });
  const h = t.last.headers;
  assert.ok(!h['X-Forwarded-For']?.includes('\r'));
  assert.ok(!h['X-Forwarded-For']?.includes('\n'));
  assert.ok(!h['Cookie']?.includes('\r'));
  assert.ok(!h['Cookie']?.includes('\n'));
});

test('every control character is scrubbed from headers, spaces are kept', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  // NUL, DEL and a C1 byte alongside the usual CR/LF. NUL in particular used to be compared
  // against a raw NUL embedded in the source, which is invisible in a diff.
  await adx.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    clientIp: '1.2.3.4, 5.6.7.8\u0000\u007f\u0085\r\n',
    identityCookie: 'abc\u0000def',
  });
  const xff = t.last.headers['X-Forwarded-For'] ?? '';
  const cookie = t.last.headers['Cookie'] ?? '';
  for (const ch of ['\u0000', '\u007f', '\u0085', '\r', '\n']) {
    assert.ok(!xff.includes(ch), `X-Forwarded-For still holds ${JSON.stringify(ch)}`);
    assert.ok(!cookie.includes(ch), `Cookie still holds ${JSON.stringify(ch)}`);
  }
  // A space is legal in a header value and must survive.
  assert.equal(xff, '1.2.3.4, 5.6.7.8');
  // A cookie the server could not have issued is not repaired and sent — it is not sent at all.
  assert.equal(cookie, '');
});

test('requestAd requires a slot', async () => {
  const adx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok(INTERNAL_BODY)) });
  await assert.rejects(() => adx.requestAd({}), AdxConfigError);
});

test('transport error fails closed by default', async () => {
  const adx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(null, new AdxTransportError('boom')) });
  const ad = await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
  assert.equal(ad.httpStatus, 0);
});

test('transport error can be raised', async () => {
  const adx = new Adx({
    apiKey: 'pk_x',
    transport: new FakeTransport(null, new AdxTransportError('boom')),
    raiseOnError: true,
  });
  await assert.rejects(() => adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' }), AdxTransportError);
});

test('plaintext error body is no-fill', async () => {
  const adx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok('Query deserialize error', 400)) });
  const ad = await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
});

test('parses Retry-After and Set-Cookie identity', async () => {
  const t = new FakeTransport(
    ok({ fill: false }, 429, { 'retry-after': '60', 'set-cookie': '_an_id=abc; Path=/' }),
  );
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  const ad = await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.retryAfterSeconds, 60);
  assert.equal(ad.setIdentityCookie, 'abc');
});

test('reportViewable posts the correct body', async () => {
  const t = new FakeTransport(ok({ success: true }));
  const adx = new Adx({ apiKey: 'pk_x', baseUrl: 'https://host', transport: t });
  assert.equal(await adx.reportViewable('imp999'), true);
  assert.equal(t.last.method, 'POST');
  assert.equal(t.last.url, 'https://host/api/v1/serve/viewable');
  assert.deepEqual(JSON.parse(t.last.body as string), { imp_id: 'imp999' });
  assert.equal(t.last.headers['Content-Type'], 'application/json');
});

test('reportViewable no-ops for empty impId', async () => {
  const t = new FakeTransport(ok({ success: true }));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  assert.equal(await adx.reportViewable(''), false);
  assert.equal(t.calls.length, 0);
});

test('reportViewable returns false on non-2xx', async () => {
  const adx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok('', 500)) });
  assert.equal(await adx.reportViewable('imp1'), false);
});

test('clickUrl encodes the imp_id', () => {
  const adx = new Adx({ apiKey: 'pk_x', baseUrl: 'https://host' });
  assert.equal(adx.clickUrl('imp 1/2'), 'https://host/api/v1/serve/click?id=imp%201%2F2');
});

test('renderHtml: image, html, and no-fill', async () => {
  const imgAdx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok(INTERNAL_BODY)) });
  const imgAd = await imgAdx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  const imgHtml = Adx.renderHtml(imgAd);
  assert.match(imgHtml, /<a /);
  assert.match(imgHtml, /rel="noopener nofollow sponsored"/);
  assert.match(imgHtml, /src="https:\/\/cdn\/x\.png"/);

  const htmlBody = {
    fill: true,
    source: 'openrtb',
    imp_id: 'i',
    creative: { html: '<b>x</b>', width: 320, height: 50 },
  };
  const htmlAdx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok(htmlBody)) });
  const htmlAd = await htmlAdx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  const out = Adx.renderHtml(htmlAd);
  assert.match(out, /<iframe/);
  assert.match(out, /sandbox=/);
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);

  const nfAdx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok({ fill: false })) });
  const nfAd = await nfAdx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(Adx.renderHtml(nfAd), '');
});

test('renderHtml drops a hostile javascript: click URL', async () => {
  const body = {
    fill: true,
    imp_id: 'i',
    creative: {
      asset_url: 'https://cdn/x.png',
      click_url: 'javascript:alert(document.cookie)',
      headline: 'Hi',
      width: 300,
      height: 250,
    },
  };
  const adx = new Adx({ apiKey: 'pk_x', transport: new FakeTransport(ok(body)) });
  const ad = await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  const html = Adx.renderHtml(ad);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html.toLowerCase(), /javascript:/);
  assert.match(html, /<img/);
});

test('constructor refuses a non-publishable key or an insecure base URL', () => {
  assert.throws(() => new Adx({ apiKey: 'sk_live_secret' }), AdxConfigError);
  assert.throws(() => new Adx({ apiKey: 'eyJhbGciOiJIUzI1NiJ9.e30.sig' }), AdxConfigError);
  assert.throws(() => new Adx({ apiKey: 'pk_x', baseUrl: 'http://api.adx.theaimart.co' }), AdxConfigError);
  assert.throws(() => new Adx({ apiKey: 'pk_x', baseUrl: 'https://api.adx.theaimart.co@evil.com' }), AdxConfigError);
  assert.doesNotThrow(() => new Adx({ apiKey: ' pk_x\n', baseUrl: 'http://localhost:8080' }));
});

test('an invalid slot_id never reaches the network', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  const ad = await adx.requestAd({ slotId: "s1' OR 1=1" });
  assert.equal(ad.filled, false);
  assert.equal(ad.reason, 'invalid_request');
  assert.equal(t.calls.length, 0);
});

test('a 429 stops every later request until Retry-After passes', async () => {
  const t = new FakeTransport(ok({ fill: false, error: 'rate limit exceeded' }, 429, { 'retry-after': '60' }));
  const a = new Adx({ apiKey: 'pk_x', transport: t });
  const b = new Adx({ apiKey: 'pk_x', transport: t });
  await a.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  const blocked = await b.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(t.calls.length, 1, 'the second client shares the breaker');
  assert.equal(blocked.reason, 'rate_limited');
  assert.ok((blocked.retryAfterSeconds ?? 0) >= 59);
});

test('a request loop is capped on the client', async () => {
  const t = new FakeTransport(ok({ fill: false }));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  for (let i = 0; i < 100; i++) await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(t.calls.length, 60);
});

test('a forged imp_id is never echoed to the server', async () => {
  const t = new FakeTransport(ok({ success: true }));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  assert.equal(await adx.reportViewableOutcome('x", "admin": true, "y": "'), 'drop');
  assert.equal(t.calls.length, 0);
});

test('a hostile Set-Cookie value is not handed back for storage', async () => {
  const t = new FakeTransport(ok(INTERNAL_BODY, 200, { 'set-cookie': '_an_id=a b<script>; Path=/' }));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  assert.equal((await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' })).setIdentityCookie, null);
});
