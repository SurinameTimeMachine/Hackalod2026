// All visible wording in one place, so it can be reviewed (language NL/EN and
// terminology are still open).
import type { Patient, Tie } from './api';

export function nameTag(name: string | null, year: number | null) {
  return `${name?.trim() || 'Naam onbekend'}${year != null && Number.isInteger(year) ? `, ${year}` : ''}`;
}

export function roleLabel(role: string | null) {
  const roles: Record<string, string> = {
    child: 'kind', parent: 'ouder', deceased: 'overledene', informant: 'aangever',
    witness: 'getuige', resident: 'bewoner', enslaved: 'tot slaaf gemaakt',
    emancipated: 'vrijverklaard', bride: 'bruid', groom: 'bruidegom',
    mother: 'moeder', father: 'vader', patient: 'patiënt',
  };
  return role ? roles[role] ?? null : null;
}

export function displayName(p: Patient) {
  return [p.achternaam, p.initialen_of_contractnr].filter(Boolean).join(' ');
}

export function subtitle(p: Patient) {
  const born = p.geboortejaar && p.geboortejaar !== '?' ? ` · geb. ${p.geboortejaar}` : '';
  return `was hier · 1921${born}`;
}

export const NO_TIES = 'geen bekende verbindingen met andere namen';

const RECORD_TYPES: Record<string, string> = {
  contract_record: 'contractregister',
  erkenningen: 'erkenningsakte',
  census_entry: 'volkstelling',
  census_1921_household: 'volkstelling 1921',
  birth_certificate: 'geboorteakte',
  death_certificate: 'overlijdensakte',
  marriage_certificate: 'huwelijksakte',
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
  switch (t.kind) {
    case 'relation': {
      const unsure = t.confidence === 'certain' ? '' : ' (waarschijnlijk)';
      const [from, to] = t.from === a ? [a, b] : [b, a];
      if (t.type === 'spouse') return `echtgenoten${unsure}`;
      if (t.type === 'parent-child') return `${nameOf(from)} ouder van ${nameOf(to)}${unsure}`;
      return `${nameOf(from)} en ${nameOf(to)} zijn verbonden${unsure}`;
    }
    case 'same-record': {
      return 'in dezelfde akte';
    }
    case 'same-match':
      return 'mogelijk dezelfde persoon';
  }
}

// The source the tie rests on.
export function tieReference(t: Tie) {
  const r = t.record;
  const what = r?.type ? (RECORD_TYPES[r.type] ?? 'archiefstuk') : null;
  const when = r?.date ?? r?.year ?? null;
  const parts = [what, when, r ? `#${r.certificate_id}` : null].filter(Boolean);
  const ref = parts.join(' · ');
  return t.kind === 'same-match' ? `beiden gekoppeld aan ${ref}` : ref;
}
