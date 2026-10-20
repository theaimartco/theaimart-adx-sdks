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

test('percentEncodeAll roundtrips and is hex-only', () => {
  assert.equal(percentEncodeAll('aZ0'), '%61%5A%30');
  assert.equal(decodeURIComponent(percentEncodeAll(NASTY_PAGE_URL)), NASTY_PAGE_URL);
  for (const ch of percentEncodeAll(NASTY_PAGE_URL)) {
    assert.ok('%0123456789ABCDEF'.includes(ch));
  }
});

test('built query is WAF-safe for hostile input, naive is not', () => {
  const q = buildServeQuery([
    ['api_key', 'pk_live'],
    ['page_url', NASTY_PAGE_URL],
    ['page_keywords', 'select,table,cast,end,open'],
  ]);
  assert.deepEqual(
    SQL_INJECTION_KEYWORDS.filter((kw) => q.toLowerCase().includes(kw)),
    [],
  );
  assert.ok(rawQueryIsWafSafe(q));
  assert.equal(new URLSearchParams(q).get('page_url'), NASTY_PAGE_URL);
  assert.equal(rawQueryIsWafSafe(new URLSearchParams({ page_url: NASTY_PAGE_URL }).toString()), false);
});
