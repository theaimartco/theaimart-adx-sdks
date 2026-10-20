/** Base class for all SDK errors. */
export class AdxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdxError';
  }
}

/**
 * Programmer mistakes: missing apiKey, no slot id/name, etc. Distinct from runtime ad
 * failures (no-fill), which never throw — they are returned as an un-filled `Ad`.
 */
export class AdxConfigError extends AdxError {
  constructor(message: string) {
    super(message);
    this.name = 'AdxConfigError';
  }
}

/**
 * Network-level failure (DNS, connection refused, timeout/abort). The client catches this
 * and returns a no-fill by default (fail-closed); pass `raiseOnError: true` to surface it.
 */
export class AdxTransportError extends AdxError {
  constructor(message: string) {
    super(message);
    this.name = 'AdxTransportError';
  }
}
