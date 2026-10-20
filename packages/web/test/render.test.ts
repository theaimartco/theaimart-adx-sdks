/**
 * CONTRACT.md §9c — the render gate. This is the shared conformance table: a fill the platform
 * cannot draw is NOT an impression, so it must never arm the viewability beacon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderPlan, renderPlan } from '../src/render.ts';
import { parseAd } from '../src/models.ts';

const image = (assetUrl: string): unknown => ({
  fill: true,
  imp_id: 'imp1',
  creative: { asset_url: assetUrl, click_url: 'https://x/c', width: 300, height: 250 },
});
const html = { fill: true, source: 'openrtb', imp_id: 'imp1', creative: { html: '<b>ad</b>', width: 300, height: 250 } };

test('no-fill and transport errors are never renderable', () => {
  assert.equal(renderPlan(parseAd(200, { fill: false }), true), RenderPlan.None);
  assert.equal(renderPlan(parseAd(0, null), true), RenderPlan.None);
  assert.equal(renderPlan(parseAd(429, { fill: false }), true), RenderPlan.None);
  assert.equal(renderPlan(null, true), RenderPlan.None);
});

test('an ordinary image creative renders', () => {
  assert.equal(renderPlan(parseAd(200, image('https://cdn/x.png')), false), RenderPlan.Image);
  assert.equal(renderPlan(parseAd(200, image('http://cdn/x.png')), false), RenderPlan.Image);
});

test('a hostile asset URL is dropped, not drawn', () => {
  for (const hostile of ['javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,AAAA', 'intent://x']) {
    assert.equal(renderPlan(parseAd(200, image(hostile)), true), RenderPlan.None, hostile);
  }
});

test('an OpenRTB fill renders only where a WebView exists', () => {
  assert.equal(renderPlan(parseAd(200, html), true), RenderPlan.Html);
  // The exact Unity/Flutter bug: an OpenRTB fill on a surface that cannot draw it is not an
  // impression and must not be beaconed.
  assert.equal(renderPlan(parseAd(200, html), false), RenderPlan.None);
});

test('a house ad (no imp_id) still renders but is not trackable', () => {
  const house = parseAd(200, {
    fill: true,
    source: 'house',
    creative: { asset_url: 'https://cdn/h.png', click_url: 'https://adv/x', width: 300, height: 250 },
  });
  assert.equal(renderPlan(house, true), RenderPlan.Image);
  assert.equal(house.isTrackable, false);
});
