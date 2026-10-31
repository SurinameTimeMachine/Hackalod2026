// POST /contribute: save a told story with its entities and narrator.
// See app/server/contributions.ts for what is stored.
import { save, validate } from '../server/contributions';
import { failed, limited } from '../server/guard';

export async function POST(request: Request) {
  const block = limited(request);
  if (block) return block;
  const body = await request.json().catch(() => null);
  const req = validate(body);
  if (typeof req === 'string') return Response.json({ error: req }, { status: 400 });
  try {
    const story = await save(req);
    return Response.json({ ok: true, id: story.id, rows: story.entities.filter((e) => e.row_id).length });
  } catch (e) {
    return failed('contribute', e);
  }
}
