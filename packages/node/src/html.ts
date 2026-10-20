// Server-side HTML rendering for an Ad (mirrors the web SDK's render logic).

import { type Ad, AdKind } from './models.ts';

const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

/**
 * Whether a click URL may become a navigable link. Only http/https are allowed — a hostile
 * creative's `javascript:` / `data:` / `file:` / `intent:` URL is rejected.
 */
export function isSafeHttpUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  return lowered.startsWith('http://') || lowered.startsWith('https://');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an {@link Ad} to an HTML snippet, or `''` if it cannot/should not be rendered.
 * Image creatives become a sponsored `<a><img></a>`; html/openrtb creatives become a
 * **sandboxed** `<iframe srcdoc>` so the markup can never touch the host page's DOM.
 */
export function renderHtml(ad: Ad, cssClass = 'theaimart-adx'): string {
  if (!ad.filled || ad.creative === null) return '';
  const c = ad.creative;
  const klass = escapeAttr(cssClass);

  if (ad.kind === AdKind.Html && c.html) {
    const srcdoc = escapeAttr(c.html);
    return (
      `<iframe class="${klass}" width="${c.width}" height="${c.height}" frameborder="0" ` +
      `scrolling="no" marginwidth="0" marginheight="0" sandbox="${IFRAME_SANDBOX}" ` +
      `srcdoc="${srcdoc}"></iframe>`
    );
  }

  if (!c.assetUrl) return '';
  const src = escapeAttr(c.assetUrl);
  const alt = escapeAttr(c.headline ?? 'Advertisement');
  const img =
    `<img src="${src}" alt="${alt}" width="${c.width}" height="${c.height}" ` +
    `style="border:0;display:block" />`;

  // Only http/https click URLs become a link; a hostile creative's non-http URL is dropped.
  if (c.clickUrl && isSafeHttpUrl(c.clickUrl)) {
    const href = escapeAttr(c.clickUrl);
    return `<a class="${klass}" href="${href}" target="_blank" rel="noopener nofollow sponsored">${img}</a>`;
  }
  return img;
}
