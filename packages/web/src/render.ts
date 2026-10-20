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
import { isSafeHttpUrl } from './core.ts';

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
