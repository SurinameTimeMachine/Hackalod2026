// The constellation as one growing graph, fetched live per click. These are
// the pure parts: node/edge shapes and what each kind of click asks the API.
// Wording lives in shared/strings.ts; nothing here invents a relation.
import {
  cachedGet,
  type PatientStartRow,
  type PersonRow,
  type RelationRow,
  type SameNameRow,
} from '../shared/api';
import { isFamily, nodeCaption, recordReference, relationReason, sameNameReference, SAME_PERSON } from '../shared/strings';

// 'p:<patient_id>' | 'x:<person_id>' | 's:<parent>|<group>'
// | 't:<shared key>' for people only a story knows (told:… relatives, name:… storytellers)
export type NodeKey = string;

export type GNode = {
  key: NodeKey;
  kind: 'patient' | 'person' | 'summary' | 'told' | 'narrator';
  patientId?: number;
  personId?: number;
  name: string;
  caption?: string;
  certificateId?: number | null;
  hidden?: Found[]; // summary: names not yet shown
  truncated?: boolean; // summary: the API capped the rows
};

export type GEdge = {
  key: string;
  from: NodeKey; // drawn from this side (the expanded node)
  to: NodeKey;
  certain: boolean;
  reason: string;
  reference: string;
  parent?: NodeKey; // a parent-child line: which end is the parent (drawn above)
  generations?: number; // how many generations the parent line spans (grandparent: 2)
  level?: boolean; // spouses, partners, siblings: drawn side by side
};

// Lines that put one end a generation above the other; `declarant` only
// counts as family on an acknowledgement deed, where it is the parent.
const DOWN = new Set(['parent-child', 'foster', 'declarant']);
const LEVEL = new Set(['spouse', 'partner', 'sibling']);
export const shape = (type: string, parent: NodeKey) => ({
  ...(DOWN.has(type) ? { parent } : {}),
  ...(LEVEL.has(type) ? { level: true } : {}),
});

// Two records taken to be one person so the tree could go on: the archive's
// own probable link, or the same name. Shown dashed; the phone can ask a
// visitor whether it is right.
export type Guess = {
  key: string;
  a: { id: number; name: string; record: string };
  b: { id: number; name: string; record: string };
  source: 'archive' | 'name';
};

// One name reached from the expanded node, with the line that explains it.
export type Found = { node: GNode; edge: GEdge; family: boolean; group: string };

export type Context = {
  patientOf: (personId: number) => number | undefined;
  patientName: (patientId: number) => string;
};

export const patientKey = (id: number): NodeKey => `p:${id}`;
const personKey = (id: number): NodeKey => `x:${id}`;
const edgeKey = (a: NodeKey, b: NodeKey, why: string) => `${[a, b].sort().join('~')}|${why}`;

function personNode(ctx: Context, id: number, name: string | null, role: string | null, caption: string, cert?: number | null): GNode {
  const pid = ctx.patientOf(id);
  if (pid !== undefined) return { key: patientKey(pid), kind: 'patient', patientId: pid, name: ctx.patientName(pid) };
  return {
    key: personKey(id),
    kind: 'person',
    personId: id,
    name: name?.trim() || `(${role ?? 'person'}, no name)`,
    caption,
    certificateId: cert,
  };
}

// One attestation's family: kinship rows on its record, plus the records
// that probably show the same person (`same`), which the caller follows so the
// tree can cross from one record to the next. `via`: this attestation was
// itself reached through such a probable link, so its lines are uncertain.
async function familyOf(ctx: Context, self: NodeKey, selfName: string, personId: number, via: boolean) {
  const personP = cachedGet<PersonRow[]>('ui_person', { id: personId, key: '' }).then((r) => r[0]);
  const [relations, me] = await Promise.all([cachedGet<RelationRow[]>('ui_relations', { id: personId }), personP]);
  const found: Found[] = [];
  const same: number[] = [];

  for (const r of relations) {
    if (r.relation_type === 'same-person') {
      if (r.confidence === 'probable') same.push(r.other_id);
      continue;
    }
    if (!isFamily(r.relation_type, me?.record_type ?? null)) continue;
    const node = personNode(ctx, r.other_id, r.other_name, r.other_role, nodeCaption(r.other_role, r.other_dataset, r.other_year), r.certificate_id);
    if (node.key === self) continue;
    const [fromName, toName, fromRole] = r.direction === 'out' ? [selfName, node.name, me?.role ?? null] : [node.name, selfName, r.other_role];
    const sameRecord = r.certificate_id === me?.certificate_id;
    const confidence = via ? 'probable' : r.confidence;
    found.push({
      node,
      family: true,
      group: r.relation_type,
      edge: {
        key: edgeKey(self, node.key, `${r.relation_type}@${r.certificate_id}`),
        from: self,
        to: node.key,
        ...shape(r.relation_type, r.direction === 'out' ? self : node.key),
        certain: confidence === 'certain',
        reason: relationReason(
          r.relation_type,
          fromName,
          toName,
          fromRole,
          confidence,
          sameRecord ? (me?.record_type ?? null) : null,
          sameRecord ? (me?.event_year ?? null) : r.other_year,
          sameRecord ? (me?.source_dataset ?? null) : r.other_dataset,
        ),
        reference: sameRecord
          ? recordReference(me?.source_dataset ?? null, me?.record_type ?? null, me?.record_event_date ?? me?.record_date ?? me?.event_year ?? null, r.certificate_id)
          : recordReference(r.other_dataset, null, r.other_year, r.certificate_id),
      },
    });
  }
  const self_ = { id: personId, name: me?.full_name?.trim() || selfName, record: nodeCaption(me?.role ?? null, me?.source_dataset ?? null, me?.event_year ?? null) };
  return { found, same, truncated: relations.length >= 300, me: self_, year: me?.event_year ?? null };
}

// Same-name records worth trying as this person: not witnesses or informants
// (they carry no family), within a lifetime, and only for names rare enough
// to mean something (a first name without surname matches many strangers).
// The closest in time first.
const COMMON = 40;
const LIFETIME = 90;
const AMBIGUOUS = 5; // more plausible matches than this: too common to guess
const PER_RECORD = 3;
const NO_FAMILY = /^(witness|getuige|informant)/i;

async function sameNamed(personId: number, year: number | null) {
  const rows = await cachedGet<SameNameRow[]>('ui_same_name', { id: personId });
  if (rows.length >= COMMON) return [];
  const plausible = rows
    .filter((r) => (r.full_name ?? '').trim().split(/\s+/).length >= 2 && !NO_FAMILY.test(r.role ?? ''))
    .filter((r) => !year || !r.year || Math.abs(r.year - year) <= LIFETIME);
  if (plausible.length > AMBIGUOUS) return [];
  return plausible
    .sort((x, y) => Math.abs((x.year ?? 0) - (year ?? 0)) - Math.abs((y.year ?? 0) - (year ?? 0)))
    .slice(0, PER_RECORD)
    .map((r) => r.person_id);
}

// Records of one person followed through probable same-person links and
// same-name matches, at most this many, so one name cannot drag in half the
// archive.
const MAX_ALIASES = 10;

type Via = { from: { id: number; name: string; record: string }; source: Guess['source'] };

// The family of the person `self` stands for, gathered over all their records.
// `aliases`: every attestation taken to be this person.
async function expandFamily(ctx: Context, self: NodeKey, selfName: string, start: number[], ownIds: Set<number>) {
  const seen = new Set([...ownIds, ...start]);
  const queue: { id: number; via: Via | null }[] = start.map((id) => ({ id, via: null }));
  const found: Found[] = [];
  const guesses: Guess[] = [];
  let truncated = false;
  let tried = 0;
  let failed = 0;
  while (queue.length && tried < MAX_ALIASES) {
    const batch = queue.splice(0, MAX_ALIASES - tried);
    tried += batch.length;
    const results = await Promise.allSettled(
      batch.map(async (a) => {
        const fam = await familyOf(ctx, self, selfName, a.id, !!a.via);
        // Name matches only from records known to be this person, never a
        // guess built on a guess.
        const named = a.via ? [] : await sameNamed(a.id, fam.year).catch(() => []);
        return { ...fam, named, via: a.via };
      }),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        failed++;
        continue;
      }
      const { me, via } = r.value;
      found.push(...r.value.found);
      truncated ||= r.value.truncated;
      if (via && r.value.found.length)
        guesses.push({ key: [via.from.id, me.id].sort().join('~'), a: via.from, b: me, source: via.source });
      const next = [
        ...r.value.same.map((id) => ({ id, source: 'archive' as const })),
        ...r.value.named.map((id) => ({ id, source: 'name' as const })),
      ];
      for (const { id, source } of next) {
        const owner = ctx.patientOf(id);
        if (seen.has(id) || (owner !== undefined && patientKey(owner) !== self)) continue;
        seen.add(id);
        queue.push({ id, via: { from: me, source } });
      }
    }
  }
  if (failed && failed === tried) throw new Error('archive offline');
  // One line per relative: the first record found (certain ones come first).
  const byNode = new Map<NodeKey, Found>();
  for (const f of found) {
    if (f.node.personId !== undefined && seen.has(f.node.personId)) continue;
    if (!byNode.has(f.node.key)) byNode.set(f.node.key, f);
  }
  return { found: [...byNode.values()], truncated, aliases: [...seen], guesses };
}

// A wall name: its certain records count as the patient itself (the uncertain
// matches are not family and stay hidden), then the family they lead to.
export async function expandPatient(ctx: Context, patientId: number) {
  const self = patientKey(patientId);
  const rows = await cachedGet<PatientStartRow[]>('patient_start', { patient_id: patientId });
  const own = rows.filter((r) => r.person_id && (r.soort === 'vermelding' || (r.soort === 'koppeling' && r.resultaat === 'zeker')));
  const ownIds = own.map((r) => r.person_id!);
  const r = await expandFamily(ctx, self, ctx.patientName(patientId), ownIds, new Set(ownIds));
  return { ...r, ownIds };
}

export async function expandPersonNode(ctx: Context, node: GNode) {
  return expandFamily(ctx, node.key, node.name, [node.personId!], new Set());
}

// On request only: other records with the same name, all uncertain.
export async function sameNameCandidates(ctx: Context, self: NodeKey, personIds: number[]) {
  const ownIds = new Set(personIds);
  const lists = await Promise.all(personIds.map((id) => cachedGet<SameNameRow[]>('ui_same_name', { id })));
  const found: Found[] = [];
  const seen = new Set<NodeKey>();
  for (const r of lists.flat()) {
    if (ownIds.has(r.person_id)) continue;
    const node = personNode(ctx, r.person_id, r.full_name, r.role, nodeCaption(r.role, r.source_dataset, r.year));
    if (node.key === self || seen.has(node.key)) continue;
    seen.add(node.key);
    found.push({
      node,
      family: false,
      group: 'same-name',
      edge: {
        key: edgeKey(self, node.key, 'same-name'),
        from: self,
        to: node.key,
        certain: false,
        reason: SAME_PERSON,
        reference: sameNameReference(r.source_dataset, r.role, r.year),
      },
    });
  }
  return found;
}
