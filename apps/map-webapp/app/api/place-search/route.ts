import { connection } from 'next/server';

const SQL = `WITH results AS (
  SELECT p.place_norm, p.label, p.records, g.gazetteer_id,
    g.lat, g.lng, g.match_type, g.confidence, z.prefLabel AS gazetteer_label
    FROM places p LEFT JOIN place_geo g ON g.location_norm = p.place_norm
    LEFT JOIN gazetteer z ON z.id = g.gazetteer_id
    WHERE p.place_norm LIKE '%' || :q || '%' ESCAPE '\\'
  UNION ALL
  SELECT 'gazetteer:' || z.id, z.prefLabel, 0, z.id, z.lat, z.lng,
    'gazetteer', NULL, z.prefLabel
    FROM gazetteer z
    WHERE lower(z.prefLabel) LIKE '%' || :q || '%' ESCAPE '\\'
)
SELECT * FROM results
ORDER BY CASE WHEN lower(label) = :q THEN 0 WHEN lower(label) LIKE :q || '%' ESCAPE '\\' THEN 1 ELSE 2 END,
  CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 0 ELSE 1 END,
  length(label), records DESC, place_norm
LIMIT 101`;

export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 100) return Response.json({ error: 'Enter 2 to 100 characters.' }, { status: 400 });
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search.json');
    url.searchParams.set('sql', SQL);
    url.searchParams.set('q', q.toLocaleLowerCase().replace(/[\\%_]/g, '\\$&'));
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Places HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows) || data.truncated) throw new Error('Invalid place response');
    return Response.json({ places: data.rows.slice(0, 100), limited: data.rows.length > 100 });
  } catch (error) {
    console.error('Place search:', error);
    return Response.json({ error: 'Place search is unavailable. Please try again.' }, { status: 502 });
  }
}
