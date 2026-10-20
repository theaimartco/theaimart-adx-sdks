/**
 * On-device persona (T3.3, v1) — targeting that never phones home.
 *
 * Interest topics are counted in the *user's own* localStorage. At request
 * time the top topics ride the serve call as plain contextual keywords — no
 * identifier, no profile upload, nothing joinable server-side. The user can
 * inspect and wipe the whole persona at any time (the inspector overlay
 * exposes both).
 */

export interface PersonaStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = '__adx_persona_v1';
const MAX_TOPICS = 50;

function defaultStore(): PersonaStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage blocked — persona simply stays empty
  }
}

function load(store: PersonaStore): Record<string, number> {
  try {
    const raw = store.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Record one interest signal (e.g. the page's topic). Counts cap at 1000. */
export function recordTopic(topic: string, store: PersonaStore | null = defaultStore()): void {
  if (!store) return;
  const clean = topic.trim().toLowerCase().slice(0, 40);
  if (!clean) return;
  const counts = load(store);
  counts[clean] = Math.min((counts[clean] ?? 0) + 1, 1000);

  // Keep the persona bounded: drop the weakest topics past the cap.
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOPICS);
  store.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}

/** Top-N interest topics, strongest first — safe to send as plain keywords. */
export function topTopics(n = 5, store: PersonaStore | null = defaultStore()): string[] {
  if (!store) return [];
  return Object.entries(load(store))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, n))
    .map(([topic]) => topic);
}

/** Everything the persona knows — shown verbatim in the inspector overlay. */
export function personaSnapshot(store: PersonaStore | null = defaultStore()): Record<string, number> {
  return store ? load(store) : {};
}

/** Wipe the persona. Instant, local, unrecoverable — as it should be. */
export function clearPersona(store: PersonaStore | null = defaultStore()): void {
  store?.removeItem(KEY);
}
