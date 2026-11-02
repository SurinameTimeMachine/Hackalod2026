// In-memory signal bus: the phone's actions reach every open screen through
// GET /signals (server-sent events). One server process, like the display
// registry; nothing is stored.
import type { Signal } from '../shared/story';

type Listener = (s: Signal) => void;
const g = globalThis as { __signalListeners?: Set<Listener> };
const listeners = (g.__signalListeners ??= new Set<Listener>());

export function publish(signal: Signal) {
  for (const l of listeners) l(signal);
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
