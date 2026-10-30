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

export const NO_TIES = 'no known ties to other names on this wall';

const DATASETS: Record<string, string> = {
  '03-birth': 'birth records',
  '09-volkstelling-1921': 'census 1921',
  '10-volkstelling-1950': 'census 1950',
  '12-migratie-datasets': 'migration registers',
  '13-civil': 'civil records',
};
const dataset = (d: string | null) => (d ? (DATASETS[d] ?? d) : 'archive');

const RECORD_TYPES: Record<string, string> = {
  contract_record: 'contract register',
  erkenningen: 'recognition record',
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
  switch (t.kind) {
    case 'relation': {
      const unsure = t.confidence === 'certain' ? '' : ' (probable)';
      const [from, to] = t.from === a ? [a, b] : [b, a];
      if (t.type === 'spouse') return `spouses${unsure}`;
      if (t.type === 'parent-child') return `${nameOf(from)} parent of ${nameOf(to)}${unsure}`;
      return `${nameOf(from)} was ${t.type} for ${nameOf(to)}${unsure}`;
    }
    case 'same-record': {
      const [ra, rb] = t.roles;
      return ra && rb ? `on the same record: ${ra} and ${rb}` : 'on the same record';
    }
    case 'same-match':
      return 'possibly the same person';
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
