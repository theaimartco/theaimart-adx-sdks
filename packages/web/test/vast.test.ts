import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { MAX_RESPONSE_BYTES } from '../src/guard.ts';
import { parseVast, pickMediaFile, playVastAd } from '../src/vast.ts';

const doc = (media: string, imp: string, click: string, extra = '') => `<?xml version="1.0"?>
<VAST version="4.0"><Ad id="c1"><InLine><AdTitle><![CDATA[Ad]]></AdTitle>
<Impression id="taimads">${imp}</Impression>
<Creatives><Creative><Linear><Duration>00:00:15</Duration><MediaFiles>
${extra}<MediaFile delivery="progressive" type="video/mp4" width="1280" height="720">${media}</MediaFile>
</MediaFiles><VideoClicks><ClickThrough>${click}</ClickThrough></VideoClicks></Linear></Creative></Creatives>
</InLine></Ad></VAST>`;

const SAFE = doc(
  '<![CDATA[https://cdn.example/v.mp4]]>',
  '<![CDATA[https://api.adx.theaimart.co/api/v1/rtb/win?imp_id=1_a]]>',
  '<![CDATA[https://api.adx.theaimart.co/api/v1/serve/click?id=1_a]]>',
);

test('advertiser URLs that are not http(s) never leave the parser', () => {
  const ad = parseVast(doc('<![CDATA[javascript:alert(1)]]>', '<![CDATA[data:image/gif,x]]>', '<![CDATA[blob:x]]>'));
  assert.ok(ad);
  assert.equal(ad.mediaFileUrl, null);
  assert.deepEqual(ad.mediaFiles, []);
  assert.deepEqual(ad.impressionUrls, []);
  assert.equal(ad.clickThroughUrl, null);
});

test('entity-encoded text nodes decode like an XML parser would', () => {
  const ad = parseVast(doc('https://cdn.example/v.mp4?a=1&amp;b=2', 'https://x.example/p?i=1&amp;j=&#50;', 'https://adv.example/?q=a&#x26;b'));
  assert.ok(ad);
  assert.equal(ad.mediaFileUrl, 'https://cdn.example/v.mp4?a=1&b=2');
  assert.deepEqual(ad.impressionUrls, ['https://x.example/p?i=1&j=2']);
  assert.equal(ad.clickThroughUrl, 'https://adv.example/?q=a&b');
});

test('media files keep their type and the playable one is chosen', () => {
  const ad = parseVast(doc('<![CDATA[https://cdn.example/v.mp4]]>', '', '',
    '<MediaFile type="video/x-flv"><![CDATA[https://cdn.example/v.flv]]></MediaFile>'));
  assert.ok(ad);
  assert.deepEqual(ad.mediaFiles.map((f) => f.type), ['video/x-flv', 'video/mp4']);
  const mp4Only = (t: string) => (t === 'video/mp4' ? 'probably' : '');
  assert.equal(pickMediaFile(ad.mediaFiles, mp4Only)?.url, 'https://cdn.example/v.mp4');
  assert.equal(pickMediaFile(ad.mediaFiles, () => '')?.url, 'https://cdn.example/v.flv');
  assert.equal(pickMediaFile([], mp4Only), null);
});

// --- playVastAd, against a fake <video> ------------------------------------------------------

type Listener = () => void;
function fakeVideo() {
  const listeners: Record<string, Listener[]> = {};
  return {
    src: '',
    style: { cursor: '' },
    canPlayType: (t: string) => (t === 'video/mp4' ? 'maybe' : ''),
    addEventListener(type: string, fn: Listener, opts?: { signal?: AbortSignal }) {
      (listeners[type] ??= []).push(fn);
      opts?.signal?.addEventListener('abort', () => {
        listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
      });
    },
    fire(type: string) {
      for (const fn of listeners[type] ?? []) fn();
    },
    count(type: string) {
      return (listeners[type] ?? []).length;
    },
  };
}

const g = globalThis as unknown as Record<string, unknown>;
const saved = { fetch: g.fetch, Image: g.Image, window: g.window };
let pixels: string[] = [];
let opened: string[] = [];
function install(body: string | (() => Promise<Response>)) {
  pixels = [];
  opened = [];
  g.fetch = typeof body === 'string' ? async () => new Response(body, { status: 200 }) : body;
  g.Image = class {
    set src(u: string) {
      pixels.push(u);
    }
  };
  g.window = { open: (u: string) => void opened.push(u) };
}
afterEach(() => Object.assign(g, saved));

test('the clickthrough only opens after the impression fired', async () => {
  install(SAFE);
  const video = fakeVideo();
  const ad = await playVastAd(video as unknown as HTMLVideoElement, 'https://api.adx.theaimart.co/api/v1/serve/vast?slot_id=x');
  assert.ok(ad);
  assert.equal(video.src, 'https://cdn.example/v.mp4');

  video.fire('click'); // a click before playback belongs to the player
  assert.deepEqual(opened, []);

  video.fire('playing');
  video.fire('playing');
  assert.deepEqual(pixels, ['https://api.adx.theaimart.co/api/v1/rtb/win?imp_id=1_a']); // once

  video.fire('click');
  assert.deepEqual(opened, ['https://api.adx.theaimart.co/api/v1/serve/click?id=1_a']);
});

test('a hostile media URL is never assigned to the video', async () => {
  install(doc('<![CDATA[javascript:alert(1)]]>', '', ''));
  const video = fakeVideo();
  assert.equal(await playVastAd(video as unknown as HTMLVideoElement, 'https://h/vast'), null);
  assert.equal(video.src, '');
});

test('unsafe tag URLs, oversized bodies and hung requests are no-fills', async () => {
  install(SAFE);
  const video = fakeVideo() as unknown as HTMLVideoElement;
  assert.equal(await playVastAd(video, 'javascript:alert(1)'), null);

  install('x'.repeat(MAX_RESPONSE_BYTES + 1));
  assert.equal(await playVastAd(video, 'https://h/vast'), null);

  install((_u?: unknown, init?: { signal?: AbortSignal }) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const started = Date.now();
  assert.equal(await playVastAd(video, 'https://h/vast', { timeoutMs: 20 }), null);
  assert.ok(Date.now() - started < 1000);
});

test('aborting the signal removes every listener it added', async () => {
  install(SAFE);
  const video = fakeVideo();
  const ctl = new AbortController();
  assert.ok(await playVastAd(video as unknown as HTMLVideoElement, 'https://h/vast', { signal: ctl.signal }));
  assert.equal(video.count('playing'), 1);
  assert.equal(video.count('click'), 1);
  ctl.abort();
  assert.equal(video.count('playing'), 0);
  assert.equal(video.count('click'), 0);
});
