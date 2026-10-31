// One place for where data comes from. Relative URLs: in production /api/* is
// served by Caddy on the same origin, in dev next.config.ts proxies it.
import type { ToldGraph } from './story';

export const API_BASE = '/api/suriname_person_search';

export async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams({ _shape: 'array', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`${API_BASE}/${path}.json?${qs}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

// Live queries for the constellation, cached by URL. The promise itself is
// stored, so a repeat click costs nothing and parallel clicks share a request.
// Failed requests are dropped from the cache so they can be retried.
const cache = new Map<string, Promise<unknown>>();

// At most this many archive requests in flight: a growing family tree asks
// for hundreds, and the API is one small server.
const PARALLEL = 6;
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (active >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
  active++;
  try {
    return await work();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function cachedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const key = `${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = limited(() => apiGet<T>(path, params));
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

// What saved stories added around a shared key (GET /story/graph), cached per
// key like the archive queries. Every new story can touch several keys, so a
// `story-saved` signal drops the whole cache.
const stories = new Map<string, Promise<ToldGraph>>();
const NOTHING: ToldGraph = { nodes: [], edges: [], notes: [] };

export function storyGraph(key: string): Promise<ToldGraph> {
  let p = stories.get(key);
  if (!p) {
    p = fetch(`/story/graph?key=${encodeURIComponent(key)}`).then((r) => (r.ok ? (r.json() as Promise<ToldGraph>) : NOTHING));
    stories.set(key, p);
    p.catch(() => stories.delete(key));
  }
  return p.catch(() => NOTHING);
}

export const forgetStories = () => stories.clear();

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

// Rows of the canned queries used by the constellation.
export type PatientStartRow = {
  soort: 'patient' | 'vermelding' | 'koppeling';
  id: number;
  person_id: number | null;
  certificate_id: number | null;
  naam: string | null;
  dataset: string | null;
  jaar: string | number | null;
  resultaat: string | null;
  rol: string | null;
  methode: string | null;
  toelichting: string | number | null;
};

export type PersonRow = {
  person_id: number;
  certificate_id: number;
  source_dataset: string;
  full_name: string | null;
  role: string | null;
  event_year: number | null;
  record_type: string | null;
  record_date: string | null;
  record_event_date: string | null;
};

export type RelationRow = {
  relation_type: string;
  confidence: string;
  detail: string | null;
  certificate_id: number;
  direction: 'in' | 'out';
  other_id: number;
  other_name: string | null;
  other_role: string | null;
  other_dataset: string | null;
  other_year: number | null;
};

export type RecordPersonRow = { person_id: number; full_name: string | null; role: string | null };

export type SameNameRow = {
  person_id: number;
  full_name: string | null;
  role: string | null;
  source_dataset: string | null;
  year: number | null;
  via: string | null;
};

export type Vermelding = { patient_id: number; person_id: number | null };
export type Koppeling = { patient_id: number; doel_person_id: number | null; resultaat: string };
