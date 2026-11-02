import { connection } from 'next/server';

// Patient IDs belong to the hospital register, not the persons table.
// Only use the patient's own recorded mentions; suggested matches may be ambiguous.
export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) return Response.json({ error: 'Invalid patient.' }, { status: 400 });
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search.json');
    url.searchParams.set('sql', `SELECT DISTINCT g.gazetteer_id
      FROM mh1921_vermeldingen v
      JOIN persons p ON p.person_id = v.person_id
      JOIN locations l ON l.certificate_id = p.certificate_id
      JOIN place_geo g ON g.location_norm = l.location_norm
      JOIN places pl ON pl.place_norm = g.location_norm
      JOIN gazetteer z ON z.id = g.gazetteer_id
      WHERE v.patient_id = :id AND g.lat IS NOT NULL AND g.lng IS NOT NULL
        AND z.lat IS NOT NULL AND z.lng IS NOT NULL
      ORDER BY g.gazetteer_id`);
    url.searchParams.set('id', id);
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Places HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.rows)) throw new Error('Invalid places response');
    const ids = [...new Set(data.rows.map((r: { gazetteer_id?: unknown }) => r.gazetteer_id).filter((value: unknown): value is string => typeof value === 'string'))];
    return Response.json({ ids, limited: !!data.truncated || data.rows.length >= 1000 });
  } catch (error) {
    console.error('Patient places:', error);
    return Response.json({ error: 'Connected places could not load.' }, { status: 502 });
  }
}
