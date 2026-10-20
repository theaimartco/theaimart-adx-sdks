import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickHighestBid } from '../src/mediation.ts';
import { parseVast } from '../src/vast.ts';
import { recordTopic, topTopics, clearPersona, type PersonaStore } from '../src/persona.ts';
import type { Ad } from '../src/models.ts';

const AD = { filled: true, impId: 'i1', auction: { clearingPricePaise: 150 } } as unknown as Ad;

test('bidding round: taimads wins on price', () => {
  const out = pickHighestBid({ ad: AD, ecpm_paise: 150 }, [
    { network: 'admob', ecpm_paise: 120, render: () => {} },
  ]);
  assert.equal(out.winner, 'taimads');
});

test('bidding round: adapter outbids taimads', () => {
  const out = pickHighestBid({ ad: AD, ecpm_paise: 100 }, [
    { network: 'meta', ecpm_paise: 260, render: () => {} },
    { network: 'admob', ecpm_paise: 210, render: () => {} },
  ]);
  assert.equal(out.winner, 'meta');
});

test('bidding round: nothing bids → null winner (waterfall takes over)', () => {
  assert.equal(pickHighestBid(null, []).winner, null);
});

test('parseVast extracts media, beacons, click and duration', () => {
  const xml = `<?xml version="1.0"?><VAST version="4.0"><Ad id="c1"><InLine>
    <AdTitle><![CDATA[Great Ad]]></AdTitle>
    <Impression><![CDATA[https://x.example/win?imp_id=abc]]></Impression>
    <Creatives><Creative><Linear><Duration>00:00:30</Duration>
      <MediaFiles><MediaFile type="video/mp4"><![CDATA[https://cdn.example/v.mp4]]></MediaFile></MediaFiles>
      <VideoClicks><ClickThrough><![CDATA[https://adv.example/land]]></ClickThrough></VideoClicks>
    </Linear></Creative></Creatives></InLine></Ad></VAST>`;
  const ad = parseVast(xml);
  assert.ok(ad);
  assert.equal(ad.adTitle, 'Great Ad');
  assert.equal(ad.mediaFileUrl, 'https://cdn.example/v.mp4');
  assert.deepEqual(ad.impressionUrls, ['https://x.example/win?imp_id=abc']);
  assert.equal(ad.clickThroughUrl, 'https://adv.example/land');
  assert.equal(ad.durationSeconds, 30);
});

test('parseVast: empty VAST is a clean no-fill', () => {
  assert.equal(parseVast('<?xml version="1.0"?><VAST version="4.0"></VAST>'), null);
});

function memStore(): PersonaStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

test('persona: counts, ranks and wipes locally', () => {
  const store = memStore();
  recordTopic('Cricket', store);
  recordTopic('cricket ', store);
  recordTopic('tech', store);
  assert.deepEqual(topTopics(2, store), ['cricket', 'tech']);
  clearPersona(store);
  assert.deepEqual(topTopics(5, store), []);
});

test('persona: null store (blocked localStorage) is inert', () => {
  recordTopic('x', null);
  assert.deepEqual(topTopics(3, null), []);
});

test('a failing mediation config is cached, deduped and never rejects', async () => {
  const { MediationController } = await import('../src/mediation.ts');
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const m = new MediationController({ apiKey: 'pk_unknown', fetchImpl });
  const configs = await Promise.all([m.getConfig(), m.getConfig(), m.getConfig()]);
  await m.getConfig();
  assert.equal(calls, 1, 'one fetch for concurrent and repeated callers');
  assert.deepEqual(configs[0]?.adapters, []);
});

test('mediation refresh_seconds from the server is clamped', async () => {
  const { MediationController } = await import('../src/mediation.ts');
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(JSON.stringify({ version: 1, refresh_seconds: 0, adapters: [] }), { status: 200 });
  }) as typeof fetch;
  const m = new MediationController({ apiKey: 'pk_x', fetchImpl });
  assert.equal((await m.getConfig()).refresh_seconds, 60);
  await m.getConfig();
  assert.equal(calls, 1, 'refresh_seconds: 0 must not mean refetch every time');
});
