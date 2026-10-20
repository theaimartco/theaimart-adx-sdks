import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());

import { Adx } from '../src/client.ts';
import { AdxTransportError } from '../src/errors.ts';
import type { HttpResponse, Transport, TransportRequest } from '../src/transport.ts';
import { ViewableOutcome, viewableOutcome } from '../src/viewable.ts';

// CONTRACT.md §5 — one row per response the backend can give.
test('viewableOutcome classifies every contract response', () => {
  const cases: Array<[number, unknown, ViewableOutcome]> = [
    [200, { success: true }, ViewableOutcome.Recorded],
    [200, { success: true, duplicate: true }, ViewableOutcome.Recorded],
    [200, { success: false, reason: 'impression_not_recorded_yet', retry: true }, ViewableOutcome.Retry],
    [0, null, ViewableOutcome.Retry],
    [429, { error: 'rate limit' }, ViewableOutcome.Retry],
    [500, null, ViewableOutcome.Retry],
    [503, 'oops', ViewableOutcome.Retry],
    [400, 'Json deserialize error', ViewableOutcome.Drop],
    [404, null, ViewableOutcome.Drop],
    [200, { success: false }, ViewableOutcome.Drop],
    [200, null, ViewableOutcome.Drop],
    [200, [true], ViewableOutcome.Drop],
    [200, { success: 'true' }, ViewableOutcome.Drop],
  ];
  for (const [status, body, want] of cases) {
    assert.equal(viewableOutcome(status, body), want, `${status} ${JSON.stringify(body)}`);
  }
});

class Fixed implements Transport {
  calls: TransportRequest[] = [];
  private readonly resp: HttpResponse | Error;
  constructor(resp: HttpResponse | Error) {
    this.resp = resp;
  }
  async request(req: TransportRequest): Promise<HttpResponse> {
    this.calls.push(req);
    if (this.resp instanceof Error) throw this.resp;
    return this.resp;
  }
}

const reply = (status: number, body: unknown): HttpResponse => ({
  status,
  body: JSON.stringify(body),
  getHeader: () => null,
});

test('reportViewable is false when the beacon beat the impression row', async () => {
  // The regression: this is a 200, so a status-only check used to call it a success.
  const t = new Fixed(reply(200, { success: false, reason: 'impression_not_recorded_yet', retry: true }));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  assert.equal(await adx.reportViewable('imp1'), false);
  assert.equal(await adx.reportViewableOutcome('imp1'), ViewableOutcome.Retry);
});

test('reportViewable treats a duplicate as recorded', async () => {
  const adx = new Adx({ apiKey: 'pk_x', transport: new Fixed(reply(200, { success: true, duplicate: true })) });
  assert.equal(await adx.reportViewable('imp1'), true);
});

test('reportViewableOutcome maps a transport error to retry and an empty id to drop', async () => {
  const t = new Fixed(new AdxTransportError('ECONNRESET'));
  const adx = new Adx({ apiKey: 'pk_x', transport: t });
  assert.equal(await adx.reportViewableOutcome('imp1'), ViewableOutcome.Retry);
  assert.equal(await adx.reportViewableOutcome(''), ViewableOutcome.Drop);
  assert.equal(t.calls.length, 1);
});

test('gpp and gpp_sid are sent fully encoded', async () => {
  const t = new Fixed(reply(200, { fill: false }));
  const adx = new Adx({ apiKey: 'pk_x', baseUrl: 'https://host', transport: t });
  await adx.requestAd({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', gpp: 'DBABMA~CPXxRfA', gppSid: '7,8' });
  const url = t.calls[0]!.url;
  assert.match(url, /&gpp=%44%42%41%42%4D%41%7E%43%50%58%78%52%66%41(&|$)/);
  assert.match(url, /&gpp_sid=%37%2C%38(&|$)/);
  const q = new URL(url).searchParams;
  assert.equal(q.get('gpp'), 'DBABMA~CPXxRfA');
  assert.equal(q.get('gpp_sid'), '7,8');
});
