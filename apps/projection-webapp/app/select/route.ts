// POST /select { key, name? }: a phone confirmed this person; screens can
// open their constellation while the visitor tells the story.
import { publish } from '../server/signals';
import { parseKey } from '../shared/keys';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!parseKey(key)) return Response.json({ error: 'key: patient:/person:/name: key required' }, { status: 400 });
  publish({ type: 'select', key, name: typeof body?.name === 'string' ? body.name.slice(0, 200) : null });
  return Response.json({ ok: true });
}
