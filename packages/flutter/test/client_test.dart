import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:theaimart_adx/theaimart_adx.dart';
import 'package:theaimart_adx/src/guard.dart' show resetRequestGuards;

const _internal = {
  'fill': true,
  'imp_id': 'imp123',
  'creative': {
    'asset_url': 'https://cdn/x.png',
    'click_url': 'https://api.adx.theaimart.co/api/v1/serve/click?id=imp123',
    'headline': 'Hi',
    'width': 300,
    'height': 250,
  },
};

void main() {
  setUp(resetRequestGuards);

  test(
      'requestAd builds a decodable, header-correct request and parses the fill',
      () async {
    late http.Request captured;
    final mock = MockClient((req) async {
      captured = req;
      return http.Response(jsonEncode(_internal), 200);
    });
    final adx =
        AdxClient(apiKey: 'pk_test', baseUrl: 'https://h', httpClient: mock);
    final ad = await adx.requestAd(
      const AdRequest(
          slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
          pageUrl: 'https://x/weekend/@broadcast?a=select'),
    );

    expect(ad.filled, isTrue);
    expect(ad.kind, AdKind.image);
    expect(ad.impId, 'imp123');

    // Server-side decode roundtrips the fully-encoded value back to the original.
    expect(captured.url.queryParameters['api_key'], 'pk_test');
    expect(captured.url.queryParameters['slot_id'],
        '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a');
    expect(captured.url.queryParameters['page_url'],
        'https://x/weekend/@broadcast?a=select');

    // Fraud-safe headers.
    expect(
        captured.headers['User-Agent'], startsWith('theaimart-adx-flutter/'));
    expect(captured.headers['X-Adx-Sdk'], startsWith('theaimart-adx-flutter/'));
    expect(captured.headers['User-Agent']!.toLowerCase().contains('okhttp'),
        isFalse);
  });

  test('requestAd fails closed on transport error', () async {
    final mock = MockClient((req) async => throw Exception('down'));
    final adx = AdxClient(apiKey: 'pk_x', httpClient: mock);
    final ad = await adx.requestAd(
        const AdRequest(slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a'));
    expect(ad.filled, isFalse);
    expect(ad.httpStatus, 0);
  });

  test('reportViewable posts the correct body', () async {
    late http.Request captured;
    final mock = MockClient((req) async {
      captured = req;
      return http.Response('{"success":true}', 200);
    });
    final adx =
        AdxClient(apiKey: 'pk_x', baseUrl: 'https://h', httpClient: mock);
    expect(await adx.reportViewable('imp1'), isTrue);
    expect(captured.method, 'POST');
    expect(captured.url.toString(), 'https://h/api/v1/serve/viewable');
    expect(jsonDecode(captured.body), {'imp_id': 'imp1'});
  });

  test('reportViewable no-ops for empty impId', () async {
    var called = false;
    final mock = MockClient((req) async {
      called = true;
      return http.Response('{}', 200);
    });
    final adx = AdxClient(apiKey: 'pk_x', httpClient: mock);
    expect(await adx.reportViewable(''), isFalse);
    expect(called, isFalse);
  });
}
