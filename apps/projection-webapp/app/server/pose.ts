// In-memory pose relay for searchlight mode: the phone taped to the beamer
// posts its orientation, projections listen on GET /pose. Poses go to
// projection listeners only and are never logged or stored. Several phones:
// the projection follows the one that started most recently.
import type { PoseMessage, PoseStatus } from '../shared/pose';

type Listener = (m: PoseMessage) => void;
type Tracker = { since: number; last: number };
type State = {
  listeners: Set<Listener>;
  trackers: Map<string, Tracker>;
  received: Map<number, number>; // seq → when the server relayed it (recent ones only)
  ack: { seq: number; roundTrip: number } | null;
};

const LIVE = 2000; // ms: a tracker silent this long no longer counts

const g = globalThis as { __pose?: State };
const state = (g.__pose ??= { listeners: new Set(), trackers: new Map(), received: new Map(), ack: null });

function active(now: number): string | null {
  let best: string | null = null;
  let since = -1;
  for (const [id, t] of state.trackers) {
    if (now - t.last > LIVE * 30) state.trackers.delete(id);
    else if (now - t.last < LIVE && t.since > since) [best, since] = [id, t.since];
  }
  return best;
}

// A tracker's pose or calibrate. Returns whether it was relayed (it is the
// active tracker) plus the status the phone shows.
export function fromTracker(id: string, m: PoseMessage): PoseStatus {
  const now = Date.now();
  const t = state.trackers.get(id);
  if (!t || now - t.last > LIVE) state.trackers.set(id, { since: now, last: now });
  else t.last = now;
  const relayed = active(now) === id;
  if (relayed) {
    if (m.type === 'pose') {
      state.received.set(m.seq, now);
      if (state.received.size > 256) state.received.delete(state.received.keys().next().value!);
    }
    for (const l of state.listeners) l(m);
  }
  return { relayed, projections: state.listeners.size, roundTrip: state.ack?.roundTrip ?? null };
}

// A projection says it got pose `seq`: server → projection → server time.
export function ack(seq: number) {
  const at = state.received.get(seq);
  if (at !== undefined) state.ack = { seq, roundTrip: Date.now() - at };
}

export function listen(listener: Listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}
