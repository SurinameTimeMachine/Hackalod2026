export type PeoplePlace = {
  id: string;
  uri: string | null;
  label: string;
  type: string;
  lat: number;
  lng: number;
  person_count: number;
};

export type PeopleCluster = PeoplePlace & {
  center: [number, number];
  radiusMeters: number;
  placement: 'plantation-interior' | 'gazetteer-point';
  sizeCapped: boolean;
};

export type PeopleResponse = {
  clusters: PeopleCluster[];
  fetchedAt: string;
  omitted: number;
};

// Count attestations, not names. A person_id can occur at several places,
// but repeated spellings/locations on the same certificate count only once.
export function peopleQuery() {
  return `WITH linked AS (
    SELECT DISTINCT g.gazetteer_id, l.certificate_id
    FROM place_geo g
    JOIN places pl ON pl.place_norm = g.location_norm
    JOIN locations l ON l.location_norm = g.location_norm
    WHERE g.gazetteer_id IS NOT NULL AND g.lat IS NOT NULL AND g.lng IS NOT NULL
  ), counts AS (
    SELECT l.gazetteer_id, COUNT(DISTINCT p.person_id) AS person_count
    FROM linked l JOIN persons p ON p.certificate_id = l.certificate_id
    GROUP BY l.gazetteer_id
  )
  SELECT z.id, z.uri, z.prefLabel AS label, z.type, z.lat, z.lng, c.person_count
  FROM counts c JOIN gazetteer z ON z.id = c.gazetteer_id
  WHERE z.lat IS NOT NULL AND z.lng IS NOT NULL
  ORDER BY z.id`;
}

export function parsePeoplePage(value: unknown): PeoplePlace[] {
  const page = value as { ok?: boolean; rows?: unknown[]; truncated?: boolean };
  if (!page || page.ok !== true || !Array.isArray(page.rows) || page.truncated !== false) {
    throw new Error('People API returned an incomplete or invalid page');
  }
  return page.rows.map((value) => {
    const row = value as PeoplePlace;
    if (!row || typeof row.id !== 'string' || typeof row.label !== 'string' ||
        (row.uri !== null && typeof row.uri !== 'string') || typeof row.type !== 'string' ||
        !Number.isFinite(row.lat) || !Number.isFinite(row.lng) ||
        Math.abs(row.lat) > 85 || Math.abs(row.lng) > 180 ||
        !Number.isSafeInteger(row.person_count) || row.person_count < 1) {
      throw new Error(`People API returned an invalid place or count: ${row?.id}`);
    }
    return row;
  });
}

// One aggregate response avoids Datasette's 1,000-row cap and repeated full
// joins for pagination. The count verifies that the entire payload arrived.
export function peoplePayloadQuery() {
  return `WITH points AS (${peopleQuery()})
    SELECT COUNT(*) AS place_count, json_group_array(json_object(
      'id', id, 'uri', uri, 'label', label, 'type', type,
      'lat', lat, 'lng', lng, 'person_count', person_count
    )) AS places FROM points`;
}

export function parsePeoplePayload(value: unknown): PeoplePlace[] {
  const payload = value as { ok?: boolean; truncated?: boolean; rows?: {place_count: number; places: string}[] };
  if (!payload || payload.ok !== true || payload.truncated !== false || payload.rows?.length !== 1) {
    throw new Error('People API returned an incomplete aggregate');
  }
  const result = payload.rows[0];
  const rows = parsePeoplePage({ok: true, truncated: false, rows: JSON.parse(result.places)});
  if (rows.length !== result.place_count || new Set(rows.map(r => r.id)).size !== rows.length) {
    throw new Error('People API count or unique place IDs do not match');
  }
  return rows;
}
