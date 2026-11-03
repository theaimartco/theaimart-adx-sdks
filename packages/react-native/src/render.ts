/**
 * The §9c render gate, as a pure decision — CONTRACT.md §9c.
 *
 * Every SDK asks this one question before it draws anything, and the answer is the *only* thing
 * allowed to arm the viewability beacon. `None` means the platform cannot draw this creative, so
 * it is not an impression: no beacon, and the slot backs off and refills (§9a).
 *
 * Kept pure so the rule is unit-tested identically on every platform, including the ones whose
 * view layer cannot be exercised in CI.
 */

import { type Ad, AdKind } from './models.ts';
import { isSafeHttpUrl } from './url.ts';

export const RenderPlan = {
  /** Draw `creative.html` in a sandboxed WebView. */
  Html: 'html',
  /** Draw `creative.assetUrl` as an image. */
  Image: 'image',
  /** Nothing can be drawn — not an impression. */
  None: 'none',
} as const;
export type RenderPlan = (typeof RenderPlan)[keyof typeof RenderPlan];

/**
 * @param ad           The parsed decision.
 * @param canRenderHtml Whether this surface actually has a WebView available right now.
 */
export function renderPlan(ad: Ad | null, canRenderHtml: boolean): RenderPlan {
  if (!ad || !ad.filled || !ad.creative) return RenderPlan.None;
  const c = ad.creative;
  if (ad.kind === AdKind.Html) {
    // An OpenRTB creative with no WebView to put it in is a fill we cannot show.
    return c.html && canRenderHtml ? RenderPlan.Html : RenderPlan.None;
  }
  // §4e: a hostile `javascript:`/`file:`/`data:` asset URL is dropped, and a dropped creative
  // is not an impression.
  if (c.assetUrl && isSafeHttpUrl(c.assetUrl)) return RenderPlan.Image;
  return RenderPlan.None;
}

/** What to do with a navigation an html/openrtb creative starts — CONTRACT.md §4e. */
export const CreativeNavigation = {
  /** Let the WebView load it. Only ever a sub-frame inside the creative. */
  Allow: 'allow',
  /** A click-through: open it in the browser and refuse the in-WebView navigation. */
  OpenExternally: 'open_externally',
  /** Refuse it and do nothing. */
  Block: 'block',
} as const;
export type CreativeNavigation = (typeof CreativeNavigation)[keyof typeof CreativeNavigation];

/**
 * How long after the user's last touch on the creative a top-level navigation still counts as
 * theirs. Ad click handlers commonly fire a tracker and redirect a few hundred ms later.
 */
export const CREATIVE_GESTURE_WINDOW_MS = 2000;

/**
 * The §4e navigation rule — identical on every platform that renders html creatives.
 *
 * - **Nothing leaves the app without a tap.** A top-level navigation with no user gesture behind
 *   it is a forced redirect (the creative throwing the user into a scam page or an app store the
 *   moment it loads). It is blocked, not opened.
 * - **The banner itself is never navigated.** A tapped top-level http/https navigation is a
 *   click-through and opens outside the ad surface; any other scheme is dropped.
 * - A sub-frame inside the creative may load http/https/about content in place — that never
 *   leaves the ad's box — but never another scheme.
 */
export function creativeNavigation(
  url: string | null | undefined,
  isMainFrame: boolean,
  userGesture: boolean,
): CreativeNavigation {
  if (typeof url !== 'string') return CreativeNavigation.Block;
  const safe = isSafeHttpUrl(url);
  if (!isMainFrame) {
    return safe || url.trim().toLowerCase().startsWith('about:')
      ? CreativeNavigation.Allow
      : CreativeNavigation.Block;
  }
  return safe && userGesture ? CreativeNavigation.OpenExternally : CreativeNavigation.Block;
}
