// The constellation as one growing graph, fetched live per click. These are
// the pure parts: node/edge shapes and what each kind of click asks the API.
// Wording lives in shared/strings.ts; nothing here invents a relation.
import {
  cachedGet,
  type PatientStartRow,
  type PersonRow,
  type RecordPersonRow,
  type RelationRow,
  type SameNameRow,
} from '../shared/api';
import {
  nodeCaption,
  possiblyPatient,
  recordReference,
  relationReason,
  sameNameReference,
  sameRecordReason,
  SAME_PERSON,
} from '../shared/strings';

export type NodeKey = string; // 'p:<patient_id>' | 'x:<person_id>' | 's:<parent>|<group>'

export type GNode = {
  key: NodeKey;
  kind: 'patient' | 'person' | 'summary';
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

const FAMILY = new Set(['parent-child', 'spouse']);

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

// Everything one attestation leads to: its relations and the others on its
// record. `self` is the node that stands for it (a patient stamp or a person).
async function expandPerson(ctx: Context, self: NodeKey, selfName: string, personId: number, ownIds: Set<number>, knownCert?: number | null) {
  const personP = cachedGet<PersonRow[]>('ui_person', { id: personId, key: '' }).then((r) => r[0]);
  const [relations, me] = await Promise.all([cachedGet<RelationRow[]>('ui_relations', { id: personId }), personP]);
  const cert = knownCert ?? me?.certificate_id;
  const onRecord = cert ? await cachedGet<RecordPersonRow[]>('ui_record_persons', { cert }) : [];

  const ref = recordReference(me?.source_dataset ?? null, me?.record_type ?? null, me?.record_event_date ?? me?.record_date ?? me?.event_year ?? null, cert ?? null);
  const found: Found[] = [];
  const linked = new Set<number>();

  for (const r of relations) {
    if (ownIds.has(r.other_id)) continue;
    linked.add(r.other_id);
    const node = personNode(ctx, r.other_id, r.other_name, r.other_role, nodeCaption(r.other_role, r.other_dataset, r.other_year), r.certificate_id);
    if (node.key === self) continue;
    const samePerson = r.relation_type === 'same-person';
    const [fromName, toName, fromRole] = r.direction === 'out' ? [selfName, node.name, me?.role ?? null] : [node.name, selfName, r.other_role];
    const sameRecord = r.certificate_id === cert;
    found.push({
      node,
      family: FAMILY.has(r.relation_type),
      group: r.relation_type,
      edge: {
        key: edgeKey(self, node.key, `${r.relation_type}@${r.certificate_id}`),
        from: self,
        to: node.key,
        certain: r.confidence === 'certain' && !samePerson,
        reason: samePerson
          ? SAME_PERSON
          : relationReason(
              r.relation_type,
              fromName,
              toName,
              fromRole,
              r.confidence,
              sameRecord ? (me?.record_type ?? null) : null,
              sameRecord ? (me?.event_year ?? null) : r.other_year,
              sameRecord ? (me?.source_dataset ?? null) : r.other_dataset,
            ),
        reference: r.certificate_id === cert ? ref : recordReference(r.other_dataset, null, r.other_year, r.certificate_id),
      },
    });
  }

  for (const o of onRecord) {
    if (o.person_id === personId || ownIds.has(o.person_id) || linked.has(o.person_id)) continue;
    const node = personNode(ctx, o.person_id, o.full_name, o.role, nodeCaption(o.role, me?.source_dataset ?? null, me?.event_year ?? null), cert);
    if (node.key === self) continue;
    found.push({
      node,
      family: false,
      group: o.role ?? 'record',
      edge: {
        key: edgeKey(self, node.key, `record@${cert}`),
        from: self,
        to: node.key,
        certain: true,
        reason: sameRecordReason(node.name, o.role, selfName, me?.role ?? null, me?.record_type ?? null, me?.event_year ?? null, me?.source_dataset ?? null),
        reference: ref,
      },
    });
  }
  return { found, truncated: relations.length >= 300 };
}

// A wall name: its own records (certain ones count as the patient itself,
// the rest are dashed "possibly this patient"), then what those lead to.
export async function expandPatient(ctx: Context, patientId: number) {
  const self = patientKey(patientId);
  const selfName = ctx.patientName(patientId);
  const rows = await cachedGet<PatientStartRow[]>('patient_start', { patient_id: patientId });
  const own = rows.filter((r) => r.person_id && (r.soort === 'vermelding' || (r.soort === 'koppeling' && r.resultaat === 'zeker')));
  const ownIds = new Set(own.map((r) => r.person_id!));
  const found: Found[] = [];

  for (const r of rows) {
    if (r.soort !== 'koppeling' || !r.person_id || ownIds.has(r.person_id)) continue;
    const node = personNode(ctx, r.person_id, r.naam, r.rol, nodeCaption(r.rol, r.dataset, r.jaar), r.certificate_id);
    if (node.key === self) continue;
    const p = possiblyPatient(r.resultaat, r.rol, r.dataset, r.jaar);
    found.push({ node, family: false, group: 'possibly', edge: { key: edgeKey(self, node.key, `match@${r.person_id}`), from: self, to: node.key, certain: false, ...p } });
  }

  const results = await Promise.allSettled(own.map((r) => expandPerson(ctx, self, selfName, r.person_id!, ownIds, r.certificate_id)));
  const failed = results.some((r) => r.status === 'rejected');
  if (failed && results.every((r) => r.status === 'rejected') && own.length) throw new Error('archive offline');
  let truncated = false;
  for (const r of results)
    if (r.status === 'fulfilled') {
      found.push(...r.value.found);
      truncated ||= r.value.truncated;
    }
  return { found, truncated, ownIds: [...ownIds] };
}

export async function expandPersonNode(ctx: Context, node: GNode) {
  return expandPerson(ctx, node.key, node.name, node.personId!, new Set([node.personId!]), node.certificateId);
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
