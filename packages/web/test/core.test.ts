import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());

import { AdxWebClient, isSafeHttpUrl } from '../src/core.ts';
import { ViewableOutcome, viewableOutcome } from '../src/viewable.ts';
import { rawQueryIsWafSafe } from '../src/encoding.ts';
import { AdKind } from '../src/models.ts';

const INTERNAL = {
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

function jsonFetch(body: unknown, status = 200): { fetchImpl: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('buildAdUrl produces a WAF-safe, decodable query', () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const url = c.buildAdUrl({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', pageUrl: 'https://x/weekend/@broadcast?a=select' }) as string;
  const query = url.split('?')[1] as string;
  assert.ok(rawQueryIsWafSafe(query));
  assert.equal(new URLSearchParams(query).get('page_url'), 'https://x/weekend/@broadcast?a=select');
});

test('requestAd parses an internal fill', async () => {
  const { fetchImpl, calls } = jsonFetch(INTERNAL);
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const ad = await c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, true);
  assert.equal(ad.kind, AdKind.Image);
  assert.equal(ad.impId, 'imp123');
  assert.match(calls[0]!.url, /^https:\/\/h\/api\/v1\/serve\/ad\?/);
  assert.equal(calls[0]!.init?.credentials, 'include');
});

test('requestAd forwards cancellation to fetch', async () => {
  const { fetchImpl, calls } = jsonFetch(INTERNAL);
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  const controller = new AbortController();
  await c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', signal: controller.signal });
  // The forwarded signal is linked to the caller's (it also carries the client's timeout).
  const forwarded = calls[0]!.init?.signal as AbortSignal;
  assert.ok(forwarded);
  const second = new AbortController();
  const pending = c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', signal: second.signal });
  const linked = calls[1]!.init?.signal as AbortSignal;
  assert.equal(linked.aborted, false);
  second.abort();
  assert.equal(linked.aborted, true);
  await pending;
});

test('requestAd fails closed on network error', async () => {
  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  const ad = await c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
  assert.equal(ad.httpStatus, 0);
});

test('requestAd requires a slot', async () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  await assert.rejects(() => c.requestAd({}));
});

test('reportViewable posts via keepalive fetch and reads the answer', async () => {
  const { fetchImpl, calls } = jsonFetch({ success: true });
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const ok = await c.reportViewable('imp1');
  assert.equal(ok, true);
  assert.equal(calls[0]!.url, 'https://h/api/v1/serve/viewable');
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { imp_id: 'imp1' });
  assert.equal(calls[0]!.init?.keepalive, true);
});

test('reportViewable is false when the beacon beat the impression row', async () => {
  // The regression: sendBeacon could only say "queued", so this answer was never seen.
  const { fetchImpl } = jsonFetch({ success: false, reason: 'impression_not_recorded_yet', retry: true });
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  assert.equal(await c.reportViewable('imp1'), false);
  assert.equal(await c.reportViewableOutcome('imp1'), ViewableOutcome.Retry);
});

test('reportViewableOutcome maps a network error to retry', async () => {
  const fetchImpl = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  assert.equal(await c.reportViewableOutcome('imp1'), ViewableOutcome.Retry);
});

test('viewableOutcome classifies every contract response', () => {
  const cases: Array<[number, unknown, ViewableOutcome]> = [
    [200, { success: true }, ViewableOutcome.Recorded],
    [200, { success: true, duplicate: true }, ViewableOutcome.Recorded],
    [200, { success: false, reason: 'impression_not_recorded_yet', retry: true }, ViewableOutcome.Retry],
    [0, null, ViewableOutcome.Retry],
    [429, { error: 'rate limit' }, ViewableOutcome.Retry],
    [500, null, ViewableOutcome.Retry],
    [400, 'Json deserialize error', ViewableOutcome.Drop],
    [200, { success: false }, ViewableOutcome.Drop],
    [200, null, ViewableOutcome.Drop],
    [200, { success: 'true' }, ViewableOutcome.Drop],
  ];
  for (const [status, body, want] of cases) {
    assert.equal(viewableOutcome(status, body), want, `${status} ${JSON.stringify(body)}`);
  }
});

test('gpp and gpp_sid are sent fully encoded', () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const url = c.buildAdUrl({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', gpp: 'DBABMA~CPXxRfA', gppSid: '7,8' }) as string;
  assert.match(url, /&gpp=%44%42%41%42%4D%41%7E%43%50%58%78%52%66%41(&|$)/);
  assert.match(url, /&gpp_sid=%37%2C%38(&|$)/);
});

test('reportViewable no-ops for empty impId', async () => {
  const { fetchImpl, calls } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', fetchImpl });
  assert.equal(await c.reportViewable(''), false);
  assert.equal(calls.length, 0);
});

test('isSafeHttpUrl allowlist rejects hostile schemes', () => {
  assert.equal(isSafeHttpUrl('https://x.example/a'), true);
  assert.equal(isSafeHttpUrl('http://x.example'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
  assert.equal(isSafeHttpUrl('  JavaScript:alert(1)'), false);
});

test('clickUrl encodes the id', () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  assert.equal(c.clickUrl('imp 1/2'), 'https://h/api/v1/serve/click?id=imp%201%2F2');
});

test('buildAdUrl is null for a request that must not be sent', () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  assert.equal(c.buildAdUrl({ slotId: 'not-a-uuid' }), null);
});

test('page_url from location.href never carries the fragment or a token', async () => {
  const { fetchImpl, calls } = jsonFetch(INTERNAL);
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  await c.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    pageUrl: 'https://pub.example/cb?code=SECRET&page=2#access_token=SECRET',
  });
  const sent = calls[0]?.url ?? '';
  const pageUrl = new URLSearchParams(sent.split('?')[1]).get('page_url');
  assert.equal(pageUrl, 'https://pub.example/cb?page=2');
});

test('AdxWebClient refuses a non-pk key and a plain-http production URL', () => {
  assert.throws(() => new AdxWebClient({ apiKey: 'sk_live_x' }));
  assert.throws(() => new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'http://api.adx.theaimart.co' }));
});

test('a decision that never answers is abandoned at the timeout', async () => {
  const fetchImpl = ((_u: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl, timeoutMs: 20 });
  const started = Date.now();
  const ad = await c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
  assert.ok(Date.now() - started < 1000);
});

test('the caller signal still cancels, and an oversized body is a no-fill', async () => {
  const ctl = new AbortController();
  ctl.abort();
  let seen: AbortSignal | undefined;
  const hang = ((_u: unknown, init?: RequestInit) => {
    seen = init?.signal ?? undefined;
    return seen?.aborted ? Promise.reject(new Error('aborted')) : new Promise<Response>(() => {});
  }) as unknown as typeof fetch;
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl: hang });
  assert.equal((await c.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', signal: ctl.signal })).filled, false);
  assert.equal(seen?.aborted, true);

  const big = { ...INTERNAL, pad: 'x'.repeat(600 * 1024) };
  const { fetchImpl } = jsonFetch(big);
  const c2 = new AdxWebClient({ apiKey: 'pk_y', baseUrl: 'https://h', fetchImpl });
  assert.equal((await c2.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' })).filled, false);
});

test('vastTagUrl carries the key and a validated slot id', () => {
  const { fetchImpl } = jsonFetch('{}');
  const c = new AdxWebClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const url = c.vastTagUrl(' 6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a ') as string;
  const q = new URLSearchParams(url.split('?')[1]);
  assert.ok(url.startsWith('https://h/api/v1/serve/vast?'));
  assert.equal(q.get('api_key'), 'pk_x');
  assert.equal(q.get('slot_id'), '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a');
  assert.equal(c.vastTagUrl('not-a-uuid&api_key=pk_other'), null);
});
