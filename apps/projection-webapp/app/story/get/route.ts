// GET /story/get?id=: one saved story plus the dataset rows it produced.
import { connection } from 'next/server';
import { getStory } from '../../server/contributions';

export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const found = await getStory(id);
  return found ? Response.json(found) : Response.json({ error: `no story "${id}"` }, { status: 404 });
}
