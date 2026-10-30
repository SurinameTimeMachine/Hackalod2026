// Builds the static snapshots the projection falls back to (and uses for
// patient-to-patient relations until a canned query exists for them).
//
//   node scripts/build-snapshot.mjs
//   node scripts/build-snapshot.mjs --respect-embargo   (skip embargoed datasets)
//
// Writes:
//   public/data/mh1921_patienten.json   – the wall (516 rows, as in the API)
//   public/data/patient_relations.json  – known ties between two patients on the wall
//
// A tie is only recorded when the archive says so:
//   - relation:     a row in `relations` between an attestation of patient A
//                   and an attestation of patient B (e.g. parent-child, spouse, witness)
//   - same-record:  attestations of A and B appear on the same certificate
//   - same-match:   A and B were both linked to the same archive person
//                   (ambiguous match; shown as "possibly the same person")
// Patient attestations = mh1921_vermeldingen.person_id + mh1921_koppelingen.doel_person_id,
// plus one hop of `same-person` relations from those. An attestation claimed by
// more than one patient is ambiguous: it only yields a same-match tie, never a
// relation or same-record tie (that would credit one person's family to both).
// The patient's own mh1921_vermeldingen rows are always theirs alone.
//
// Embargoed datasets (flagged in `sources`: migration registers, civil records,
// Madeisu) are used by default, since this is a short-lived on-site prototype;
// nearly all ties come from them. --respect-embargo leaves them out.

import { writeFile, mkdir } from 'node:fs/promises';

const API_BASE = 'https://hackalod.sbco.design/api/suriname_person_search';
const BATCH = 60;
const RESPECT_EMBARGO = process.argv.includes('--respect-embargo');

async function get(path, params = {}) {
  const url = new URL(`${API_BASE}/${path}.json`);
  url.searchParams.set('_shape', 'array');
  url.searchParams.set('_size', 'max');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function inBatches(ids, fn) {
  const out = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += BATCH) {
    out.push(...(await fn(list.slice(i, i + BATCH).join(','))));
  }
  return out;
}

const relationsOf = (ids) =>
  inBatches(ids, async (csv) => [
    ...(await get('relations', { from_person__in: csv })),
    ...(await get('relations', { to_person__in: csv })),
  ]);

const embargoed = new Set(
  RESPECT_EMBARGO ? (await get('sources')).filter((s) => s.embargo).map((s) => s.source_dataset) : [],
);
console.log(RESPECT_EMBARGO ? `embargoed datasets (skipped): ${[...embargoed].join(', ')}` : 'including embargoed datasets');

const patienten = await get('mh1921_patienten');
const vermeldingen = await get('mh1921_vermeldingen');
const koppelingen = await get('mh1921_koppelingen');
console.log(`patients ${patienten.length}, mentions ${vermeldingen.length}, links ${koppelingen.length}`);

// patient -> set of attestation ids
const personsOf = new Map(patienten.map((p) => [p.patient_id, new Set()]));
const directMatch = new Map(); // person_id -> patients that were matched to it directly
for (const v of vermeldingen) if (v.person_id) personsOf.get(v.patient_id).add(v.person_id);
for (const k of koppelingen) {
  if (!k.doel_person_id) continue;
  personsOf.get(k.patient_id).add(k.doel_person_id);
  if (!directMatch.has(k.doel_person_id)) directMatch.set(k.doel_person_id, new Set());
  directMatch.get(k.doel_person_id).add(k.patient_id);
}

// one hop of same-person
const seed = new Set([...personsOf.values()].flatMap((s) => [...s]));
const seedRels = await relationsOf(seed);
for (const r of seedRels) {
  if (r.relation_type !== 'same-person') continue;
  for (const set of personsOf.values()) {
    if (set.has(r.from_person)) set.add(r.to_person);
    else if (set.has(r.to_person)) set.add(r.from_person);
  }
}

const owner = new Map(); // person_id -> Set(patient_id)
for (const [pid, set] of personsOf)
  for (const id of set) {
    if (!owner.has(id)) owner.set(id, new Set());
    owner.get(id).add(pid);
  }
for (const v of vermeldingen) if (v.person_id) owner.set(v.person_id, new Set([v.patient_id]));
const allPersons = new Set(owner.keys());
console.log(`attestations after same-person hop: ${allPersons.size}`);

const extra = [...allPersons].filter((id) => !seed.has(id));
const rels = [...seedRels, ...(await relationsOf(extra))];
const persons = await inBatches(allPersons, (csv) => get('persons', { person_id__in: csv }));
const personById = new Map(persons.map((p) => [p.person_id, p]));

const edges = new Map(); // "a-b" -> edge
function addTie(a, b, tie) {
  if (a === b) return;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const key = `${lo}-${hi}`;
  if (!edges.has(key)) edges.set(key, { a: lo, b: hi, ties: [] });
  const e = edges.get(key);
  const sig = JSON.stringify(tie);
  if (!e.ties.some((t) => JSON.stringify(t) === sig)) e.ties.push(tie);
}

const open = (id) => {
  const ds = personById.get(id)?.source_dataset;
  return ds != null && !embargoed.has(ds);
};
const unique = (id) => owner.get(id)?.size === 1 && open(id);

const seenRel = new Set();
for (const r of rels) {
  if (seenRel.has(r.relation_id) || r.relation_type === 'same-person') continue;
  seenRel.add(r.relation_id);
  if (!unique(r.from_person) || !unique(r.to_person)) continue;
  const from = owner.get(r.from_person);
  const to = owner.get(r.to_person);
  for (const a of from)
    for (const b of to)
      addTie(a, b, {
        kind: 'relation',
        from: a, // patient holding the from_person side (e.g. the parent in parent-child)
        type: r.relation_type,
        detail: r.detail,
        confidence: r.confidence,
        certificate_id: r.certificate_id,
        dataset: personById.get(r.to_person).source_dataset,
      });
}

const byCert = new Map();
for (const p of persons) {
  if (!unique(p.person_id)) continue;
  if (!byCert.has(p.certificate_id)) byCert.set(p.certificate_id, []);
  byCert.get(p.certificate_id).push(p);
}
for (const [cert, ps] of byCert)
  for (const x of ps)
    for (const y of ps)
      for (const a of owner.get(x.person_id))
        for (const b of owner.get(y.person_id))
          if (a < b)
            addTie(a, b, {
              kind: 'same-record',
              certificate_id: cert,
              dataset: x.source_dataset,
              roles: [x.role, y.role],
            });

for (const [personId, pats] of directMatch)
  if (open(personId))
  for (const a of pats)
    for (const b of pats)
      if (a < b)
        addTie(a, b, {
          kind: 'same-match',
          person_id: personId,
          dataset: personById.get(personId)?.source_dataset ?? null,
        });

// The record each tie rests on, so the wall can cite it.
const certOf = (t) => t.certificate_id ?? personById.get(t.person_id)?.certificate_id;
const certIds = new Set([...edges.values()].flatMap((e) => e.ties.map(certOf)).filter(Boolean));
const certs = new Map(
  (await inBatches(certIds, (csv) => get('certificates', { certificate_id__in: csv }))).map((c) => [c.certificate_id, c]),
);
for (const e of edges.values())
  for (const t of e.ties) {
    const c = certs.get(certOf(t));
    if (c) t.record = { certificate_id: c.certificate_id, type: c.record_type, year: c.event_year, date: c.event_date };
  }

const out = [...edges.values()].sort((x, y) => x.a - y.a || x.b - y.b);
const kinds = {};
for (const e of out) for (const t of e.ties) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
console.log(`patient pairs with a tie: ${out.length}`, kinds);

const dir = new URL('../public/data/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('mh1921_patienten.json', dir), JSON.stringify(patienten));
await writeFile(
  new URL('patient_relations.json', dir),
  JSON.stringify({ generated: new Date().toISOString(), source: API_BASE, edges: out }, null, 1),
);
