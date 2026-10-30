// Follow-up questions to find the right archive record for a name. Built
// in code from what separates the remaining candidates (era, then place,
// then a plain pick), so they are instant and never invent anything. Every
// answer narrows the list; "weet ik niet" moves on to the next question.
import type { MatchOption } from '../shared/story';

export type Ask = {
  remaining: string[]; // candidate ids still possible
  asked: ('era' | 'place')[];
  done: boolean;
  result: string | null; // chosen candidate id; null = none / unknown
};

export type Chip = { label: string; value: string; detail?: string };
export type Question = { kind: 'era' | 'place' | 'list' | 'confirm'; text: string; chips: Chip[]; option?: MatchOption };

export const startAsk = (options: MatchOption[]): Ask => ({ remaining: options.map((o) => o.id), asked: [], done: false, result: null });

const ERAS: { label: string; range: [number, number] }[] = [
  { label: 'voor 1850', range: [0, 1849] },
  { label: '1850 – 1880', range: [1850, 1879] },
  { label: '1880 – 1910', range: [1880, 1909] },
  { label: 'na 1910', range: [1910, 9999] },
];
const SKIP: Chip = { label: 'Weet ik niet', value: 'skip' };
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];
const placeOf = (o: MatchOption) => o.place?.trim() || null;

function places(opts: MatchOption[]) {
  const seen = new Map<string, number>();
  for (const o of opts) {
    const p = placeOf(o);
    if (p) seen.set(p, (seen.get(p) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

export function nextQuestion(name: string, options: MatchOption[], ask: Ask): Question | null {
  if (ask.done) return null;
  const opts = options.filter((o) => ask.remaining.includes(o.id));
  if (!opts.length) return null;
  if (opts.length === 1) {
    return {
      kind: 'confirm',
      text: `Is dit ${name}?`,
      option: opts[0],
      chips: [{ label: 'Ja, dat is hem/haar', value: 'yes' }, { label: 'Nee', value: 'no' }, SKIP],
    };
  }
  if (!ask.asked.includes('era')) {
    const eras = ERAS.filter((e) => opts.some((o) => o.born && overlaps(o.born, e.range)));
    // Only worth asking when the answer splits the list.
    if (eras.length >= 2 && eras.some((e) => opts.some((o) => o.born && !overlaps(o.born, e.range))))
      return { kind: 'era', text: `Wanneer is ${name} ongeveer geboren?`, chips: [...eras.map((e) => ({ label: e.label, value: `era:${e.range[0]}` })), SKIP] };
  }
  if (!ask.asked.includes('place')) {
    const ps = places(opts);
    if (ps.length >= 2)
      return {
        kind: 'place',
        text: `Waar woonde ${name}?`,
        chips: [...ps.slice(0, 4).map((p) => ({ label: p, value: `place:${p}` })), { label: 'Ergens anders', value: 'place:' }, SKIP],
      };
  }
  return {
    kind: 'list',
    text: `Welke ${name} is het?`,
    chips: [...opts.map((o) => ({ label: o.label, value: `pick:${o.id}`, detail: o.detail })), { label: 'Geen van deze', value: 'no' }, SKIP],
  };
}

export function answer(q: Question, value: string, options: MatchOption[], ask: Ask): Ask {
  const done = (result: string | null): Ask => ({ ...ask, done: true, result });
  if (value === 'yes') return done(q.option!.id);
  if (value === 'no') return done(null);
  if (value.startsWith('pick:')) return done(value.slice(5));
  if (value === 'skip') return q.kind === 'era' || q.kind === 'place' ? { ...ask, asked: [...ask.asked, q.kind] } : done(null);

  const opts = options.filter((o) => ask.remaining.includes(o.id));
  let keep = opts;
  if (value.startsWith('era:')) {
    const era = ERAS.find((e) => `era:${e.range[0]}` === value)!;
    keep = opts.filter((o) => !o.born || overlaps(o.born, era.range));
  } else if (value.startsWith('place:')) {
    const p = value.slice(6);
    const shown = q.chips.filter((c) => c.value.startsWith('place:') && c.value !== 'place:').map((c) => c.value.slice(6));
    keep = p ? opts.filter((o) => placeOf(o) === p) : opts.filter((o) => !shown.includes(placeOf(o) ?? ''));
  }
  const next: Ask = { ...ask, remaining: keep.map((o) => o.id), asked: [...ask.asked, q.kind as 'era' | 'place'] };
  return keep.length ? next : done(null);
}
