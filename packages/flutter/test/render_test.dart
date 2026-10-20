// CONTRACT.md §9c — the render gate. A fill this surface cannot draw is NOT an impression,
// so it must never arm the viewability beacon.

import 'package:flutter_test/flutter_test.dart';
import 'package:theaimart_adx/src/models.dart';
import 'package:theaimart_adx/src/render.dart';

Ad _image(String assetUrl) => Ad.fromResponse(200,
    '{"fill":true,"imp_id":"imp1","creative":{"asset_url":"$assetUrl","click_url":"https://x/c","width":300,"height":250}}');

const _htmlBody =
    '{"fill":true,"source":"openrtb","imp_id":"imp1","creative":{"html":"<b>ad</b>","width":300,"height":250}}';

void main() {
  test('no-fill and transport errors are never renderable', () {
    expect(renderPlan(Ad.fromResponse(200, '{"fill":false}'), true),
        RenderPlan.none);
    expect(renderPlan(Ad.fromResponse(0, ''), true), RenderPlan.none);
    expect(renderPlan(null, true), RenderPlan.none);
  });

  test('an ordinary image creative renders', () {
    expect(renderPlan(_image('https://cdn/x.png'), false), RenderPlan.image);
    expect(renderPlan(_image('http://cdn/x.png'), false), RenderPlan.image);
  });

  test('a hostile asset URL is dropped, not drawn', () {
    for (final hostile in [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:image/png;base64,AAAA',
      'intent://x'
    ]) {
      expect(renderPlan(_image(hostile), true), RenderPlan.none,
          reason: hostile);
    }
  });

  test('a padded URL is accepted, matching every other SDK', () {
    // `Uri.tryParse` returns null for a string with leading whitespace, so this used to be the
    // one platform that dropped an otherwise valid creative whose URL arrived padded.
    expect(isSafeHttpUrl('  https://x.example  '), isTrue);
    expect(isSafeHttpUrl('\thttps://x.example'), isTrue);
    expect(
        renderPlan(_image('  https://cdn/x.png  '), false), RenderPlan.image);
    // Padding must not smuggle a hostile scheme through either.
    expect(isSafeHttpUrl('  javascript:alert(1)  '), isFalse);
  });

  test('the §4e navigation rule an htmlBuilder must apply', () {
    expect(adNavigation('https://advertiser.example/landing'),
        AdNavigation.openExternally);
    expect(
        adNavigation('http://advertiser.example'), AdNavigation.openExternally);
    for (final hostile in [
      'intent://scan/#Intent;scheme=zxing;package=com.evil.app;end',
      'market://details?id=com.evil.app',
      'tel:+150055501000',
      'file:///etc/hosts',
      'javascript:alert(1)',
      'app-scheme://open',
      null,
    ]) {
      expect(adNavigation(hostile), AdNavigation.block, reason: '$hostile');
    }
  });

  test('an OpenRTB fill renders only where a WebView exists', () {
    expect(renderPlan(Ad.fromResponse(200, _htmlBody), true), RenderPlan.html);
    // The exact bug this SDK shipped: with no htmlBuilder the widget drew nothing yet still
    // reported the ad as loaded. It is not an impression.
    expect(renderPlan(Ad.fromResponse(200, _htmlBody), false), RenderPlan.none);
  });

  test('a house ad (no imp_id) still renders but is not trackable', () {
    final house = Ad.fromResponse(200,
        '{"fill":true,"source":"house","creative":{"asset_url":"https://cdn/h.png","click_url":"https://adv/x","width":300,"height":250}}');
    expect(renderPlan(house, true), RenderPlan.image);
    expect(house.isTrackable, isFalse);
  });
}
