// Searchlight pose relay (see README_Searchlight.md).
// POST /pose: the tracker phone sends { id, type: 'pose' | 'pose-zero', … };
//   a projection sends { type: 'pose-ack', seq } about twice a second.
// GET /pose: server-sent events for projections, one JSON PoseMessage each.
import { connection } from 'next/server';
import { ack, fromTracker, listen } from '../server/pose';
import type { PoseMessage } from '../shared/pose';

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (b?.type === 'pose-ack' && num(b.seq)) {
    ack(b.seq);
    return new Response(null, { status: 204 });
  }
  const id = typeof b?.id === 'string' ? b.id.slice(0, 64) : '';
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  let m: PoseMessage;
  if (b.type === 'pose-zero') m = { type: 'pose-zero' };
  else if (b.type === 'pose' && num(b.alpha) && num(b.beta) && num(b.gamma) && num(b.seq))
    m = { type: 'pose', alpha: b.alpha, beta: b.beta, gamma: b.gamma, t: num(b.t) ? b.t : Date.now(), seq: b.seq };
  else return Response.json({ error: 'pose: alpha, beta, gamma, seq required' }, { status: 400 });
  return Response.json(fromTracker(id, m));
}

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
      const off = listen((m) => send(`data: ${JSON.stringify(m)}\n\n`));
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
