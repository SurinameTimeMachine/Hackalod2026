// POST /contribute: save a told story with its entities and narrator.
// See app/server/contributions.ts for what is stored.
import { save, validate } from '../server/contributions';
import { failed, limited } from '../server/guard';
import { publish } from '../server/signals';

export async function POST(request: Request) {
  const block = limited(request);
  if (block) return block;
  const body = await request.json().catch(() => null);
  const req = validate(body);
  if (typeof req === 'string') return Response.json({ error: req }, { status: 400 });
  try {
    const { story, added } = await save(req);
    // Every open screen hears what this story added, to show it right away.
    publish({ type: 'story-saved', key: story.person_key, name: story.person_name, story_id: story.id, narrator: story.narrator.name, added });
    return Response.json({ ok: true, id: story.id, rows: story.entities.filter((e) => e.row_id).length, added });
  } catch (e) {
    return failed('contribute', e);
  }
}
