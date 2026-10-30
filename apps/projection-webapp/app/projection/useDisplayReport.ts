// Tells the display registry (POST /display) which names this screen shows.
// Sent when the view settles (debounced, unchanged views skipped), and again
// every few minutes so the server does not drop an idle wall as stale.
import { useEffect, useRef } from 'react';
import type { DisplayReport } from '../shared/display';

const SETTLE = 500; // ms after the last change
const HEARTBEAT = 5 * 60_000;

function send(body: string) {
  return fetch('/display', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60_000 }).then(
    (r) => r.ok,
    () => false,
  );
}

export function useDisplayReport(report: DisplayReport | null) {
  const last = useRef<string | null>(null);
  const body = report ? JSON.stringify(report) : null;

  useEffect(() => {
    if (!body || body === last.current) return;
    const t = setTimeout(() => {
      send(body).then((ok) => {
        if (ok) last.current = body;
      });
    }, SETTLE);
    return () => clearTimeout(t);
  }, [body]);

  useEffect(() => {
    if (!body) return;
    const t = setInterval(() => send(body), HEARTBEAT);
    return () => clearInterval(t);
  }, [body]);
}
