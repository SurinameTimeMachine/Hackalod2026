// Archive reads for the story routes (Datasette canned queries, read-only),
// plus resolving what the model heard to archive matches. Resolving happens
// here in code, never in the model.
import { datasetLabel, FACT } from '../scan/strings';
import type { MatchOption, PersonContext } from '../shared/story';
import { parseKey } from '../shared/keys';
import { ARCHIVE } from './config';
import { lifeLabel, lifeOf, type Life } from './lifetime';

const cache = new Map<string, Promise<unknown>>();

function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams({ _shape: 'array', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const url = `${ARCHIVE}/${path}.json?${qs}`;
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url, { signal: AbortSignal.timeout(15_000) }).then((r) => {
      if (!r.ok) throw new Error(`archive ${r.status} ${path}`);
      return r.json() as Promise<T>;
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

type Row = Record<string, string | number | null>;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

const MAX_RECORDS = 6; // own attestations followed per person, to bound requests

// Everyone and everywhere one attestation's record leads to.
async function around(personId: number, cert: number | null, out: PersonContext) {
  const [relations, me] = await Promise.all([get<Row[]>('ui_relations', { id: personId }), get<Row[]>('ui_person', { id: personId, key: '' })]);
  const c = cert ?? num(me[0]?.certificate_id);
  const [onRecord, places] = c
    ? await Promise.all([get<Row[]>('ui_record_persons', { cert: c }), get<Row[]>('ui_record_places', { cert: c })])
    : [[], []];
  for (const r of relations.slice(0, 40))
    out.related.push({ key: `person:${r.other_id}`, name: str(r.other_name) ?? '?', role: str(r.relation_type), year: num(r.other_year), dataset: str(r.other_dataset) });
  for (const o of onRecord.slice(0, 40))
    if (o.person_id !== personId)
      out.related.push({ key: `person:${o.person_id}`, name: str(o.full_name) ?? '?', role: str(o.role), year: num(me[0]?.event_year), dataset: str(me[0]?.source_dataset) });
  for (const p of places) if (p.raw_text) out.places.push(String(p.raw_text));
  return me[0];
}

const contexts = new Map<string, Promise<PersonContext | null>>();

export function buildContext(key: string): Promise<PersonContext | null> {
  let p = contexts.get(key);
  if (!p) {
    p = loadContext(key);
    contexts.set(key, p);
    p.catch(() => contexts.delete(key));
  }
  return p;
}

async function loadContext(key: string): Promise<PersonContext | null> {
  const k = parseKey(key);
  if (!k || k.kind === 'name') return null;
  const ctx: PersonContext = { key, name: '', surname: null, facts: [], birthYear: null, related: [], places: [] };

  if (k.kind === 'patient') {
    const [patient] = await get<Row[]>('mh1921_patienten', { patient_id: k.id });
    if (!patient) return null;
    ctx.name = [patient.achternaam, patient.initialen_of_contractnr].filter(Boolean).join(' ');
    ctx.surname = str(patient.achternaam)?.replace(/,.*$/, '') ?? null;
    ctx.birthYear = num(patient.geboortejaar);
    if (ctx.birthYear) ctx.facts.push({ label: FACT.born, value: String(ctx.birthYear) });
    ctx.facts.push({ label: FACT.was, value: FACT.wasValue });
    const found = str(patient.gevonden_in);
    if (found) ctx.facts.push({ label: FACT.found, value: found.split(',').map((d) => datasetLabel(d.trim())).join(', ') });
    const rows = await get<Row[]>('patient_start', { patient_id: k.id });
    const own = rows.filter((r) => r.person_id && (r.soort === 'vermelding' || (r.soort === 'koppeling' && r.resultaat === 'zeker')));
    await Promise.allSettled(own.slice(0, MAX_RECORDS).map((r) => around(Number(r.person_id), num(r.certificate_id), ctx)));
  } else {
    const me = await around(k.id, null, ctx);
    if (!me) return null;
    ctx.name = str(me.full_name) ?? '?';
    ctx.surname = str(me.surname);
    const age = num(me.age_numeric);
    const year = num(me.event_year);
    if (age && year) ctx.birthYear = year - age;
    if (me.role) ctx.facts.push({ label: FACT.role, value: String(me.role) });
    if (year) ctx.facts.push({ label: FACT.year, value: String(year) });
    if (me.record_place) ctx.facts.push({ label: FACT.place, value: String(me.record_place) });
    ctx.facts.push({ label: FACT.source, value: datasetLabel(str(me.source_dataset)) });
  }

  // Unique, the patient's own attestations left out.
  const seen = new Set<string>();
  ctx.related = ctx.related.filter((r) => r.name !== '?' && !seen.has(r.key) && seen.add(r.key));
  ctx.places = [...new Set(ctx.places)];
  return ctx;
}

// --- Resolving ------------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['de', 'het', 'een', 'aan', 'in', 'te', 'op', 'van', 'bij', 'the', 'en']);

export async function searchPlaces(raw: string): Promise<MatchOption[]> {
  const words = fold(raw)
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .slice(0, 6);
  if (!words.length) return [];
  const params = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`w${i + 1}`, words[i] ?? '']));
  const rows = await get<Row[]>('ui_places', params);
  return rows.slice(0, 4).map((r) => ({
    id: `place:${r.place_norm}`,
    label: String(r.label ?? r.place_norm),
    detail: `${r.records} vermeldingen · ${String(r.datasets ?? '').split(',').map(datasetLabel).join(', ')}`,
  }));
}

// People by name, with their possible lifetime (see lifetime.ts). Callers
// filter by what the story says, then trim.
export async function searchPeople(q: string, around?: number | null): Promise<MatchOption[]> {
  if (q.trim().length < 2) return [];
  const rows = await get<Row[]>('person_search', { q: q.trim() });
  return rows
    .map((r) => {
      const year = num(r.event_year);
      const role = str(r.role);
      const ds = str(r.source_dataset);
      const life = lifeOf(role, year, ds);
      return {
        id: `person:${r.person_id}`,
        label: String(r.full_name ?? '?'),
        detail: [lifeLabel(role, year, ds, str(r.location)), datasetLabel(ds)].join(' · '),
        place: str(r.location),
        ...life,
        year,
      };
    })
    .filter((r) => !around || !r.year || Math.abs(r.year - around) <= 90)
    .slice(0, 40)
    .map((r): MatchOption => ({ id: r.id, label: r.label, detail: r.detail, place: r.place, born: r.born, died: r.died }));
}

// The chosen record's own lifetime, to check it against the story.
export async function lifeOfKey(key: string): Promise<Life | null> {
  const k = parseKey(key);
  if (!k || k.kind === 'name') return null;
  if (k.kind === 'patient') {
    const [p] = await get<Row[]>('mh1921_patienten', { patient_id: k.id });
    const born = num(p?.geboortejaar);
    return { born: born ? [born, born] : null, died: [1921, (born ?? 1921) + 105] };
  }
  const [me] = await get<Row[]>('ui_person', { id: k.id, key: '' });
  return me ? lifeOf(str(me.role), num(me.event_year), str(me.source_dataset), num(me.age_numeric)) : null;
}
