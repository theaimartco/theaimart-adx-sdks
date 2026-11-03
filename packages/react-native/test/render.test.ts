/**
 * CONTRACT.md §9c — the render gate. This is the shared conformance table: a fill the platform
 * cannot draw is NOT an impression, so it must never arm the viewability beacon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreativeNavigation, RenderPlan, creativeNavigation, renderPlan } from '../src/render.ts';
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

// --- §4e creative navigation (the shared conformance table) ---

test('a tapped top-level http navigation opens externally', () => {
  assert.equal(creativeNavigation('https://adv.example/lp', true, true), CreativeNavigation.OpenExternally);
  assert.equal(creativeNavigation('  HTTP://adv.example ', true, true), CreativeNavigation.OpenExternally);
});

test('an untapped top-level navigation is a forced redirect and is blocked', () => {
  assert.equal(creativeNavigation('https://scam.example', true, false), CreativeNavigation.Block);
});

test('non-http schemes never leave the creative, even when tapped', () => {
  for (const url of [
    'intent://x#Intent;end',
    'market://details?id=x',
    'tel:123',
    'sms:1',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,x',
    'myapp://pay',
    'about:blank',
  ]) {
    assert.equal(creativeNavigation(url, true, true), CreativeNavigation.Block, url);
    assert.equal(creativeNavigation(url, true, false), CreativeNavigation.Block, url);
  }
  assert.equal(creativeNavigation(null, true, true), CreativeNavigation.Block);
});

test('sub-frames load web content in place but nothing else', () => {
  assert.equal(creativeNavigation('https://dsp.example/frame', false, false), CreativeNavigation.Allow);
  assert.equal(creativeNavigation('about:blank', false, false), CreativeNavigation.Allow);
  assert.equal(creativeNavigation('intent://x', false, true), CreativeNavigation.Block);
  assert.equal(creativeNavigation('market://x', false, false), CreativeNavigation.Block);
});

test('BannerAd routes every creative navigation through the rule, never the library whitelist', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/BannerAd.tsx', import.meta.url), 'utf8');
  // A narrower whitelist makes react-native-webview Linking.openURL() every non-matching URL.
  assert.match(src, /const HTML_ORIGIN_WHITELIST = \['\*'\];/);
  assert.match(src, /onShouldStartLoadWithRequest=\{onCreativeNavigation\}/);
  assert.match(src, /setSupportMultipleWindows=\{false\}/);
});
