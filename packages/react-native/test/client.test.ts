import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());

import { AdxClient } from '../src/client.ts';
import { rawQueryIsWafSafe } from '../src/encoding.ts';
import { AdKind } from '../src/models.ts';

const INTERNAL = {
  fill: true,
  imp_id: 'imp123',
  creative: {
    asset_url: 'https://cdn/x.png',
    click_url: 'https://api.adx.theaimart.co/api/v1/serve/click?id=imp123',
    headline: 'Hi',
    width: 300,
    height: 250,
  },
};

function jsonFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('requestAd builds a WAF-safe URL and sends a fraud-safe UA header', async () => {
  const { fetchImpl, calls } = jsonFetch(INTERNAL);
  const client = new AdxClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const ad = await client.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', pageUrl: 'https://x/weekend/broadcast?a=select@b' });
  assert.equal(ad.filled, true);
  assert.equal(ad.kind, AdKind.Image);
  const query = calls[0]!.url.split('?')[1] as string;
  assert.ok(rawQueryIsWafSafe(query));
  const headers = calls[0]!.init?.headers as Record<string, string>;
  assert.match(headers['User-Agent'], /^theaimart-adx-reactnative\//);
  assert.match(headers['X-Adx-Sdk'], /^theaimart-adx-reactnative\//);
  for (const bad of ['okhttp', 'httpclient', 'bot']) {
    assert.ok(!headers['User-Agent'].toLowerCase().includes(bad));
  }
});

test('per-request userAgent override wins', async () => {
  const { fetchImpl, calls } = jsonFetch(INTERNAL);
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  await client.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', userAgent: 'theaimart-adx-reactnative/1.0.0 (Android 14)' });
  const headers = calls[0]!.init?.headers as Record<string, string>;
  assert.equal(headers['User-Agent'], 'theaimart-adx-reactnative/1.0.0 (Android 14)');
});

test('requestAd fails closed on error', async () => {
  const fetchImpl = (async () => {
    throw new Error('net');
  }) as unknown as typeof fetch;
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  const ad = await client.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
  assert.equal(ad.httpStatus, 0);
});

test('reportViewable posts the correct body', async () => {
  const { fetchImpl, calls } = jsonFetch({ success: true });
  const client = new AdxClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  assert.equal(await client.reportViewable('imp1'), true);
  assert.equal(calls[0]!.url, 'https://h/api/v1/serve/viewable');
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { imp_id: 'imp1' });
});

test('reportViewable no-ops on empty impId', async () => {
  const { fetchImpl, calls } = jsonFetch({ success: true });
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  assert.equal(await client.reportViewable(''), false);
  assert.equal(calls.length, 0);
});

test('an oversized body is a no-fill and redirects are refused', async () => {
  const big = { ...INTERNAL, pad: 'x'.repeat(600 * 1024) };
  const { fetchImpl, calls } = jsonFetch(big);
  const client = new AdxClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl });
  const ad = await client.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
  assert.equal(ad.filled, false);
  assert.equal(calls[0]!.init?.redirect, 'error');
});
