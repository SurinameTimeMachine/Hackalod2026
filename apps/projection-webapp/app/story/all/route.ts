// GET /story/all: every saved story, newest first (for the dashboard).
import { connection } from 'next/server';
import { allStories } from '../../server/contributions';

export async function GET() {
  await connection();
  return Response.json(await allStories());
}
