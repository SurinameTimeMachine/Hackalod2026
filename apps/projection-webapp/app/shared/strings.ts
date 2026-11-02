// All visible wording in one place, so it can be reviewed (language NL/EN and
// terminology are still open).
import type { Patient, Tie } from './api';

export function displayName(p: Patient) {
  return [p.achternaam, p.initialen_of_contractnr].filter(Boolean).join(' ');
}

export function subtitle(p: Patient) {
  const born = p.geboortejaar && p.geboortejaar !== '?' ? ` · b. ${p.geboortejaar}` : '';
  return `was here · 1921${born}`;
}

export const NO_TIES = 'no further records known yet';
export const ARCHIVE_OFFLINE = 'archive offline · showing what is known';
export const SAME_PERSON = 'possibly the same person';

const DATASETS: Record<string, string> = {
  '02-death': 'death certificates',
  '03-birth': 'birth records',
  '04-ward-registers': 'ward registers',
  '05-slave-emancipation': 'slave & emancipation registers',
  '06-almanakken': 'almanacs',
  '11-madeisu': 'Madeisu contracts',
  '09-volkstelling-1921': 'census 1921',
  '10-volkstelling-1950': 'census 1950',
  '12-migratie-datasets': 'migration registers',
  '13-civil': 'civil records',
};
const dataset = (d: string | null) => (d ? (DATASETS[d] ?? d) : 'archive');

const RECORD_TYPES: Record<string, string> = {
  contract_record: 'contract register',
  erkenningen: 'acknowledgement deed',
  census_entry: 'census entry',
  census_1921_household: 'census 1921',
  birth_certificate: 'birth certificate',
  death_certificate: 'death certificate',
  marriage_certificate: 'marriage certificate',
};

const RANK = { relation: 0, 'same-record': 1, 'same-match': 2 } as const;

// The strongest tie of a pair is the one a constellation line shows.
export function strongestTie(ties: Tie[]) {
  return [...ties].sort((x, y) => RANK[x.kind] - RANK[y.kind])[0];
}

export const isCertain = (t: Tie) =>
  t.kind === 'same-record' || (t.kind === 'relation' && t.confidence === 'certain');

// Why two names on the wall are connected. `a` < `b` are patient ids.
export function tieReason(t: Tie, a: number, b: number, nameOf: (id: number) => string) {
  const type = t.record?.type ?? null;
  const year = t.record?.year ?? null;
  switch (t.kind) {
    case 'relation': {
      const [from, to] = t.from === a ? [a, b] : [b, a];
      return relationReason(t.type, nameOf(from), nameOf(to), null, t.confidence, type, year, t.dataset);
    }
    case 'same-record':
      return sameRecordReason(nameOf(b), t.roles[1], nameOf(a), t.roles[0], type, year, t.dataset);
    case 'same-match':
      return SAME_PERSON;
  }
}

// The source the tie rests on.
export function tieReference(t: Tie) {
  const r = t.record;
  const what = r?.type ? (RECORD_TYPES[r.type] ?? r.type.replace(/_/g, ' ')) : null;
  const when = r?.date ?? r?.year ?? null;
  const parts = [dataset(t.dataset), what, when, r ? `#${r.certificate_id}` : null].filter(Boolean);
  const ref = parts.join(' · ');
  return t.kind === 'same-match' ? `both linked to ${ref}` : ref;
}

// --- Live constellation wording ------------------------------------------

const short = (name: string) => (name.length > 28 ? `${name.slice(0, 27)}…` : name);
const join = (...parts: (string | number | null | undefined)[]) => parts.filter((x) => x != null && x !== '').join(' · ');

const recordType = (t: string | null) => (t ? (RECORD_TYPES[t] ?? t.replace(/_/g, ' ')) : null);

// --- Stories told on the phone ---------------------------------------------
// A told edge reads "`to` is `relationType` of `from`".

const TOLD_RELATION: Record<string, string> = {
  parent: 'a parent',
  child: 'a child',
  sibling: 'a sibling',
  spouse: 'the spouse',
  grandparent: 'a grandparent',
  grandchild: 'a grandchild',
  friend: 'a friend',
  colleague: 'a colleague',
};

export function toldReason(fromName: string, toName: string, relationType: string) {
  const r = TOLD_RELATION[relationType];
  return r ? `${short(toName)} is ${r} of ${short(fromName)}` : `${short(toName)} is related to ${short(fromName)}`;
}

export const toldReference = (narrator: string) => `told by ${narrator} · not yet checked`;

// Who a told person is, for their caption: "grandchild of Atmo 1425/WW".
const TOLD_ROLE: Record<string, string> = {
  parent: 'parent',
  child: 'child',
  sibling: 'sibling',
  spouse: 'spouse',
  grandparent: 'grandparent',
  grandchild: 'grandchild',
  friend: 'friend',
  colleague: 'colleague',
};
export const toldRole = (relationType: string, ofName: string) =>
  TOLD_RELATION[relationType] ? `${TOLD_ROLE[relationType]} of ${short(ofName)}` : `related to ${short(ofName)}`;
export const toldCaption = (narrator: string) => `told by ${narrator}`;
export const narratorCaption = (time?: string) => (time ? `told a story · ${time}` : 'told a story');
export const newStory = (narrator: string) => `new story by ${narrator}`;

// For the phone: a guess the tree rests on, for a visitor to confirm.
export const guessQuestion = (aName: string, aRecord: string, bName: string, bRecord: string) =>
  `Is ${aName} (${aRecord}) the same person as ${bName} (${bRecord})?`;

// Small caption under a constellation name: who they are on their record.
export function nodeCaption(role: string | null, ds: string | null, year: string | number | null) {
  return join(role, ds ? dataset(ds) : null, year);
}

export function recordReference(ds: string | null, type: string | null, when: string | number | null, cert: number | null) {
  return join(ds ? dataset(ds) : null, recordType(type), when, cert ? `#${cert}` : null);
}

// --- Sentences for the lines ----------------------------------------------
// Plain sentences built only from the record type and the two people's roles
// (or the `relations` type). Names, not her/him: the records rarely give sex,
// and the line already sits between the two names.

type Kind = 'recognition' | 'birth' | 'death' | 'marriage' | 'census' | 'contract' | 'other';

function kindOf(type: string | null): Kind {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('erkenning')) return 'recognition';
  if (t.includes('birth') || t.includes('geboorte')) return 'birth';
  if (t.includes('death') || t.includes('overlijden')) return 'death';
  if (t.includes('marriage') || t.includes('huwelijk')) return 'marriage';
  if (t.includes('census')) return 'census';
  if (t.includes('contract')) return 'contract';
  return 'other';
}

const ROLE: Record<string, string> = {
  kind: 'child',
  comparant: 'declarant',
  aangever: 'declarant',
  getuige: 'witness',
  moeder: 'mother',
  vader: 'father',
  ouder: 'parent',
  overledene: 'deceased',
  bruid: 'bride',
  bruidegom: 'groom',
};
const role = (r: string | null) => {
  const x = (r ?? '').toLowerCase().replace(/[-_ ]?\d+$/, '');
  return ROLE[x] ?? x;
};
// The person a civil record is about.
const SUBJECT = new Set(['child', 'deceased', 'bride', 'groom']);

const inYear = (y: string | number | null | undefined) => (y ? ` in ${y}` : '');
const censusName = (ds: string | null) =>
  ds === '09-volkstelling-1921' ? 'the 1921 census' : ds === '10-volkstelling-1950' ? 'the 1950 census' : 'a census';

const ACT: Record<Kind, string> = {
  recognition: 'the acknowledgement of',
  birth: 'the birth registration of',
  death: 'the death registration of',
  marriage: 'the marriage of',
  census: 'the census entry of',
  contract: 'the contract of',
  other: 'the record of',
};

function declared(a: string, b: string, kind: Kind, y: string) {
  if (kind === 'recognition') return `${a} legally acknowledged ${b}${y}`;
  if (kind === 'birth') return `${a} registered the birth of ${b}${y}`;
  if (kind === 'death') return `${a} reported the death of ${b}${y}`;
  return `${a} made the declaration about ${b}${y}`;
}

const witnessed = (a: string, b: string, kind: Kind, y: string) => `${a} witnessed ${ACT[kind]} ${b}${y}`;

// Family in the constellation: kinship rows, and the declarant of an
// acknowledgement deed, who is the parent acknowledging the child.
const KIN = new Set(['parent-child', 'spouse', 'partner', 'sibling', 'foster', 'related']);
export const isFamily = (type: string, recordType: string | null) =>
  KIN.has(type) || (type === 'declarant' && kindOf(recordType) === 'recognition');

// A `relations` row: `from` is the parent, declarant, witness … of `to`.
export function relationReason(
  type: string,
  fromName: string,
  toName: string,
  fromRole: string | null,
  confidence: string,
  recordType: string | null = null,
  year: string | number | null = null,
  ds: string | null = null,
) {
  const [a, b] = [short(fromName), short(toName)];
  const kind = kindOf(recordType ?? (ds === '12-migratie-datasets' ? 'contract' : null));
  const y = kind === 'census' ? '' : inYear(year);
  const probably = confidence === 'certain' ? '' : ' (probably)';
  const r = role(fromRole);
  let text: string;
  if (type === 'same-person') return SAME_PERSON;
  if (type === 'parent-child') text = r === 'mother' || r === 'father' ? `${a} was the ${r} of ${b}` : `${a} was a parent of ${b}`;
  else if (type === 'spouse') text = `${a} was the spouse of ${b}`;
  else if (type === 'partner') text = `${a} was the partner of ${b}`;
  else if (type === 'sibling') text = `${a} and ${b} were siblings`;
  else if (type === 'foster') text = `${a} was a foster parent of ${b}`;
  else if (type === 'related') text = `${a} was related to ${b}`;
  else if (type === 'declarant') text = declared(a, b, kind, y);
  else if (type === 'witness') text = witnessed(a, b, kind, y);
  else text = `${a} — ${type.replace(/-/g, ' ')} — ${b}`;
  return text + probably;
}

// Two people on one record without a `relations` row between them: say how,
// from their roles. `other` is the name the line leads to.
export function sameRecordReason(
  otherName: string,
  otherRole: string | null,
  selfName: string,
  selfRole: string | null,
  recordType: string | null,
  year: string | number | null,
  ds: string | null,
) {
  const [o, s] = [short(otherName), short(selfName)];
  const [ro, rs] = [role(otherRole), role(selfRole)];
  const kind = kindOf(recordType);
  const y = inYear(year);

  if (kind === 'census') {
    const census = censusName(ds);
    if ((ro === 'father' || ro === 'mother') && rs !== 'father' && rs !== 'mother') return `${o} is named as the ${ro} of ${s} in ${census}`;
    if ((rs === 'father' || rs === 'mother') && ro !== 'father' && ro !== 'mother') return `${s} is named as the ${rs} of ${o} in ${census}`;
    if (ro === rs && (ro === 'father' || ro === 'mother')) return `${o} and ${s} are both named as parents in ${census}`;
    if ((ro === 'father' && rs === 'mother') || (ro === 'mother' && rs === 'father')) return `${o} and ${s} are named as the parents in one entry of ${census}`;
    return `${o} and ${s} were listed together in ${census}`;
  }
  if (kind === 'contract' && ro === 'migrant' && rs === 'migrant') return `${o} and ${s} were registered together as migrants${y}`;

  // Witness and the person the record is about.
  if (ro === 'witness' && SUBJECT.has(rs)) return witnessed(o, s, kind, y);
  if (rs === 'witness' && SUBJECT.has(ro)) return witnessed(s, o, kind, y);
  // Witness and the declarant.
  if (ro === 'witness' && rs === 'declarant')
    return kind === 'recognition' ? `${o} witnessed ${s} acknowledging a child${y}` : `${o} was a witness to the declaration by ${s}${y}`;
  if (rs === 'witness' && ro === 'declarant')
    return kind === 'recognition' ? `${s} witnessed ${o} acknowledging a child${y}` : `${s} was a witness to the declaration by ${o}${y}`;
  if (ro === 'witness' && rs === 'witness') return `${o} and ${s} were both witnesses to ${ACT[kind].replace(/ of$/, '')}${y}`;
  // Declarant and the person the record is about.
  if (ro === 'declarant' && SUBJECT.has(rs)) return declared(o, s, kind, y);
  if (rs === 'declarant' && SUBJECT.has(ro)) return declared(s, o, kind, y);
  if (ro === 'declarant' && rs === 'declarant')
    return kind === 'recognition' ? `${o} and ${s} acknowledged a child together${y}` : `${o} and ${s} made the declaration together${y}`;
  // Two people the same record is about.
  if (ro === 'child' && rs === 'child')
    return kind === 'recognition' ? `${o} and ${s} were acknowledged together on one deed${y}` : `${o} and ${s} are named as children on one record${y}`;
  if ((ro === 'bride' && rs === 'groom') || (ro === 'groom' && rs === 'bride')) return `${o} and ${s} married${y}`;

  const what = recordType ? (RECORD_TYPES[recordType] ?? recordType.replace(/_/g, ' ')) : 'record';
  return ro && rs ? `${o} (${ro}) and ${s} (${rs}) appear on the same ${what}${y}` : `${o} and ${s} appear on the same ${what}${y}`;
}

const RESULT: Record<string, string> = { waarschijnlijk: 'probable match', 'meerdere kandidaten': 'one of several candidates' };

export function possiblyPatient(resultaat: string | null, rol: string | null, ds: string | null, year: string | number | null) {
  return {
    reason: `possibly this patient (${(resultaat && RESULT[resultaat]) ?? resultaat ?? 'uncertain'})`,
    reference: join(ds ? dataset(ds) : null, rol, year),
  };
}

export function sameNameReference(ds: string | null, role: string | null, year: number | null) {
  return `same name in ${join(ds ? dataset(ds) : null, role, year)}`;
}

// A collapsed group of a busy person's records, e.g. "witness · 214 records".
export function summaryName(group: string, count: number, truncated: boolean) {
  return `${group.replace(/-/g, ' ')} · ${count}${truncated ? '+' : ''} more`;
}
export const SUMMARY_CAPTION = 'click to show more';
