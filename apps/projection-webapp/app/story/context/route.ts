// GET /story/context?key=: what the archive says about a key (name, facts for
// the "found" card, related people and places).
import { connection } from 'next/server';
import { buildContext } from '../../server/archive';
import { failed } from '../../server/guard';

export async function GET(request: Request) {
  await connection();
  const key = new URL(request.url).searchParams.get('key') ?? '';
  try {
    const ctx = await buildContext(key);
    return ctx ? Response.json(ctx) : Response.json({ error: `unknown key "${key}"` }, { status: 404 });
  } catch (e) {
    return failed('story/context', e);
  }
}
