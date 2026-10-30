import { connection } from 'next/server';

// The same location_norm -> place_geo -> certificate join as the map counts.
const SQL = (filtered: boolean) => `WITH recs AS (
  SELECT DISTINCT l.certificate_id FROM locations l
  JOIN place_geo g ON g.location_norm = l.location_norm
  WHERE g.gazetteer_id = :place
)
SELECT p.person_id, p.full_name, p.role, p.source_dataset, p.event_year
FROM persons p JOIN recs ON p.certificate_id = recs.certificate_id
${filtered ? 'WHERE p.event_year BETWEEN :year_from AND :year_to' : ''}
ORDER BY p.person_id LIMIT 51 OFFSET :offset`;

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const id = params.get('id') ?? '';
  const offset = Number(params.get('offset') ?? '0');
  const from = params.get('from'), to = params.get('to');
  if ((from !== null || to !== null) && (!from || !to || !/^\d{1,4}$/.test(from) || !/^\d{1,4}$/.test(to) || Number(from) < 1 || Number(from) > Number(to))) return Response.json({ error: 'Invalid year range.' }, { status: 400 });
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    return Response.json({ error: 'Invalid place or page.' }, { status: 400 });
  }
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search.json');
    url.searchParams.set('sql', SQL(from !== null));
    if (from && to) { url.searchParams.set('year_from', from); url.searchParams.set('year_to', to); } url.searchParams.set('place', id);
    url.searchParams.set('offset', String(offset)); url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Place wall HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows) || data.truncated) throw new Error('Invalid place wall response');
    return Response.json({ people: data.rows.slice(0, 50), more: data.rows.length > 50 });
  } catch (error) {
    console.error('Place wall:', error);
    return Response.json({ error: 'The wall could not load. Please try again.' }, { status: 502 });
  }
}
