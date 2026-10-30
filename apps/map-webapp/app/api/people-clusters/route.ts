import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { connection } from 'next/server';
import linksData from '../../lib/data/plantation-gazetteer.json';
import { parsePeoplePayload, peoplePayloadQuery, type PeopleResponse } from '../../lib/people-data';
import { placeCluster, type PolygonGeometry } from '../../lib/people-placement';

const API = 'https://hackalod.sbco.design/api/suriname_person_search.json';
const links: Record<string, { placeId: string; lat: number; lng: number }> = linksData;
let cached: { expires: number; value: PeopleResponse } | undefined;
let pending: Promise<PeopleResponse> | undefined;

async function loadClusters(): Promise<PeopleResponse> {
  const url = new URL(API);
  url.searchParams.set('sql', peoplePayloadQuery());
  url.searchParams.set('_shape', 'objects');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!response.ok) throw new Error(`People API HTTP ${response.status}`);
  const people = parsePeoplePayload(await response.json());

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

export async function GET() {
  await connection(); // Fetch at request time, never during build/prerender.
  try {
    if (cached && cached.expires > Date.now()) return Response.json(cached.value);
    pending ??= loadClusters().then(value => {
      cached = { expires: Date.now() + 300000, value };
      return value;
    }).finally(() => { pending = undefined; });
    return Response.json(await pending);
  } catch (error) {
    console.error('People clusters:', error);
    return Response.json({ error: 'People could not load. The landscape is still available.' }, { status: 502 });
  }
}
