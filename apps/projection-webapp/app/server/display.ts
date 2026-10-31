// In-memory display registry: per screen, the names it currently shows.
// Display state, not archive data, so nothing is persisted; a restart simply
// waits for the next report (screens re-report every few minutes).
import type { DisplayGuess, DisplayScreen, DisplayStamp } from '../shared/display';

const STALE = 15 * 60_000; // drop screens not heard from for 15 min
const MAX_STAMPS = 2000;

// On globalThis so dev hot reloads keep the registry.
const g = globalThis as { __displayRegistry?: Map<string, DisplayScreen> };
const registry = (g.__displayRegistry ??= new Map<string, DisplayScreen>());

function prune() {
  const now = Date.now();
  for (const [screen, s] of registry) if (now - Date.parse(s.updatedAt) > STALE) registry.delete(screen);
}

const unit = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -0.5 && v <= 1.5;
const str = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

function cleanStamp(s: unknown): DisplayStamp | null {
  if (!s || typeof s !== 'object') return null;
  const t = s as Record<string, unknown>;
  if (!str(t.key) || !str(t.text) || !str(t.font, 64) || !str(t.color, 64) || !unit(t.x) || !unit(t.y) || !unit(t.size)) return null;
  const state = t.state === 'selected' || t.state === 'related' ? t.state : 'idle';
  return {
    key: t.key as string,
    text: t.text as string,
    font: t.font as string,
    color: t.color as string,
    x: t.x as number,
    y: t.y as number,
    size: t.size as number,
    state,
    ...(str(t.subtitle) ? { subtitle: t.subtitle as string } : {}),
  };
}

function cleanGuess(q: unknown): DisplayGuess | null {
  if (!q || typeof q !== 'object') return null;
  const t = q as Record<string, unknown>;
  if (!Array.isArray(t.keys) || t.keys.length !== 2 || !t.keys.every((k) => str(k)) || !str(t.question, 500)) return null;
  return { keys: [t.keys[0], t.keys[1]], question: t.question as string, source: t.source === 'archive' ? 'archive' : 'name' };
}

// Validates and stores a report; returns an error message if it is unusable.
export function report(body: unknown): DisplayScreen | string {
  if (!body || typeof body !== 'object') return 'expected a JSON object';
  const b = body as Record<string, unknown>;
  if (!str(b.screen, 64)) return 'screen: required string';
  if (!Array.isArray(b.stamps) || b.stamps.length > MAX_STAMPS) return `stamps: array of at most ${MAX_STAMPS}`;
  const stamps = b.stamps.map(cleanStamp).filter((s): s is DisplayStamp => !!s);
  const entry: DisplayScreen = {
    screen: b.screen as string,
    view: b.view === 'constellation' ? 'constellation' : 'wall',
    focus: str(b.focus) ? (b.focus as string) : null,
    stamps,
    guesses: Array.isArray(b.guesses) ? b.guesses.slice(0, MAX_STAMPS).map(cleanGuess).filter((q): q is DisplayGuess => !!q) : [],
    updatedAt: new Date().toISOString(),
  };
  registry.set(entry.screen, entry);
  prune();
  return entry;
}

export function screens(): DisplayScreen[] {
  prune();
  return [...registry.values()];
}

// Every name readable on any active screen: the candidate list for a scan.
export function activeStamps(): (DisplayStamp & { screen: string })[] {
  return screens().flatMap((s) => s.stamps.map((st) => ({ ...st, screen: s.screen })));
}
