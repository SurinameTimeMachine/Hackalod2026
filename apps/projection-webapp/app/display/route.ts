// Display registry. Screens POST what they show whenever their view changes;
// GET returns the registry (debug, and later the scan's candidate list).
//   GET /display              all active screens
//   GET /display?screen=wall  one screen
//   GET /display?stamps=1     flat list of every visible name across screens
import { connection } from 'next/server';
import { activeStamps, report, screens } from '../server/display';

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  if (params.has('stamps')) return Response.json(activeStamps());
  const screen = params.get('screen');
  const all = screens();
  if (!screen) return Response.json(all);
  const one = all.find((s) => s.screen === screen);
  return one ? Response.json(one) : Response.json({ error: `no active screen "${screen}"` }, { status: 404 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const result = report(body);
  if (typeof result === 'string') return Response.json({ error: result }, { status: 400 });
  return Response.json({ ok: true, screen: result.screen, stamps: result.stamps.length, updatedAt: result.updatedAt });
}
