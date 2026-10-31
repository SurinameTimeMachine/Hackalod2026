import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { connection } from 'next/server';
import linksData from '../../lib/data/plantation-gazetteer.json';
import { parsePeoplePayload, peoplePayloadQuery, peoplePayloadQueryFast, type PeopleResponse } from '../../lib/people-data';
import { placeCluster, type PolygonGeometry } from '../../lib/people-placement';

const API = 'https://hackalod.sbco.design/api/suriname_person_search.json';
const links: Record<string, { placeId: string; lat: number; lng: number }> = linksData;
const cached = new Map<string, { expires: number; value: PeopleResponse }>();
const pending = new Map<string, Promise<PeopleResponse>>();

async function loadClusters(years?: [number, number]): Promise<PeopleResponse> {
  const query = async (sql: string, timeout: number) => {
    const url = new URL(API);
    url.searchParams.set('sql', sql);
    if (years) { url.searchParams.set('year_from', String(years[0])); url.searchParams.set('year_to', String(years[1])); }
    url.searchParams.set('_shape', 'objects');
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    if (!response.ok) throw new Error(`People API HTTP ${response.status}`);
    return parsePeoplePayload(await response.json());
  };
  // Without a time range, read the precomputed counts (instant); fall back to the live
  // aggregate (~20 s) when the archive database does not have map_place_counts yet.
  let people;
  if (!years) {
    try { people = await query(peoplePayloadQueryFast(), 15000); } catch { people = undefined; }
  }
  people ??= await query(peoplePayloadQuery(!!years), 65000);

  const collection = JSON.parse(await readFile(path.join(process.cwd(), 'public/data/plantations-1930.geojson'), 'utf8')) as {
    features: { properties: { placeId: string }; geometry: PolygonGeometry }[];
  };
  const polygons = new Map(collection.features.map(f => [f.properties.placeId, f.geometry]));
  const clusters: PeopleResponse['clusters'] = [];
  let omitted = 0;
  for (const place of people) {
    const link = links[place.id];
    // Snapshot join: only trust a stable ID when its coordinates still agree.
    const matches = link && place.type === 'plantation' &&
      Math.abs(link.lng - place.lng) < 0.00001 && Math.abs(link.lat - place.lat) < 0.00001;
    const cluster = placeCluster(place, matches ? polygons.get(link.placeId) : undefined);
    if (cluster) clusters.push(cluster); else omitted++;
  }
  return { clusters, omitted, fetchedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const from = params.get('from'), to = params.get('to');
  let years: [number, number] | undefined;
  if (from !== null || to !== null) {
    if (!from || !to || !/^\d{1,4}$/.test(from) || !/^\d{1,4}$/.test(to) || Number(from) < 1 || Number(from) > Number(to)) return Response.json({ error: 'Invalid year range' }, { status: 400 });
    years = [Number(from), Number(to)];
  }
  const key = years ? years.join('-') : 'all';
  try {
    const entry = cached.get(key);
    if (entry && entry.expires > Date.now()) return Response.json(entry.value);
    let task = pending.get(key);
    if (!task) {
      task = loadClusters(years).then(value => {
        // Bound the server memory used by exploratory time ranges.
        if (cached.size >= 20) cached.delete(cached.keys().next().value!);
        cached.set(key, { expires: Date.now() + 300000, value });
        return value;
      }).finally(() => { pending.delete(key); });
      pending.set(key, task);
    }
    return Response.json(await task);
  } catch (error) {
    console.error('People clusters:', error);
    return Response.json({ error: 'People could not load. The landscape is still available.' }, { status: 502 });
  }
}
