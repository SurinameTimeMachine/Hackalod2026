// What one archive record says about when someone lived, and whether that
// can be the person a story describes. Ranges are deliberately wide: a
// record is only ruled out when it really cannot fit; the rest is left to
// a question.
import type { LifeFacts, Range } from '../shared/story';

export type Life = { born: Range | null; died: Range | null };

const MAX_AGE = 105;
const overlaps = (a: Range, b: Range) => a[0] <= b[1] && b[0] <= a[1];

// role + year (+ age) of an attestation → possible birth and death years.
export function lifeOf(role: string | null, year: number | null, dataset?: string | null, age?: number | null): Life {
  if (!year) return { born: null, died: null };
  const r = (role ?? '').toLowerCase().replace(/[-_ ]?\d+$/, '');
  if (r === 'deceased' || r === 'overledene') {
    return { born: age != null ? [year - age - 1, year - age] : [year - MAX_AGE, year], died: [year, year] };
  }
  if ((r === 'child' || r === 'kind') && dataset === '03-birth') return { born: [year, year], died: [year, year + MAX_AGE] };
  if (r === 'child' || r === 'kind') return { born: [year - 25, year], died: [year, year + MAX_AGE] };
  if (age != null) return { born: [year - age - 1, year - age], died: [year, year - age + MAX_AGE] };
  if (['bride', 'groom', 'bruid', 'bruidegom', 'spouse'].includes(r)) return { born: [year - 70, year - 15], died: [year, year + 90] };
  // parent, witness, declarant, resident, …: an adult at the time.
  return { born: [year - 90, year - 12], died: [year, year + 95] };
}

// Can a person with this record be the one the story talks about?
export function fits(life: Life, facts: LifeFacts | null): boolean {
  if (!facts) return true;
  const { born, died } = life;
  if (facts.died != null) {
    if (died && !overlaps(died, [facts.died - 1, facts.died + 1])) return false;
    if (born && !overlaps(born, [facts.died - MAX_AGE, facts.died])) return false;
  }
  if (facts.born != null) {
    if (born && !overlaps(born, [facts.born - 2, facts.born + 2])) return false;
    if (died && died[1] < facts.born) return false;
  }
  if (facts.alive_in != null) {
    if (born && born[0] > facts.alive_in) return false;
    if (died && died[1] < facts.alive_in) return false;
  }
  return true;
}

// Plain Dutch for one record's place in a life: "overleden 1883",
// "geboren 1892", "woonde in de Saramaccastraat, 1843".
export function lifeLabel(role: string | null, year: number | null, dataset: string | null, location: string | null): string {
  const r = (role ?? '').toLowerCase();
  const y = year ?? '';
  if (r === 'deceased') return `overleden ${y}`;
  if (r === 'child' && dataset === '03-birth') return `geboren ${y}`;
  if (r === 'bride' || r === 'groom') return `getrouwd ${y}`;
  if (r === 'resident') return location ? `woonde ${location}, ${y}` : `bewoner ${y}`;
  const nl: Record<string, string> = { child: 'kind', mother: 'moeder', father: 'vader', parent: 'ouder', witness: 'getuige', declarant: 'aangever', informant: 'aangever', spouse: 'partner' };
  return [nl[r] ?? role, y].filter(Boolean).join(' ');
}
