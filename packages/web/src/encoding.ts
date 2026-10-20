/**
 * SQL-filter-safe query encoding (CONTRACT.md §7). Vendored per-package so the SDK has no
 * cross-package runtime dependency — keep in sync with CONTRACT.md.
 *
 * The backend WAF 403s any raw query containing SQL-ish substrings (`end`, `open`, `cast`,
 * `select`, `@`, …) that occur constantly in real URLs. We percent-encode every byte of each
 * free-text value so no keyword substring survives, while the server still decodes it back.
 */

export const SQL_INJECTION_KEYWORDS: readonly string[] = [
  '--', ';--', '/*', '*/', '@@', '@', 'char', 'nchar', 'varchar', 'nvarchar',
  'alter', 'begin', 'cast', 'create', 'cursor', 'declare', 'delete', 'drop', 'end',
  'exec', 'execute', 'fetch', 'insert', 'kill', 'open', 'select', 'sys',
  'sysobjects', 'syscolumns', 'table', 'update', 'union', 'waitfor', 'xp_',
  'sp_', "' or '1'='1", "' or 1=1", '1=1', 'or 1=1',
];

const HEX = '0123456789ABCDEF';

/** Percent-encode every UTF-8 byte of `value` as uppercase `%XX`. */
export function percentEncodeAll(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = '';
  for (const b of bytes) {
    out += '%' + HEX[b >> 4] + HEX[b & 0x0f];
  }
  return out;
}

export type QueryParam = readonly [string, string | null | undefined];

/** Build a `a=…&b=…` query string, fully byte-encoding every value. */
export function buildServeQuery(params: readonly QueryParam[]): string {
  const parts: string[] = [];
  for (const [name, value] of params) {
    if (value === null || value === undefined) continue;
    parts.push(name + '=' + percentEncodeAll(value));
  }
  return parts.join('&');
}

/** Mirror of the backend WAF check; a query from {@link buildServeQuery} always returns true. */
export function rawQueryIsWafSafe(rawQuery: string): boolean {
  const lowered = rawQuery.toLowerCase();
  return !SQL_INJECTION_KEYWORDS.some((kw) => lowered.includes(kw));
}
