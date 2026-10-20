/**
 * Whether a click URL may be opened. Only http/https are allowed — a hostile creative's
 * `javascript:` / `file:` / `intent:` URL is rejected. Kept dependency-free (no react-native
 * imports) so it is unit-testable off-device.
 */
export function isSafeHttpUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  return lowered.startsWith('http://') || lowered.startsWith('https://');
}
