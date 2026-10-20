// HTTP transport abstraction. Default uses Node's global fetch (undici); injectable for tests.

import { AdxTransportError } from './errors.ts';
import { isSafeIdentityCookie, MAX_RESPONSE_BYTES } from './guard.ts';

export interface HttpResponse {
  status: number;
  getHeader(name: string): string | null;
  body: string;
}

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface Transport {
  request(req: TransportRequest): Promise<HttpResponse>;
}

/**
 * Default transport built on the global `fetch`. HTTP error statuses (4xx/5xx) resolve
 * normally (so the client can treat 403/429 as no-fill); only network-level failures and
 * timeouts throw {@link AdxTransportError}.
 *
 * The request URL is passed to `fetch` verbatim; `URL` serialization preserves our fully
 * percent-encoded query (only `%`, hex, `&`, `=`), so the WAF-safe encoding reaches the
 * server intact.
 *
 * Redirects are never followed: no serve endpoint redirects, and following one would replay the
 * request — `_an_id` cookie and forwarded headers included — to whatever host it named. A `3xx`
 * is returned as-is and becomes a no-fill. The body is read up to {@link MAX_RESPONSE_BYTES};
 * a larger one is a transport error, so a misbehaving upstream cannot exhaust memory.
 */
export class FetchTransport implements Transport {
  async request({ method, url, headers, body, timeoutMs }: TransportRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      const text = await readCapped(resp, MAX_RESPONSE_BYTES);
      return {
        status: resp.status,
        body: text,
        getHeader: (name: string): string | null => {
          if (name.toLowerCase() === 'set-cookie') {
            const withGetter = resp.headers as Headers & { getSetCookie?: () => string[] };
            const list = withGetter.getSetCookie?.();
            if (list && list.length > 0) return list.join('\n');
          }
          return resp.headers.get(name);
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AdxTransportError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readCapped(resp: Response, maxBytes: number): Promise<string> {
  const declared = Number(resp.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await resp.body?.cancel();
    throw new AdxTransportError('response too large');
  }
  if (!resp.body) return '';
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AdxTransportError('response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

/** Extract an integer `Retry-After` (seconds) from a response, if present and numeric. */
export function parseRetryAfter(resp: HttpResponse): number | null {
  const value = resp.getHeader('retry-after');
  if (value === null) return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull the `_an_id` value from any `Set-Cookie` header(s) so callers can persist identity. Only a
 * value in the server's own alphabet is returned, so nothing else is ever stored or replayed.
 */
export function extractIdentityCookie(resp: HttpResponse): string | null {
  const raw = resp.getHeader('set-cookie');
  if (!raw) return null;
  for (const cookie of raw.split('\n')) {
    for (const segment of cookie.split(';')) {
      const trimmed = segment.trim();
      if (trimmed.startsWith('_an_id=')) {
        const value = trimmed.slice('_an_id='.length);
        return isSafeIdentityCookie(value) ? value : null;
      }
    }
  }
  return null;
}
