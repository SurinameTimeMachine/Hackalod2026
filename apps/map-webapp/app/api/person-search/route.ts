import { connection } from 'next/server';

export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 100) return Response.json({ error: 'Enter 2 to 100 characters.' }, { status: 400 });
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search/person_search.json');
    url.searchParams.set('q', q);
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Search HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows)) throw new Error('Invalid search response');
    return Response.json({ people: data.rows, limited: data.rows.length >= 100 || !!data.truncated });
  } catch (error) {
    console.error('Person search:', error);
    return Response.json({ error: 'Person search is unavailable. Please try again.' }, { status: 502 });
  }
}
