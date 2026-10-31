// Browser side of GET /signals: calls `onSignal` for every server signal
// (see Signal in shared/story.ts). EventSource reconnects by itself after a
// dropped connection or a server restart. Returns a function that stops it.
import type { Signal } from './story';

export function listenSignals(onSignal: (s: Signal) => void): () => void {
  const source = new EventSource('/signals');
  source.onmessage = (e) => {
    try {
      onSignal(JSON.parse(e.data) as Signal);
    } catch {}
  };
  return () => source.close();
}

// Tell the screens which person a phone is now telling about.
export function selectOnScreens(key: string, name: string) {
  return fetch('/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, name }), keepalive: true }).catch(() => {});
}
