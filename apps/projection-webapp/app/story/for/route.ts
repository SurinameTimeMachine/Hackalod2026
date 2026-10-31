// GET /story/for?key=: saved stories about a person (or naming them), newest
// first, each with its entities and their positions in the text.
import { connection } from 'next/server';
import { storiesFor } from '../../server/contributions';

export async function GET(request: Request) {
  await connection();
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!key) return Response.json({ error: 'key: required' }, { status: 400 });
  return Response.json(await storiesFor(key));
}
