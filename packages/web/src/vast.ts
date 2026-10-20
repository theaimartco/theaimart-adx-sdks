/**
 * Minimal VAST client for the TaimAds video endpoint (T2.3, client side).
 *
 * `parseVast` understands the VAST 2.0/4.0 documents our ad server emits
 * (single InLine linear ad) — it is deliberately not a general-purpose VAST
 * parser. `playVastAd` wires the result onto an HTML5 <video> element with
 * IAB-correct beaconing: the impression fires once on first play, and the
 * clickthrough only works after it (CONTRACT.md §2).
 *
 * Every URL in the document is advertiser-influenced (`MediaFile` is the
 * advertiser's asset URL), so only http/https URLs survive parsing — a
 * `javascript:` / `data:` / `blob:` value is dropped, never assigned to
 * `video.src`, an `<img>` or `window.open`.
 */

import { DEFAULT_TIMEOUT_MS } from './constants.ts';
import { isSafeHttpUrl } from './core.ts';
import { readCappedText } from './guard.ts';

export interface VastMediaFile {
  url: string;
  /** MIME type from the `type` attribute (e.g. `video/mp4`), or null when absent. */
  type: string | null;
}

export interface VastAd {
  adTitle: string | null;
  /** The first safe media file — kept for callers that only want one URL. */
  mediaFileUrl: string | null;
  /** Every safe media file, in document order. */
  mediaFiles: VastMediaFile[];
  impressionUrls: string[];
  clickThroughUrl: string | null;
  durationSeconds: number | null;
}

export interface PlayVastOptions {
  /** Abort the tag fetch after this long. Default 10 000 ms. */
  timeoutMs?: number;
  /** Cancels the fetch and removes every listener `playVastAd` added to the video. */
  signal?: AbortSignal;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the XML entities a text node may carry (`&amp;` in a query string, mostly). */
function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

function extractCdataOrText(block: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(block);
  return cdata ? cdata[1].trim() : decodeXmlText(block.trim());
}

interface TagMatch {
  attrs: string;
  body: string;
}

function tagMatches(xml: string, tag: string): TagMatch[] {
  const out: TagMatch[] = [];
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1] ?? '', body: m[2] });
  }
  return out;
}

function tagContents(xml: string, tag: string): string[] {
  return tagMatches(xml, tag).map((m) => m.body);
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? decodeXmlText(m[2] ?? m[3] ?? '') : null;
}

function safeUrl(value: string | undefined): string | null {
  return value && isSafeHttpUrl(value) ? value.trim() : null;
}

/** Parse a TaimAds VAST document. Returns null for empty VAST (no fill). */
export function parseVast(xml: string): VastAd | null {
  if (!/<Ad[\s>]/.test(xml)) {
    return null; // empty <VAST/> — no fill
  }

  const duration = tagContents(xml, 'Duration')[0]?.trim() ?? null;
  let durationSeconds: number | null = null;
  if (duration) {
    const parts = duration.split(':').map((p) => parseFloat(p));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      durationSeconds = Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  }

  const mediaFiles: VastMediaFile[] = [];
  for (const m of tagMatches(xml, 'MediaFile')) {
    const url = safeUrl(extractCdataOrText(m.body));
    if (url) mediaFiles.push({ url, type: attr(m.attrs, 'type') });
  }

  return {
    adTitle: tagContents(xml, 'AdTitle').map(extractCdataOrText)[0] ?? null,
    mediaFileUrl: mediaFiles[0]?.url ?? null,
    mediaFiles,
    impressionUrls: tagContents(xml, 'Impression')
      .map((b) => safeUrl(extractCdataOrText(b)))
      .filter((u): u is string => u !== null),
    clickThroughUrl: safeUrl(tagContents(xml, 'ClickThrough').map(extractCdataOrText)[0]),
    durationSeconds,
  };
}

/** The first media file this `<video>` says it can play, else the first one. */
export function pickMediaFile(
  files: VastMediaFile[],
  canPlayType: (type: string) => string,
): VastMediaFile | null {
  for (const f of files) {
    if (f.type && canPlayType(f.type) !== '') return f;
  }
  return files[0] ?? null;
}

/**
 * Fetch a VAST tag and play it in the given <video>. Resolves with the parsed
 * ad (null on no-fill, an unsafe tag URL, a timeout or an oversized body).
 * Impression beacons fire exactly once, on first play; clicking the video
 * opens the (http/https-only) clickthrough only after that, because the click
 * tracker resolves against the impression the beacon records.
 */
export async function playVastAd(
  video: HTMLVideoElement,
  tagUrl: string,
  options: PlayVastOptions = {},
): Promise<VastAd | null> {
  if (!isSafeHttpUrl(tagUrl)) return null;
  const outer = options.signal;
  if (outer?.aborted) return null;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = (): void => controller.abort();
  outer?.addEventListener('abort', onOuterAbort, { once: true });

  let ad: VastAd | null;
  try {
    const res = await fetch(tagUrl, { credentials: 'omit', signal: controller.signal });
    if (!res.ok) return null;
    const text = await readCappedText(res);
    ad = text === null ? null : parseVast(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }

  const media = ad ? pickMediaFile(ad.mediaFiles, (t) => video.canPlayType(t)) : null;
  if (!ad || !media || outer?.aborted) return null;

  video.src = media.url;
  const listen = outer ? { signal: outer } : undefined;

  let impressionFired = false;
  video.addEventListener(
    'playing',
    () => {
      if (impressionFired) return;
      impressionFired = true;
      for (const url of ad.impressionUrls) {
        const img = new Image(1, 1);
        img.src = url;
      }
    },
    listen,
  );

  const clickThrough = ad.clickThroughUrl;
  if (clickThrough) {
    video.style.cursor = 'pointer';
    video.addEventListener(
      'click',
      () => {
        // Before first play the click belongs to the player (it usually starts playback).
        if (!impressionFired) return;
        window.open(clickThrough, '_blank', 'noopener');
      },
      listen,
    );
  }

  return ad;
}
