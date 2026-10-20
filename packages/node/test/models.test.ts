import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdKind, AdSource, parseAd } from '../src/models.ts';

const INTERNAL = {
  fill: true,
  imp_id: '1751600000000_550e8400',
  identity_id: 'id-uuid',
  auction: {
    type: 'second_price',
    clearing_price_paise: 120,
    quality_score: 0.83,
    effective_bid: 99.6,
    winner_bid_paise: 150,
  },
  creative: {
    id: 'creative-uuid',
    campaign_id: 'campaign-uuid',
    asset_url: 'https://cdn/banner.png',
    click_url: 'https://api.adx.theaimart.co/api/v1/serve/click?id=1751600000000_550e8400',
    headline: 'Buy now',
    description: null,
    width: 300,
    height: 250,
  },
};

const OPENRTB = {
  fill: true,
  source: 'openrtb',
  imp_id: 'imp-rtb',
  dsp: 'Some DSP',
  auction: { type: 'unified', clearing_price_paise: 140, winner_ecpm_paise: 160 },
  creative: { html: '<div>ad</div>', width: 320, height: 50 },
};

const HOUSE = {
  fill: true,
  source: 'house',
  identity_id: 'id-uuid',
  creative: {
    asset_url: 'https://cdn/house.png',
    click_url: 'https://advertiser.example/landing',
    headline: 'House ad',
    width: 300,
    height: 250,
  },
};

test('parses internal fill (no source field)', () => {
  const ad = parseAd(200, INTERNAL);
  assert.equal(ad.filled, true);
  assert.equal(ad.kind, AdKind.Image);
  assert.equal(ad.source, AdSource.Internal);
  assert.equal(ad.impId, '1751600000000_550e8400');
  assert.equal(ad.isTrackable, true);
  assert.equal(ad.creative?.assetUrl, 'https://cdn/banner.png');
  assert.equal(ad.auction?.clearingPricePaise, 120);
  assert.equal(ad.auction?.qualityScore, 0.83);
});

test('parses openrtb html fill', () => {
  const ad = parseAd(200, OPENRTB);
  assert.equal(ad.kind, AdKind.Html);
  assert.equal(ad.source, AdSource.OpenRtb);
  assert.equal(ad.dsp, 'Some DSP');
  assert.equal(ad.creative?.html, '<div>ad</div>');
  assert.equal(ad.auction?.winnerEcpmPaise, 160);
  assert.equal(ad.isTrackable, true);
});

test('parses house fill and marks it not trackable', () => {
  const ad = parseAd(200, HOUSE);
  assert.equal(ad.source, AdSource.House);
  assert.equal(ad.kind, AdKind.Image);
  assert.equal(ad.impId, null);
  assert.equal(ad.isTrackable, false);
  assert.equal(ad.creative?.clickUrl, 'https://advertiser.example/landing');
});

test('no-fill variants', () => {
  assert.equal(parseAd(200, { fill: false }).filled, false);
  assert.equal(parseAd(200, { fill: false, reason: 'fraud_rejected' }).reason, 'fraud_rejected');
});

test('non-200 and non-object bodies are no-fill', () => {
  assert.equal(parseAd(429, { fill: false }, 60).retryAfterSeconds, 60);
  for (const body of [null, 'plain text', 123, ['a']]) {
    const ad = parseAd(400, body);
    assert.equal(ad.filled, false);
    assert.equal(ad.kind, AdKind.NoFill);
  }
});

test('creative dimensions default to 300x250', () => {
  const ad = parseAd(200, { fill: true, creative: { asset_url: 'x', click_url: 'y' } });
  assert.equal(ad.creative?.width, 300);
  assert.equal(ad.creative?.height, 250);
});
