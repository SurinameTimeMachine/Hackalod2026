// One place for where data comes from. Relative URLs: in production /api/* is
// served by Caddy on the same origin, in dev next.config.ts proxies it.
export const API_BASE = '/api/suriname_person_search';

export async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams({ _shape: 'array', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`${API_BASE}/${path}.json?${qs}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export async function snapshot<T>(file: string): Promise<T> {
  const res = await fetch(`/data/${file}`);
  if (!res.ok) throw new Error(`${res.status} ${file}`);
  return res.json();
}

export type Patient = {
  patient_id: number;
  achternaam: string;
  initialen_of_contractnr: string | null;
  geboortejaar: string | null;
  groep: string;
  aantal_vermeldingen: number;
  beste_resultaat: string;
  gevonden_in: string | null;
};

// See scripts/build-snapshot.mjs for how ties are derived.
export type TieRecord = { certificate_id: number; type: string | null; year: number | null; date: string | null };

export type Tie = { record?: TieRecord } & (
  | { kind: 'relation'; from: number; type: string; detail: string | null; confidence: string; certificate_id: number; dataset: string | null }
  | { kind: 'same-record'; certificate_id: number; dataset: string; roles: [string | null, string | null] }
  | { kind: 'same-match'; person_id: number; dataset: string | null }
);

export type PatientEdge = { a: number; b: number; ties: Tie[] };
