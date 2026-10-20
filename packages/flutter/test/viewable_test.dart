import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:theaimart_adx/src/viewable.dart'
    show deliverWithRetry, isStorableIdentity;
import 'package:theaimart_adx/theaimart_adx.dart';
import 'package:theaimart_adx/src/guard.dart' show resetRequestGuards;

/// CONTRACT.md §5 beacon outcomes + resend schedule, and §3 identity persistence.

const _tooEarly =
    '{"success":false,"reason":"impression_not_recorded_yet","retry":true}';

class _Store extends AdxIdentityStore {
  String? value;
  int saves = 0;
  _Store([this.value]);
  @override
  Future<String?> load() async => value;
  @override
  Future<void> save(String v) async {
    saves += 1;
    value = v;
  }
}

void main() {
  setUp(resetRequestGuards);

  test('viewableOutcome classifies every contract response', () {
    final cases = <List<Object?>>[
      [200, '{"success":true}', ViewableOutcome.recorded],
      [200, '{"success":true,"duplicate":true}', ViewableOutcome.recorded],
      [200, _tooEarly, ViewableOutcome.retry],
      [0, null, ViewableOutcome.retry],
      [429, '{"error":"rate limit"}', ViewableOutcome.retry],
      [500, '', ViewableOutcome.retry],
      [503, 'oops', ViewableOutcome.retry],
      [400, 'Json deserialize error', ViewableOutcome.drop],
      [404, null, ViewableOutcome.drop],
      [200, '{"success":false}', ViewableOutcome.drop],
      [200, '', ViewableOutcome.drop],
      [200, '[true]', ViewableOutcome.drop],
      [200, '{"success":"true"}', ViewableOutcome.drop],
    ];
    for (final c in cases) {
      expect(viewableOutcome(c[0] as int, c[1] as String?), c[2],
          reason: '${c[0]} ${c[1]}');
    }
  });

  test('reportViewable is false when the beacon beat the impression row',
      () async {
    final adx = AdxClient(
        apiKey: 'pk_x',
        httpClient: MockClient((_) async => http.Response(_tooEarly, 200)));
    expect(await adx.reportViewable('imp1'), isFalse);
    expect(await adx.reportViewableOutcome('imp1'), ViewableOutcome.retry);
  });

  test('deliverWithRetry resends until recorded, on the 1/2/4s schedule',
      () async {
    final answers = [
      ViewableOutcome.retry,
      ViewableOutcome.retry,
      ViewableOutcome.recorded
    ];
    final slept = <Duration>[];
    var sends = 0;
    final outcome = await deliverWithRetry(
      retryable: true,
      send: () async => answers[sends++],
      sleep: (d) async => slept.add(d),
    );
    expect(outcome, ViewableOutcome.recorded);
    expect(sends, 3);
    expect(slept, [const Duration(seconds: 1), const Duration(seconds: 2)]);
  });

  test('deliverWithRetry gives up after the schedule', () async {
    final slept = <Duration>[];
    var sends = 0;
    await deliverWithRetry(
      retryable: true,
      send: () async {
        sends++;
        return ViewableOutcome.retry;
      },
      sleep: (d) async => slept.add(d),
    );
    expect(sends, 4);
    expect(slept.map((d) => d.inSeconds), [1, 2, 4]);
  });

  test('deliverWithRetry never resends OpenRTB or a permanent failure',
      () async {
    var sends = 0;
    await deliverWithRetry(
        retryable: false,
        send: () async {
          sends++;
          return ViewableOutcome.retry;
        },
        sleep: (_) async {});
    expect(sends, 1, reason: 'OpenRTB has no impression row');
    sends = 0;
    await deliverWithRetry(
        retryable: true,
        send: () async {
          sends++;
          return ViewableOutcome.drop;
        },
        sleep: (_) async {});
    expect(sends, 1);
  });

  test('gpp and gpp_sid are sent fully encoded', () async {
    late http.Request captured;
    final adx = AdxClient(
        apiKey: 'pk_x',
        baseUrl: 'https://h',
        httpClient: MockClient((req) async {
          captured = req;
          return http.Response('{"fill":false}', 200);
        }));
    await adx.requestAd(const AdRequest(
        slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
        gpp: 'DBABMA~CPXxRfA',
        gppSid: '7,8'));
    // Dart's Uri normalises %XX of unreserved characters back to the character, so the wire
    // form is not the full-byte encoding (CONTRACT.md §7) — the decoded value is what matters.
    expect(captured.url.queryParameters['gpp'], 'DBABMA~CPXxRfA');
    expect(captured.url.queryParameters['gpp_sid'], '7,8');
    expect(captured.url.query, contains('gpp_sid=7%2C8'));
  });

  group('identity (CONTRACT §3)', () {
    const signed =
        '1a45674e-a8b0-4acb-ada9-774f3055ef15._X8sLEOxqwz4akZKKJtrFW4n6xnpcbTGPWH1tPf6IT0';

    AdxClient client(List<http.Request> seen, {String? setCookie}) => AdxClient(
        apiKey: 'pk_x',
        httpClient: MockClient((req) async {
          seen.add(req);
          return http.Response('{"fill":false}', 200,
              headers: setCookie == null
                  ? {}
                  : {
                      'set-cookie':
                          '_an_id=$setCookie; HttpOnly; Secure; Path=/'
                    });
        }));

    test('a first request saves the issued identity and the next one sends it',
        () async {
      final seen = <http.Request>[];
      final store = _Store();
      final adx = client(seen, setCookie: signed);
      await adx.requestAd(
          const AdRequest(slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a'),
          identity: store);
      expect(seen.last.headers['Cookie'], isNull);
      expect(store.value, signed);

      await adx.requestAd(
          const AdRequest(slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a'),
          identity: store);
      expect(seen.last.headers['Cookie'], '_an_id=$signed');
      expect(store.saves, 1,
          reason: 're-sending the same value is not a new save');
    });

    test('an explicit identityCookie wins and is never stored', () async {
      final seen = <http.Request>[];
      final store = _Store(signed);
      final adx = client(seen, setCookie: 'other-id');
      await adx.requestAd(
          const AdRequest(
              slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a',
              identityCookie: 'mine'),
          identity: store);
      expect(seen.last.headers['Cookie'], '_an_id=mine');
      expect(store.value, signed);
      expect(store.saves, 0);
    });

    test('a poisoned stored or issued value is never replayed', () async {
      final seen = <http.Request>[];
      final store = _Store('x; Path=/');
      final adx = client(seen, setCookie: 'bad value');
      await adx.requestAd(
          const AdRequest(slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a'),
          identity: store);
      expect(seen.last.headers['Cookie'], isNull);
      expect(store.saves, 0);
    });

    test('isStorableIdentity accepts only the cookie alphabet', () {
      expect(isStorableIdentity(signed), isTrue);
      expect(
          isStorableIdentity('86ee3b2a-511e-4ff2-bb54-3f696a6525b8'), isTrue);
      expect(isStorableIdentity(null), isFalse);
      expect(isStorableIdentity(''), isFalse);
      expect(isStorableIdentity('a\r\nX: 1'), isFalse);
      expect(isStorableIdentity('a' * 257), isFalse);
    });

    test('a client without a store behaves exactly as before', () async {
      final seen = <http.Request>[];
      final ad = await client(seen, setCookie: signed).requestAd(
          const AdRequest(slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a'));
      expect(seen.single.headers['Cookie'], isNull);
      expect(ad.setIdentityCookie, signed);
    });
  });
}
