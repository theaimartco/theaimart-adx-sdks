import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildServeQuery,
  percentEncodeAll,
  rawQueryIsWafSafe,
  SQL_INJECTION_KEYWORDS,
} from '../src/encoding.ts';

const NASTY_PAGE_URL =
  'https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com' +
  '&sel=select a table; drop-- update union open cast 1=1';

test('percentEncodeAll encodes every byte as uppercase hex', () => {
  assert.equal(percentEncodeAll('aZ0'), '%61%5A%30');
  assert.equal(percentEncodeAll('a@ =é'), '%61%40%20%3D%C3%A9');
});

test('percentEncodeAll roundtrips via decodeURIComponent', () => {
  for (const v of ['', 'hello', NASTY_PAGE_URL, '日本語/тест/😀']) {
    assert.equal(decodeURIComponent(percentEncodeAll(v)), v);
  }
});

test('buildServeQuery skips null/undefined values', () => {
  const q = buildServeQuery([
    ['api_key', 'pk_x'],
    ['slot_id', undefined],
    ['slot_name', null],
    ['page_url', 'x'],
  ]);
  assert.match(q, /(^|&)api_key=/);
  assert.doesNotMatch(q, /slot_id=/);
  assert.doesNotMatch(q, /slot_name=/);
  assert.match(q, /(^|&)page_url=/);
});

test('built query is WAF-safe even for hostile input', () => {
  const q = buildServeQuery([
    ['api_key', 'pk_live_deadbeef'],
    ['slot_id', '11111111-2222-3333-4444-555555555555'],
    ['page_url', NASTY_PAGE_URL],
    ['page_keywords', 'select,table,update,cast,end,open'],
    ['us_privacy', '1YNN'],
    ['euconsent_v2', 'CPccccccPcccccABCENDcastopen=='],
  ]);
  const lowered = q.toLowerCase();
  const offenders = SQL_INJECTION_KEYWORDS.filter((kw) => lowered.includes(kw));
  assert.deepEqual(offenders, []);
  assert.ok(rawQueryIsWafSafe(q));
});

test('roundtrip decode via URLSearchParams matches original', () => {
  const q = buildServeQuery([
    ['api_key', 'pk_appstore_aiappstore_live'],
    ['page_url', NASTY_PAGE_URL],
    ['page_keywords', 'news,sports,finance@home'],
  ]);
  const params = new URLSearchParams(q);
  assert.equal(params.get('api_key'), 'pk_appstore_aiappstore_live');
  assert.equal(params.get('page_url'), NASTY_PAGE_URL);
  assert.equal(params.get('page_keywords'), 'news,sports,finance@home');
});

test('naive urlencoding would be unsafe (proves the danger is real)', () => {
  const naive = new URLSearchParams({ page_url: NASTY_PAGE_URL }).toString();
  assert.equal(rawQueryIsWafSafe(naive), false);
});
