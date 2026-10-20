import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { Adx } from '../src/client.ts';
import { SQL_INJECTION_KEYWORDS } from '../src/encoding.ts';
import { AdKind } from '../src/models.ts';

const NASTY_PAGE_URL =
  'https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com' +
  '&sel=select a table; drop-- update union open cast 1=1';

const INTERNAL_BODY = {
  fill: true,
  imp_id: 'imp-e2e-1',
  identity_id: 'id-e2e',
  auction: { type: 'second_price', clearing_price_paise: 120 },
  creative: {
    asset_url: 'https://cdn/x.png',
    click_url: 'https://api.adx.theaimart.co/api/v1/serve/click?id=imp-e2e-1',
    headline: 'Hello',
    width: 300,
    height: 250,
  },
};

const capturedPageUrls: (string | null)[] = [];
const capturedViewables: unknown[] = [];
let server: Server;
let baseUrl: string;

function wafBlocks(rawQuery: string): boolean {
  const lowered = rawQuery.toLowerCase();
  return SQL_INJECTION_KEYWORDS.some((kw) => lowered.includes(kw));
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

before(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const [path, rawQuery = ''] = (req.url ?? '').split('?');
    // Faithful reproduction of the backend WAF: inspect the RAW query string.
    if (req.method === 'GET' && wafBlocks(rawQuery)) {
      sendJson(res, 403, { error: 'Request blocked due to security policy' });
      return;
    }
    if (req.method === 'GET' && path === '/api/v1/serve/ad') {
      const params = new URLSearchParams(rawQuery);
      capturedPageUrls.push(params.get('page_url'));
      sendJson(res, 200, INTERNAL_BODY, { 'Set-Cookie': '_an_id=e2ecookie; Path=/; HttpOnly' });
      return;
    }
    if (req.method === 'POST' && path === '/api/v1/serve/viewable') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          capturedViewables.push(JSON.parse(raw));
        } catch {
          /* ignore */
        }
        sendJson(res, 200, { success: true });
      });
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('hostile pageUrl is not blocked and roundtrips on the server', async () => {
  const adx = new Adx({ apiKey: 'pk_e2e', baseUrl });
  const ad = await adx.requestAd({
    slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
    pageUrl: NASTY_PAGE_URL,
    pageKeywords: 'select,table,cast',
  });
  assert.equal(ad.filled, true, `expected fill, got status ${ad.httpStatus}`);
  assert.equal(ad.kind, AdKind.Image);
  assert.equal(ad.impId, 'imp-e2e-1');
  assert.equal(ad.setIdentityCookie, 'e2ecookie');
  // §12: the email in `u=` never reaches the server; everything else roundtrips intact.
  assert.equal(capturedPageUrls.at(-1), NASTY_PAGE_URL.replace('&u=alice@example.com', ''));
});

test('a naive raw request IS blocked by the mock WAF (danger is real)', async () => {
  const raw = new URLSearchParams({ api_key: 'pk_e2e', slot_id: 's1', page_url: NASTY_PAGE_URL }).toString();
  const resp = await fetch(`${baseUrl}/api/v1/serve/ad?${raw}`);
  assert.equal(resp.status, 403);
  await resp.text();
});

test('viewability beacon is delivered', async () => {
  const adx = new Adx({ apiKey: 'pk_e2e', baseUrl });
  assert.equal(await adx.reportViewable('imp-e2e-1'), true);
  assert.deepEqual(capturedViewables.at(-1), { imp_id: 'imp-e2e-1' });
});
