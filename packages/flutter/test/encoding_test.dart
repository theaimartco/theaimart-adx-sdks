import 'package:flutter_test/flutter_test.dart';
import 'package:theaimart_adx/theaimart_adx.dart';

void main() {
  const nasty =
      'https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com'
      '&sel=select a table; drop-- update union open cast 1=1';

  test('percentEncodeAll is uppercase hex and roundtrips', () {
    expect(percentEncodeAll('aZ0'), '%61%5A%30');
    expect(Uri.decodeComponent(percentEncodeAll(nasty)), nasty);
  });

  test('buildServeQuery skips nulls', () {
    final q = buildServeQuery(<MapEntry<String, String?>>[
      const MapEntry('api_key', 'pk'),
      const MapEntry('slot_id', null),
      const MapEntry('page_url', 'x'),
    ]);
    expect(q.contains('api_key='), isTrue);
    expect(q.contains('slot_id='), isFalse);
    expect(q.contains('page_url='), isTrue);
  });

  test('built query is WAF-safe for hostile input; naive is not', () {
    final q = buildServeQuery(<MapEntry<String, String?>>[
      const MapEntry('api_key', 'pk_live'),
      const MapEntry('page_url', nasty),
      const MapEntry('page_keywords', 'select,table,cast,end,open'),
    ]);
    final lowered = q.toLowerCase();
    expect(sqlInjectionKeywords.where((k) => lowered.contains(k)).toList(),
        isEmpty);
    expect(rawQueryIsWafSafe(q), isTrue);

    final naive = 'page_url=${Uri.encodeQueryComponent(nasty)}';
    expect(rawQueryIsWafSafe(naive), isFalse);
  });
}
