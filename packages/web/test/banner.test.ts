/**
 * CONTRACT.md §9c regression tests — the beacon must be gated on a creative that actually
 * rendered, never on the ad-received callback. These cover the exact bug this SDK shipped:
 * an image that 404s left an empty box that was still reported as a viewable impression.
 *
 * Runs against a minimal DOM stub so it stays dependency-free like the rest of the suite.
 */
import { beforeEach, test } from 'node:test';
import { resetRequestGuards } from '../src/guard.ts';

beforeEach(() => resetRequestGuards());
import assert from 'node:assert/strict';
import { TaimAdsController } from '../src/browser.ts';

class FakeEl {
  tag: string;
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  textContent = '';
  alt = '';
  width = 0;
  height = 0;
  src = '';
  href = '';
  srcdoc = '';
  complete = false;
  naturalWidth = 0;
  private listeners: Record<string, Array<() => void>> = {};

  constructor(tag = 'div') {
    this.tag = tag;
  }
  appendChild(child: FakeEl): FakeEl {
    this.children.push(child);
    return child;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(): void {}
  fire(type: string): void {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

interface Harness {
  container: FakeEl;
  images: FakeEl[];
  viewableCalls: string[];
  adCalls: number;
  restore: () => void;
}

interface InstallOptions {
  /** Answers for successive beacons; the last one repeats. Default: always recorded. */
  viewable?: unknown[];
  /** Whether the container is on screen. Default: true. */
  onScreen?: boolean;
}

function install(
  adBody: unknown,
  status = 200,
  headers: Record<string, string> = {},
  opts: InstallOptions = {},
): Harness {
  const viewableAnswers = opts.viewable ?? [{ success: true }];
  const onScreen = opts.onScreen ?? true;
  const container = new FakeEl('div');
  const images: FakeEl[] = [];
  const viewableCalls: string[] = [];
  const h: Harness = { container, images, viewableCalls, adCalls: 0, restore: () => {} };

  const g = globalThis as Record<string, unknown>;
  const saved = {
    document: g.document,
    HTMLElement: g.HTMLElement,
    IntersectionObserver: g.IntersectionObserver,
    fetch: g.fetch,
  };

  g.HTMLElement = FakeEl;
  g.document = {
    hidden: false,
    getElementById: () => container,
    createElement: (tag: string) => {
      const el = new FakeEl(tag);
      if (tag === 'img') images.push(el);
      return el;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // Always-visible observer: fires once with the element fully on screen.
  g.IntersectionObserver = class {
    cb: (entries: unknown[]) => void;
    constructor(cb: (entries: unknown[]) => void) {
      this.cb = cb;
    }
    observe(): void {
      this.cb([{ isIntersecting: onScreen, intersectionRatio: onScreen ? 1 : 0 }]);
    }
    disconnect(): void {}
  };
  g.fetch = async (url: string | URL, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.includes('/serve/viewable')) {
      viewableCalls.push(String(init?.body ?? ''));
      const answer = viewableAnswers[Math.min(viewableCalls.length - 1, viewableAnswers.length - 1)];
      return new Response(JSON.stringify(answer), { status: 200 });
    }
    h.adCalls += 1;
    return new Response(JSON.stringify(adBody), { status, headers });
  };

  h.restore = () => {
    g.document = saved.document;
    g.HTMLElement = saved.HTMLElement;
    g.IntersectionObserver = saved.IntersectionObserver;
    g.fetch = saved.fetch;
  };
  return h;
}

const IMAGE_AD = {
  fill: true,
  imp_id: 'imp-abc',
  creative: {
    asset_url: 'https://cdn.example/x.png',
    click_url: 'https://api.adx.theaimart.co/api/v1/serve/click?id=imp-abc',
    headline: 'Hi',
    width: 300,
    height: 250,
  },
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForImage(h: Harness): Promise<FakeEl> {
  for (let i = 0; i < 200 && h.images.length === 0; i += 1) await sleep(5);
  assert.equal(h.images.length, 1, 'expected exactly one <img> to be created');
  return h.images[0];
}

test('a creative that loads fires exactly one viewability beacon', async () => {
  const h = install(IMAGE_AD);
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    const img = await waitForImage(h);
    assert.equal(h.container.style.maxWidth, '300px');
    assert.equal(h.container.style.aspectRatio, '300 / 250');
    assert.equal(h.container.style.borderRadius, '12px');
    assert.match(h.container.style.boxShadow, /rgba/);
    assert.equal(img.style.objectFit, 'contain');
    img.fire('load');
    assert.equal(img.style.opacity, '1');
    await sleep(1200);
    assert.equal(h.viewableCalls.length, 1);
    assert.match(h.viewableCalls[0], /imp-abc/);
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('an image that fails to load is NOT reported as viewable', async () => {
  const h = install(IMAGE_AD);
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    const img = await waitForImage(h);
    img.fire('error'); // the creative 404s — empty box, never an impression
    await sleep(1200);
    assert.equal(h.viewableCalls.length, 0, 'a creative that never drew must not count as viewable');
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('a non-http asset URL is dropped and not reported as viewable', async () => {
  const h = install({
    fill: true,
    imp_id: 'imp-hostile',
    creative: { asset_url: 'javascript:alert(1)', width: 300, height: 250 },
  });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    await sleep(300);
    assert.equal(h.images.length, 0, 'a hostile asset URL must never become an <img>');
    await sleep(900);
    assert.equal(h.viewableCalls.length, 0);
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('continuous fill keeps the slot in layout on a no-fill so it can recover', async () => {
  const h = install({ fill: false });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', refresh: 30 });
    await sleep(200);
    // A `display: none` container reports as not-intersecting, which would suspend the retry
    // loop forever — the exact failure mode continuous fill exists to prevent.
    assert.notEqual(h.container.style.display, 'none');
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('a single-shot banner collapses the slot on a no-fill and never repeats', async () => {
  const h = install({ fill: false });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    await sleep(200);
    assert.equal(h.container.style.display, 'none');
    assert.equal(h.adCalls, 1);
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('destroy() stops the loop and fires no beacon afterwards', async () => {
  const h = install(IMAGE_AD);
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', refresh: 30 });
    const img = await waitForImage(h);
    banner.destroy();
    img.fire('load');
    await sleep(1200);
    assert.equal(h.viewableCalls.length, 0);
  } finally {
    h.restore();
  }
});

const TOO_EARLY = { success: false, reason: 'impression_not_recorded_yet', retry: true };

test('a beacon that beat the impression row is resent until recorded (CONTRACT §5)', async () => {
  const h = install(IMAGE_AD, 200, {}, { viewable: [TOO_EARLY, { success: true }] });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    const img = await waitForImage(h);
    img.fire('load');
    await sleep(1150);
    assert.equal(h.viewableCalls.length, 1, 'first beacon after 1s on screen');
    await sleep(1100);
    assert.equal(h.viewableCalls.length, 2, 'resent ~1s after the retry answer');
    assert.match(h.viewableCalls[1], /imp-abc/);
    await sleep(2200);
    assert.equal(h.viewableCalls.length, 2, 'a recorded view is never resent');
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('an OpenRTB beacon is never resent: it has no impression row to mark', async () => {
  const html = { fill: true, source: 'openrtb', imp_id: 'imp-rtb', creative: { html: '<b>x</b>', width: 300, height: 250 } };
  const h = install(html, 200, {}, { viewable: [TOO_EARLY] });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const banner = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    await sleep(2400);
    assert.equal(h.viewableCalls.length, 1);
    assert.match(h.viewableCalls[0], /imp-rtb/);
    banner.destroy();
  } finally {
    h.restore();
  }
});

test('banners are lazy by default: an off-screen slot requests (and bills) nothing', async () => {
  const h = install(IMAGE_AD, 200, {}, { onScreen: false });
  try {
    const ads = new TaimAdsController();
    ads.init({ apiKey: 'pk_test' });
    const lazy = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a' });
    await sleep(100);
    assert.equal(h.adCalls, 0);
    lazy.destroy();
    const eager = ads.createBanner({ slotId: '6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a', lazy: false });
    await sleep(100);
    assert.equal(h.adCalls, 1, 'lazy: false still requests on load');
    eager.destroy();
  } finally {
    h.restore();
  }
});
