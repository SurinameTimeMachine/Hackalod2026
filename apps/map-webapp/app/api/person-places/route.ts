import { connection } from 'next/server';

export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) return Response.json({ error: 'Invalid person record.' }, { status: 400 });
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search/person_places.json');
    url.searchParams.set('id', id);
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Places HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows)) throw new Error('Invalid places response');
    const ids = [...new Set(data.rows.filter((r: { relation?: string; gazetteer_id?: string }) => r.relation === 'own' && typeof r.gazetteer_id === 'string').map((r: { gazetteer_id: string }) => r.gazetteer_id))];
    return Response.json({ ids, limited: !!data.truncated || data.rows.length >= 1000 });
  } catch (error) {
    console.error('Person places:', error);
    return Response.json({ error: 'Connected places could not load. Please try again.' }, { status: 502 });
  }
}
