// Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:theaimart_adx/src/guard.dart';
import 'package:theaimart_adx/theaimart_adx.dart';

const slot = '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a';

void main() {
  setUp(resetRequestGuards);

  test('only a publishable pk_ key is accepted', () {
    for (final ok in [
      'pk_x',
      'pk_0123456789abcdef0123456789abcdef',
      'pk_virgo_live-1'
    ]) {
      expect(isPublishableKey(ok), isTrue, reason: ok);
    }
    for (final bad in [
      '',
      'pk_',
      'sk_live_abc',
      'eyJhbGciOiJIUzI1NiJ9.e30.x',
      'pk_a b',
      'pk_a\n',
      'PK_x',
      'pk_${'a' * 98}'
    ]) {
      expect(isPublishableKey(bad), isFalse, reason: bad);
    }
  });

  test('base URL must be https, or http only for a local host', () {
    expect(normalizeBaseUrl('https://api.adx.theaimart.co/'),
        'https://api.adx.theaimart.co');
    expect(normalizeBaseUrl('  https://h:8443/prefix// '),
        'https://h:8443/prefix');
    for (final local in [
      'http://localhost:8080',
      'http://127.0.0.1:9',
      'http://10.0.2.2:8080',
      'http://192.168.1.5',
      'http://172.20.0.1',
      'http://[::1]:80',
      'http://dev.localhost',
    ]) {
      expect(normalizeBaseUrl(local), local);
    }
    for (final bad in [
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
      expect(normalizeBaseUrl(bad), isNull, reason: bad);
    }
  });

  test('imp_id and identity cookie must look like what the server issues', () {
    expect(isSafeImpId('1751600000000_550e8400-e29b-41d4-a716-446655440000'),
        isTrue);
    for (final bad in ['', 'a b', 'x"}', 'a\r\nb', 'a' * 129, null]) {
      expect(isSafeImpId(bad), isFalse, reason: '$bad');
    }
    expect(
        isSafeIdentityCookie(
            '550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=='),
        isTrue);
    for (final bad in [
      '',
      'a;b',
      'a b',
      'ok\r\nSet-Cookie: x',
      'a,b',
      'a' * 513
    ]) {
      expect(isSafeIdentityCookie(bad), isFalse, reason: bad);
    }
  });

  test('page_url loses fragment, userinfo, credential params and emails', () {
    const cases = <String, String?>{
      'https://site.com/a/b?q=shoes#access_token=abc':
          'https://site.com/a/b?q=shoes',
      'https://user:pw@site.com/x': 'https://site.com/x',
      'https://site.com/cb?code=abc&state=xyz&page=2':
          'https://site.com/cb?page=2',
      'https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl':
          'https://site.com/?utm_source=nl',
      'https://site.com/?u=alice@example.com&v=bob%40example.com&w=1':
          'https://site.com/?w=1',
      'https://site.com/@handle/post?ref=home':
          'https://site.com/@handle/post?ref=home',
      'https://site.com/x?password=hunter2': 'https://site.com/x',
      'https://site.com/x?&&a=1&&': 'https://site.com/x?a=1',
      'app://screen/home': 'app://screen/home',
      '/settings/profile?email=a@b.c': '/settings/profile',
      '  \u0000https://site.com/\r\n  ': 'https://site.com/',
      'https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm':
          'https://site.com/reset/*/confirm',
      'https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln':
          'https://site.com/m/*',
      'https://site.com/blog/how-to-build-a-rest-api-in-rust-2026':
          'https://site.com/blog/how-to-build-a-rest-api-in-rust-2026',
      'https://site.com/p/550e8400-e29b-41d4-a716-446655440000':
          'https://site.com/p/550e8400-e29b-41d4-a716-446655440000',
      'https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes':
          'https://site.com/?q=shoes',
      'https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3':
          'https://site.com/?page=3',
      'https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1':
          'https://site.com/?q=1',
      'https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high':
          'https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high',
      '#only-a-fragment': null,
      '': null,
    };
    cases.forEach(
        (input, want) => expect(sanitizePageUrl(input), want, reason: input));
    final out = sanitizePageUrl('https://site.com/${'é' * 5000}')!;
    expect(utf8.encode(out).length, lessThanOrEqualTo(maxPageUrlBytes));
    expect(out.startsWith('https://site.com/éé'), isTrue);
  });

  test('looksLikeSecret: opaque credentials yes, words and slugs no', () {
    for (final yes in [
      '9f86d081884c7d659a2feaa0c55ad015',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln',
      'Zx81kQ2mT7vB4nR9sW3yL6pA',
      'sess_4f9a8b7c6d5e4f3a2b1c',
    ]) {
      expect(looksLikeSecret(yes), isTrue, reason: yes);
    }
    for (final no in [
      'how-to-build-a-rest-api-in-rust-2026',
      '550e8400-e29b-41d4-a716-446655440000',
      'nike+air+max+270+review+2026',
      'supercalifragilisticexpialidocious',
      '123456789012345678901234567890',
      'short1a',
      '',
    ]) {
      expect(looksLikeSecret(no), isFalse, reason: no);
    }
  });

  test('truncateUtf8 never splits a character', () {
    const s = 'aé😀b';
    const cases = {1: 'a', 2: 'a', 3: 'aé', 6: 'aé', 7: 'aé😀', 99: 'aé😀b'};
    cases.forEach((n, want) => expect(truncateUtf8(s, n), want, reason: '$n'));
  });

  test('keywords are trimmed, control-free and bounded', () {
    expect(sanitizeKeywords(' a,b\u0007,c '), 'a,b,c');
    expect(sanitizeKeywords('   '), isNull);
    expect(sanitizeKeywords('k' * 5000)!.length, maxKeywordsBytes);
  });

  test('privacy signals are never lost', () {
    expect(sanitizeUsPrivacy('1YYN'), '1YYN');
    expect(sanitizeUsPrivacy(' 1-Y-\n'), '1-Y-');
    expect(sanitizeUsPrivacy('1YY${'x' * 100}')!.substring(0, 3), '1YY');
    expect(sanitizeGppSid('7'), '7');
    expect(sanitizeGppSid('7_8'), '7,8');
    expect(sanitizeGppSid('7;8'), '7,8');
    expect(sanitizeGppSid(' 2 , 7 '), '2,7');
    expect(sanitizeGppSid('abc'), isNull);
    expect(sanitizeGppSid('1,' * 200)!.length, lessThanOrEqualTo(128));
    const tcf = 'CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA';
    expect(sanitizeConsent(' $tcf '), tcf);
    expect(sanitizeConsent('C' * maxConsentBytes), 'C' * maxConsentBytes);
    expect(sanitizeConsent('C' * (maxConsentBytes + 1)), isNull);
  });

  test('a request with no valid slot is never sent', () {
    expect(guardServeParams('pk_x'), isNull);
    expect(guardServeParams('pk_x', slotId: 's1'), isNull);
    expect(guardServeParams('pk_x', slotId: "$slot' or 1=1"), isNull);
    expect(guardServeParams('pk_x', slotName: '  '), isNull);
    expect(guardServeParams('pk_x', slotName: 'n' * 129), isNull);
    final byName =
        Map.fromEntries(guardServeParams('pk_x', slotName: ' home-top ')!);
    expect(byName['slot_name'], 'home-top');
    final p = Map.fromEntries(guardServeParams('pk_x',
        slotId: ' $slot ', slotName: 'ignored', pageUrl: 'https://s.com/#t')!);
    expect(p, {
      'api_key': 'pk_x',
      'slot_id': slot,
      'slot_name': null,
      'page_url': 'https://s.com/',
      'page_keywords': null,
      'us_privacy': null,
      'euconsent_v2': null,
      'gpp': null,
      'gpp_sid': null,
    });
  });

  test('request budget: a burst is capped, then refills at one per second', () {
    final g = RequestGuard();
    const t0 = 1000000;
    for (var i = 0; i < maxRequestsPerMinute; i++) {
      expect(g.acquire(t0), isNull);
    }
    expect(g.acquire(t0), 1);
    expect(g.acquire(t0 + 1000), isNull);
    expect(g.acquire(t0 + 1000), 1);
  });

  test('a 429 opens the breaker for Retry-After, bounded and defaulted', () {
    final g = RequestGuard()..record(429, 30, 0);
    expect(g.acquire(1000), 29);
    expect(g.acquire(30000), isNull);
    expect((RequestGuard()..record(429, null, 0)).acquire(0), 60);
    expect((RequestGuard()..record(429, 86400, 0)).acquire(0), 600);
    expect((RequestGuard()..record(503, 999, 0)).acquire(0), isNull);
  });

  group('client', () {
    MockClient counting(List<http.Request> calls, int status, String body,
            [Map<String, String> headers = const {}]) =>
        MockClient((req) async {
          calls.add(req);
          return http.Response(body, status, headers: headers);
        });

    test('an unsafe config disables the client without a request', () async {
      for (final cfg in [
        ['sk_live_secret', defaultBaseUrl],
        ['pk_x', 'http://api.adx.theaimart.co'],
        ['pk_x', 'https://api.adx.theaimart.co@evil.com'],
      ]) {
        final calls = <http.Request>[];
        // The constructor asserts in debug builds; release builds disable instead of crashing.
        AdxClient? c;
        try {
          c = AdxClient(
              apiKey: cfg[0],
              baseUrl: cfg[1],
              httpClient: counting(calls, 200, '{}'));
        } on AssertionError {
          continue;
        }
        final ad = await c.requestAd(const AdRequest(slotId: slot));
        expect(ad.reason, 'invalid_config');
        expect(calls, isEmpty);
      }
    });

    test('an invalid slot_id never reaches the network', () async {
      final calls = <http.Request>[];
      final c =
          AdxClient(apiKey: 'pk_x', httpClient: counting(calls, 200, '{}'));
      final ad = await c.requestAd(const AdRequest(slotId: "s1' OR 1=1"));
      expect(ad.reason, 'invalid_request');
      expect(calls, isEmpty);
    });

    test('a 429 is shared by every client for the key', () async {
      final calls = <http.Request>[];
      final mock =
          counting(calls, 429, '{"fill":false}', {'retry-after': '60'});
      await AdxClient(apiKey: 'pk_x', httpClient: mock)
          .requestAd(const AdRequest(slotId: slot));
      final blocked = await AdxClient(apiKey: 'pk_x', httpClient: mock)
          .requestAd(const AdRequest(slotId: slot));
      expect(calls, hasLength(1));
      expect(blocked.reason, 'rate_limited');
      expect(blocked.retryAfterSeconds, greaterThanOrEqualTo(59));
    });

    test('a request loop is capped on the device', () async {
      final calls = <http.Request>[];
      final c = AdxClient(
          apiKey: 'pk_x', httpClient: counting(calls, 200, '{"fill":false}'));
      for (var i = 0; i < 100; i++) {
        await c.requestAd(const AdRequest(slotId: slot));
      }
      expect(calls, hasLength(60));
    });

    test('redirects are not followed and a forged imp_id is not echoed',
        () async {
      final calls = <http.Request>[];
      final c = AdxClient(
          apiKey: 'pk_x', httpClient: counting(calls, 200, '{"success":true}'));
      expect(await c.reportViewableOutcome('x", "admin": true, "y": "'),
          ViewableOutcome.drop);
      expect(calls, isEmpty);
      await c.requestAd(const AdRequest(slotId: slot));
      expect(calls.single.followRedirects, isFalse);
    });
  });
}
