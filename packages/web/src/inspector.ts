/**
 * On-device ad inspector overlay (T2.12, client side).
 *
 * `enableInspector()` drops a floating panel listing every ad this page
 * rendered — network, impression id, clearing price — with one-click links to
 * the public nutrition label (/why/{imp_id}) where the signed receipt proves
 * the money trail. Also exposes the local persona with a wipe button (T3.3).
 *
 * Zero dependencies, no styles leak (inline styles only), safe to ship in
 * production behind `?adx_debug=1`.
 */

import { personaSnapshot, clearPersona } from './persona.ts';
import type { Ad } from './models.ts';

export interface InspectorEntry {
  network: string;
  impId: string | null;
  clearingPricePaise: number | null;
  source: string | null;
  ts: number;
}

const log: InspectorEntry[] = [];
let panel: HTMLDivElement | null = null;

/** Record a rendered ad into the inspector log (SDK internals call this). */
export function inspectorLog(networkOrAd: string | Ad, ad?: Ad): void {
  const network = typeof networkOrAd === 'string' ? networkOrAd : 'taimads';
  const a = typeof networkOrAd === 'string' ? ad : networkOrAd;
  log.push({
    network,
    impId: a?.impId ?? null,
    clearingPricePaise: a?.auction?.clearingPricePaise ?? null,
    source: a?.source ?? null,
    ts: Date.now(),
  });
  if (panel) {
    renderPanel();
  }
}

function nutritionBase(): string {
  return 'https://adx.theaimart.co';
}

/**
 * HTML-escape a value before it is interpolated into [renderPanel]'s markup.
 *
 * Nothing reaching the panel is attacker-controlled today — `source` is normalised to a
 * three-value enum by `parseAd`, `impId` is server-generated, and `network` is a literal the
 * SDK passes in. This is here so that stays true by construction rather than by coincidence:
 * the panel builds markup by string, the data in it comes from an ad response, and
 * `?adx_debug=1` is a query parameter anyone can put in a link they send someone.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPanel(): void {
  if (!panel) return;
  const rows = log
    .slice(-20)
    .reverse()
    .map((e) => {
      const price =
        e.clearingPricePaise != null ? `₹${(e.clearingPricePaise / 100).toFixed(2)} eCPM` : '—';
      const why = e.impId
        ? `<a href="${nutritionBase()}/why/${encodeURIComponent(e.impId)}" target="_blank" rel="noopener" style="color:#4ade80;text-decoration:underline">receipt</a>`
        : '';
      return `<div style="padding:6px 0;border-bottom:1px solid #333">
        <b>${esc(e.network)}</b> · ${esc(e.source ?? '')} · ${price} ${why}<br/>
        <span style="color:#888;font-size:10px">${esc(e.impId ?? 'no imp_id')}</span>
      </div>`;
    })
    .join('');

  const persona = Object.entries(personaSnapshot())
    .slice(0, 8)
    .map(([t, n]) => `${esc(t)} (${esc(String(n))})`)
    .join(', ');

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <b>🛡️ adx inspector</b>
      <span id="__adx_insp_close" style="cursor:pointer;padding:0 6px">✕</span>
    </div>
    <div style="max-height:220px;overflow:auto">${rows || '<i style="color:#888">no ads rendered yet</i>'}</div>
    <div style="margin-top:8px;border-top:1px solid #444;padding-top:6px;font-size:10px;color:#aaa">
      on-device persona: ${persona || '<i>empty</i>'}
      <span id="__adx_insp_wipe" style="color:#f87171;cursor:pointer;margin-left:6px;text-decoration:underline">wipe</span>
    </div>`;

  panel.querySelector('#__adx_insp_close')?.addEventListener('click', () => disableInspector());
  panel.querySelector('#__adx_insp_wipe')?.addEventListener('click', () => {
    clearPersona();
    renderPanel();
  });
}

/** Show the overlay. Call directly or append `?adx_debug=1` to any page URL. */
export function enableInspector(): void {
  if (typeof document === 'undefined' || panel) return;
  panel = document.createElement('div');
  panel.setAttribute(
    'style',
    'position:fixed;bottom:12px;right:12px;z-index:2147483647;width:320px;background:#0a0a0a;color:#e5e5e5;border:1px solid #444;border-radius:10px;padding:10px;font:11px/1.5 monospace;box-shadow:0 8px 30px rgba(0,0,0,.6)',
  );
  document.body.appendChild(panel);
  renderPanel();
}

export function disableInspector(): void {
  panel?.remove();
  panel = null;
}

/** Auto-enable when the page URL carries ?adx_debug=1. */
export function maybeEnableInspectorFromUrl(): void {
  if (typeof location === 'undefined') return;
  if (new URLSearchParams(location.search).get('adx_debug') === '1') {
    enableInspector();
  }
}
