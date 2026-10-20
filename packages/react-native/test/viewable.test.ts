import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());

import { AdxClient } from '../src/client.ts';
import { ViewableOutcome, viewableOutcome } from '../src/viewable.ts';

const TOO_EARLY = { success: false, reason: 'impression_not_recorded_yet', retry: true };

/** A fetch whose successive beacon answers follow a script (the last one repeats). */
function scripted(answers: Array<unknown | Error>) {
  const bodies: string[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    const a = answers[Math.min(bodies.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}

const noSleep = (log: number[]) => async (ms: number): Promise<void> => {
  log.push(ms);
};

test('viewableOutcome classifies every contract response', () => {
  const cases: Array<[number, unknown, ViewableOutcome]> = [
    [200, { success: true }, ViewableOutcome.Recorded],
    [200, { success: true, duplicate: true }, ViewableOutcome.Recorded],
    [200, TOO_EARLY, ViewableOutcome.Retry],
    [0, null, ViewableOutcome.Retry],
    [429, null, ViewableOutcome.Retry],
    [502, null, ViewableOutcome.Retry],
    [400, 'bad', ViewableOutcome.Drop],
    [200, { success: false }, ViewableOutcome.Drop],
    [200, null, ViewableOutcome.Drop],
  ];
  for (const [status, body, want] of cases) assert.equal(viewableOutcome(status, body), want);
});

test('reportViewable is false when the beacon beat the impression row', async () => {
  const { fetchImpl } = scripted([TOO_EARLY]);
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  assert.equal(await client.reportViewable('imp1'), false);
});

test('deliverViewable resends a too-early internal beacon on the 1/2/4s schedule', async () => {
  const { fetchImpl, bodies } = scripted([TOO_EARLY, new TypeError('offline'), { success: true }]);
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  const slept: number[] = [];
  const outcome = await client.deliverViewable('imp1', true, noSleep(slept));
  assert.equal(outcome, ViewableOutcome.Recorded);
  assert.equal(bodies.length, 3);
  assert.deepEqual(JSON.parse(bodies[2]!), { imp_id: 'imp1' });
  assert.deepEqual(slept, [1000, 2000]);
});

test('deliverViewable gives up after the schedule', async () => {
  const { fetchImpl, bodies } = scripted([TOO_EARLY]);
  const client = new AdxClient({ apiKey: 'pk_x', fetchImpl });
  const slept: number[] = [];
  assert.equal(await client.deliverViewable('imp1', true, noSleep(slept)), ViewableOutcome.Retry);
  assert.equal(bodies.length, 4);
  assert.deepEqual(slept, [1000, 2000, 4000]);
});

test('deliverViewable never resends an OpenRTB beacon or a permanent failure', async () => {
  const rtb = scripted([TOO_EARLY]);
  await new AdxClient({ apiKey: 'pk_x', fetchImpl: rtb.fetchImpl }).deliverViewable('imp1', false, noSleep([]));
  assert.equal(rtb.bodies.length, 1);

  const bad = scripted([{ success: false }]);
  await new AdxClient({ apiKey: 'pk_x', fetchImpl: bad.fetchImpl }).deliverViewable('imp1', true, noSleep([]));
  assert.equal(bad.bodies.length, 1);
});

test('gpp and gpp_sid are sent fully encoded', () => {
  const client = new AdxClient({ apiKey: 'pk_x', baseUrl: 'https://h', fetchImpl: scripted([{}]).fetchImpl });
  const url = client.buildAdUrl({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', gpp: 'DBABMA~CPXxRfA', gppSid: '7,8' }) as string;
  assert.match(url, /&gpp=%44%42%41%42%4D%41%7E%43%50%58%78%52%66%41(&|$)/);
  assert.match(url, /&gpp_sid=%37%2C%38(&|$)/);
});
