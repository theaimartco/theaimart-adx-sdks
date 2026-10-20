// Viewability-beacon response classification (CONTRACT.md §5).

/** What a `POST /serve/viewable` response means for the view it reported. */
export const ViewableOutcome = {
  /** The server recorded the view (or already had it — `duplicate: true`). */
  Recorded: 'recorded',
  /** Not counted, but resending is safe: too early, rate-limited, 5xx or no response. */
  Retry: 'retry',
  /** Permanent failure (e.g. `400`); resending would not help. */
  Drop: 'drop',
} as const;
export type ViewableOutcome = (typeof ViewableOutcome)[keyof typeof ViewableOutcome];

/**
 * Classify a viewability-beacon response. `status` 0 means no response (transport error).
 *
 * The backend writes impressions through an async buffer, so a beacon can arrive before the
 * row exists. It then answers `200 {"success": false, "retry": true}` and releases its dedup
 * key — the view was *not* counted. Reading only the status code turns that into a silent
 * success, which is how early beacons used to be lost for good.
 */
export function viewableOutcome(status: number, body: unknown): ViewableOutcome {
  if (status === 0 || status === 429 || status >= 500) return ViewableOutcome.Retry;
  if (status < 200 || status >= 300) return ViewableOutcome.Drop;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return ViewableOutcome.Drop;
  const obj = body as Record<string, unknown>;
  if (obj.success === true) return ViewableOutcome.Recorded;
  if (obj.retry === true) return ViewableOutcome.Retry;
  return ViewableOutcome.Drop;
}
