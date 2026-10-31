import { connection } from 'next/server';

const allowed = new Set(['mh1921_patienten', 'mh1921_vermeldingen', 'mh1921_koppelingen', 'ui_person', 'ui_relations', 'ui_same_name', 'patient_start']);

export async function GET(request: Request, { params }: { params: Promise<{ endpoint: string }> }) {
  await connection();
  const { endpoint } = await params;
  const name = endpoint.replace(/\.json$/, '');
  if (!allowed.has(name) || endpoint !== `${name}.json`) return new Response(null, { status: 404 });
  try {
    const incoming = new URL(request.url);
    const upstream = new URL(`https://hackalod.sbco.design/api/suriname_person_search/${name}.json`);
    upstream.search = incoming.search;
    const response = await fetch(upstream, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) return new Response(null, { status: 502 });
    return new Response(await response.text(), { headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
