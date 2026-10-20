import 'package:flutter_test/flutter_test.dart';
import 'package:theaimart_adx/theaimart_adx.dart';

void main() {
  test('parses internal fill (no source field)', () {
    const body = '{"fill":true,"imp_id":"imp1","identity_id":"id1",'
        '"auction":{"type":"second_price","clearing_price_paise":120,"quality_score":0.83},'
        '"creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp1","headline":"Hi","width":300,"height":250}}';
    final ad = Ad.fromResponse(200, body);
    expect(ad.filled, isTrue);
    expect(ad.kind, AdKind.image);
    expect(ad.source, AdSource.internal);
    expect(ad.impId, 'imp1');
    expect(ad.isTrackable, isTrue);
    expect(ad.creative?.assetUrl, 'https://cdn/x.png');
    expect(ad.auction?.clearingPricePaise, 120);
  });

  test('parses openrtb html fill', () {
    const body =
        '{"fill":true,"source":"openrtb","imp_id":"i","dsp":"DSP","creative":{"html":"<div>ad</div>","width":320,"height":50}}';
    final ad = Ad.fromResponse(200, body);
    expect(ad.kind, AdKind.html);
    expect(ad.source, AdSource.openrtb);
    expect(ad.dsp, 'DSP');
    expect(ad.creative?.html, '<div>ad</div>');
  });

  test('parses house fill; not trackable', () {
    const body =
        '{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/landing","width":300,"height":250}}';
    final ad = Ad.fromResponse(200, body);
    expect(ad.source, AdSource.house);
    expect(ad.kind, AdKind.image);
    expect(ad.impId, isNull);
    expect(ad.isTrackable, isFalse);
  });

  test('no-fill and error variants', () {
    expect(Ad.fromResponse(200, '{"fill":false}').filled, isFalse);
    expect(
        Ad.fromResponse(200, '{"fill":false,"reason":"fraud_rejected"}').reason,
        'fraud_rejected');
    expect(
        Ad.fromResponse(429, '{"fill":false}', retryAfterSeconds: 60)
            .retryAfterSeconds,
        60);
    expect(Ad.fromResponse(400, 'not json').filled, isFalse);
    expect(Ad.fromResponse(200, null).filled, isFalse);
  });

  test('creative dimensions default to 300x250', () {
    final ad = Ad.fromResponse(
        200, '{"fill":true,"creative":{"asset_url":"x","click_url":"y"}}');
    expect(ad.creative?.width, 300);
    expect(ad.creative?.height, 250);
  });
}
