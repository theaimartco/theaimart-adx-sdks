// Outbound request guard (CONTRACT.md §12). The vectors below are shared verbatim by every SDK's
// guard test — change them here and in CONTRACT.md together.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  guardServeParams,
  isPublishableKey,
  isSafeIdentityCookie,
  isSafeImpId,
  looksLikeSecret,
  MAX_CONSENT_BYTES,
  MAX_KEYWORDS_BYTES,
  MAX_PAGE_URL_BYTES,
  MAX_REQUESTS_PER_MINUTE,
  normalizeBaseUrl,
  RequestGuard,
  sanitizeConsent,
  sanitizeGppSid,
  sanitizeKeywords,
  sanitizePageUrl,
  sanitizeUsPrivacy,
  truncateUtf8,
} from '../src/guard.ts';

const SLOT = '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a';

test('only a publishable pk_ key is accepted', () => {
  for (const ok of ['pk_x', 'pk_0123456789abcdef0123456789abcdef', 'pk_virgo_live-1']) {
    assert.ok(isPublishableKey(ok), ok);
  }
  for (const bad of ['', 'pk_', 'sk_live_abc', 'eyJhbGciOiJIUzI1NiJ9.e30.x', 'pk_a b', 'pk_a\n', 'PK_x', 'pk_' + 'a'.repeat(98)]) {
    assert.ok(!isPublishableKey(bad), JSON.stringify(bad));
  }
});

test('base URL must be https, or http only for a local host', () => {
  assert.equal(normalizeBaseUrl('https://api.adx.theaimart.co/'), 'https://api.adx.theaimart.co');
  assert.equal(normalizeBaseUrl('  https://h:8443/prefix// '), 'https://h:8443/prefix');
  for (const local of ['http://localhost:8080', 'http://127.0.0.1:9', 'http://10.0.2.2:8080', 'http://192.168.1.5', 'http://172.20.0.1', 'http://[::1]:80', 'http://dev.localhost']) {
    assert.equal(normalizeBaseUrl(local), local, local);
  }
  for (const bad of [
    'http://api.adx.theaimart.co',
    'http://10.evil.com',
    'http://172.32.0.1',
    'https://user:pw@api.adx.theaimart.co',
    'https://api.adx.theaimart.co@evil.com',
    'https://h/?x=1',
    'https://h/#f',
    'https://h\\@evil.com',
    'https://h /x',
    'ftp://h',
    'javascript:alert(1)',
    'https://',
  ]) {
    assert.equal(normalizeBaseUrl(bad), null, bad);
  }
});

test('imp_id and identity cookie must look like what the server issues', () => {
  assert.ok(isSafeImpId('1751600000000_550e8400-e29b-41d4-a716-446655440000'));
  for (const bad of ['', 'a b', 'x"}', 'a\r\nb', 'a'.repeat(129), null, undefined]) {
    assert.ok(!isSafeImpId(bad as string), JSON.stringify(bad));
  }
  assert.ok(isSafeIdentityCookie('550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=='));
  for (const bad of ['', 'a;b', 'a b', 'ok\r\nSet-Cookie: x', 'a,b', 'a'.repeat(513)]) {
    assert.ok(!isSafeIdentityCookie(bad), JSON.stringify(bad));
  }
});

test('page_url loses fragment, userinfo, credential params and emails', () => {
  const cases: Array<[string, string | null]> = [
    ['https://site.com/a/b?q=shoes#access_token=abc', 'https://site.com/a/b?q=shoes'],
    ['https://user:pw@site.com/x', 'https://site.com/x'],
    ['https://site.com/cb?code=abc&state=xyz&page=2', 'https://site.com/cb?page=2'],
    ['https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl', 'https://site.com/?utm_source=nl'],
    ['https://site.com/?u=alice@example.com&v=bob%40example.com&w=1', 'https://site.com/?w=1'],
    ['https://site.com/@handle/post?ref=home', 'https://site.com/@handle/post?ref=home'],
    ['https://site.com/x?password=hunter2', 'https://site.com/x'],
    ['https://site.com/x?&&a=1&&', 'https://site.com/x?a=1'],
    ['app://screen/home', 'app://screen/home'],
    ['/settings/profile?email=a@b.c', '/settings/profile'],
    ['  \u0000https://site.com/\r\n  ', 'https://site.com/'],
    ['https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm', 'https://site.com/reset/*/confirm'],
    ['https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln', 'https://site.com/m/*'],
    ['https://site.com/blog/how-to-build-a-rest-api-in-rust-2026', 'https://site.com/blog/how-to-build-a-rest-api-in-rust-2026'],
    ['https://site.com/p/550e8400-e29b-41d4-a716-446655440000', 'https://site.com/p/550e8400-e29b-41d4-a716-446655440000'],
    ['https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes', 'https://site.com/?q=shoes'],
    ['https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3', 'https://site.com/?page=3'],
    ['https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1', 'https://site.com/?q=1'],
    ['https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high', 'https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high'],
    ['#only-a-fragment', null],
    ['', null],
  ];
  for (const [input, want] of cases) {
    assert.equal(sanitizePageUrl(input), want, JSON.stringify(input));
  }
  const long = 'https://site.com/' + 'é'.repeat(5000);
  const out = sanitizePageUrl(long) as string;
  assert.ok(new TextEncoder().encode(out).length <= MAX_PAGE_URL_BYTES);
  assert.ok(out.startsWith('https://site.com/éé'));
});

test('looksLikeSecret: opaque credentials yes, words and slugs no', () => {
  for (const yes of [
    '9f86d081884c7d659a2feaa0c55ad015',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln',
    'Zx81kQ2mT7vB4nR9sW3yL6pA',
    'sess_4f9a8b7c6d5e4f3a2b1c',
  ]) {
    assert.ok(looksLikeSecret(yes), yes);
  }
  for (const no of [
    'how-to-build-a-rest-api-in-rust-2026',
    '550e8400-e29b-41d4-a716-446655440000',
    'nike+air+max+270+review+2026',
    'supercalifragilisticexpialidocious',
    '123456789012345678901234567890',
    'short1a',
    '',
  ]) {
    assert.ok(!looksLikeSecret(no), no);
  }
});

test('truncateUtf8 never splits a character', () => {
  assert.equal(truncateUtf8('aé😀b', 1), 'a');
  assert.equal(truncateUtf8('aé😀b', 2), 'a');
  assert.equal(truncateUtf8('aé😀b', 3), 'aé');
  assert.equal(truncateUtf8('aé😀b', 6), 'aé');
  assert.equal(truncateUtf8('aé😀b', 7), 'aé😀');
  assert.equal(truncateUtf8('aé😀b', 99), 'aé😀b');
});

test('keywords are trimmed, control-free and bounded', () => {
  assert.equal(sanitizeKeywords(' a,b\u0007,c '), 'a,b,c');
  assert.equal(sanitizeKeywords('   '), null);
  assert.equal(sanitizeKeywords('k'.repeat(5000))?.length, MAX_KEYWORDS_BYTES);
});

test('privacy signals are never lost', () => {
  assert.equal(sanitizeUsPrivacy('1YYN'), '1YYN');
  assert.equal(sanitizeUsPrivacy(' 1-Y-\n'), '1-Y-');
  assert.equal(sanitizeUsPrivacy('1YY' + 'x'.repeat(100))?.slice(0, 3), '1YY');
  assert.equal(sanitizeGppSid('7'), '7');
  assert.equal(sanitizeGppSid('7_8'), '7,8');
  assert.equal(sanitizeGppSid('7;8'), '7,8');
  assert.equal(sanitizeGppSid(' 2 , 7 '), '2,7');
  assert.equal(sanitizeGppSid('abc'), null);
  assert.ok((sanitizeGppSid('1,'.repeat(200)) as string).length <= 128);
  assert.equal(sanitizeConsent(' CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA '), 'CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA');
  assert.equal(sanitizeConsent('C'.repeat(MAX_CONSENT_BYTES)), 'C'.repeat(MAX_CONSENT_BYTES));
  assert.equal(sanitizeConsent('C'.repeat(MAX_CONSENT_BYTES + 1)), null);
});

test('a request with no valid slot is never sent', () => {
  assert.equal(guardServeParams('pk_x', {}), null);
  assert.equal(guardServeParams('pk_x', { slotId: 's1' }), null);
  assert.equal(guardServeParams('pk_x', { slotId: SLOT + "' or 1=1" }), null);
  assert.equal(guardServeParams('pk_x', { slotName: '  ' }), null);
  assert.equal(guardServeParams('pk_x', { slotName: 'n'.repeat(129) }), null);
  const byName = guardServeParams('pk_x', { slotName: ' home-top ' });
  assert.deepEqual(byName?.find(([k]) => k === 'slot_name'), ['slot_name', 'home-top']);
  const p = guardServeParams('pk_x', { slotId: ` ${SLOT} `, slotName: 'ignored', pageUrl: 'https://s.com/#t' });
  assert.deepEqual(Object.fromEntries(p ?? []), {
    api_key: 'pk_x',
    slot_id: SLOT,
    slot_name: null,
    page_url: 'https://s.com/',
    page_keywords: null,
    us_privacy: null,
    euconsent_v2: null,
    gpp: null,
    gpp_sid: null,
  });
});

test('request budget: a burst is capped, then refills at one per second', () => {
  const g = new RequestGuard();
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) assert.equal(g.acquire(t0), null);
  assert.equal(g.acquire(t0), 1);
  assert.equal(g.acquire(t0 + 1000), null);
  assert.equal(g.acquire(t0 + 1000), 1);
});

test('a 429 opens the breaker for Retry-After, bounded and defaulted', () => {
  const g = new RequestGuard();
  g.record(429, 30, 0);
  assert.equal(g.acquire(1000), 29);
  assert.equal(g.acquire(30_000), null);

  const d = new RequestGuard();
  d.record(429, null, 0);
  assert.equal(d.acquire(0), 60);

  const capped = new RequestGuard();
  capped.record(429, 86_400, 0);
  assert.equal(capped.acquire(0), 600);

  const other = new RequestGuard();
  other.record(503, 999, 0);
  assert.equal(other.acquire(0), null);
});
