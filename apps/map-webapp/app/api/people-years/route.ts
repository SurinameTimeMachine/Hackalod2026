import { connection } from 'next/server';

export async function GET() {
  await connection();
  try {
    const url = new URL('https://hackalod.sbco.design/api/suriname_person_search.json');
    url.searchParams.set('sql', 'SELECT MIN(event_year) AS min_year, MAX(event_year) AS max_year FROM persons WHERE event_year IS NOT NULL');
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Years HTTP ${response.status}`);
    const data = await response.json();
    const row = data.rows?.[0];
    if (!data.ok || data.truncated || !Number.isInteger(row?.min_year) || !Number.isInteger(row?.max_year) || row.min_year < 1 || row.max_year > 9999 || row.min_year >= row.max_year) throw new Error('Invalid year range');
    return Response.json({ min: row.min_year, max: row.max_year });
  } catch (error) {
    console.error('People years:', error);
    return Response.json({ error: 'Years unavailable' }, { status: 502 });
  }
}
