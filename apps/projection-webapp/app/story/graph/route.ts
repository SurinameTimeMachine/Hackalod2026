// GET /story/graph?key=: everything saved stories added around a person
// (told relatives, storytellers, relations, notes), to merge into their
// constellation whenever it is opened.
import { connection } from 'next/server';
import { graphFor } from '../../server/contributions';

export async function GET(request: Request) {
  await connection();
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!key) return Response.json({ error: 'key: required' }, { status: 400 });
  return Response.json(await graphFor(key));
}
