// GET /signals: server-sent events for screens (projection, dashboard).
// Each event is one JSON Signal (see shared/story.ts): `select` when a phone
// confirms a person, `story-saved` with exactly what a saved story added.
// Browsers reconnect by themselves; a comment every 20 s keeps proxies open.
import { connection } from 'next/server';
import { subscribe } from '../server/signals';

export async function GET(request: Request) {
  await connection();
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          stop();
        }
      };
      send(': connected\n\n');
      const off = subscribe((s) => send(`data: ${JSON.stringify(s)}\n\n`));
      const ping = setInterval(() => send(': ping\n\n'), 20_000);
      stop = () => {
        off();
        clearInterval(ping);
      };
      request.signal.addEventListener('abort', () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
