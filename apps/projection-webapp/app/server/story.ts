// The story pipeline: which name was scanned, and what a told story says,
// mapped onto the columns of the contributions dataset.
import type { Candidate, ExtractResult, LifeFacts, PersonContext, ResolvedSuggestion, ScanResult, StoryRelation, SubjectCheck, Suggestion } from '../shared/story';
import { buildContext, lifeOfKey, searchPeople, searchPlaces } from './archive';
import { activeStamps } from './display';
import { fits } from './lifetime';
import { chatJson } from './openai';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Every readable name across screens, one per key.
function screenCandidates(): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const s of activeStamps())
    if (!byKey.has(s.key)) byKey.set(s.key, { key: s.key, text: s.text, font: s.font, color: s.color, subtitle: s.subtitle });
  return [...byKey.values()];
}

async function fromSearch(readText: string): Promise<ScanResult> {
  const people = await searchPeople(readText).catch(() => []);
  return {
    source: people.length ? 'search' : 'none',
    read_text: readText,
    candidates: people.map((p) => ({ key: p.id, text: p.label, subtitle: p.detail })),
  };
}

// --- Scan -----------------------------------------------------------------

const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['read_text', 'key', 'alternatives'],
  properties: {
    read_text: { type: 'string', description: 'The name as read in the photo, closest to the centre' },
    key: { type: ['string', 'null'], description: 'Key of the matching candidate, or null if none matches' },
    alternatives: { type: 'array', items: { type: 'string' }, description: 'Other plausible candidate keys, best first, at most 4' },
  },
};

const SCAN_SYSTEM = `You identify which name a visitor photographed on a projected wall of names (Suriname archives, Paramaribo).
You get the photo and the list of names currently shown, one per line: key | text | font | ink colour | position on the wall (x from left, y from top, 0-1).
Read the name closest to the centre of the photo. Pick its key from the list only; never invent a key. Spelling in the photo may differ slightly (blur, lettering).
Identical names exist: break ties with font, ink colour, and which neighbouring names are visible around it compared with the positions.
If no listed name matches, key is null. read_text is always the name you read.`;

export async function scanImage(image: Blob, model?: string): Promise<ScanResult> {
  const candidates = screenCandidates();
  const stamps = new Map(activeStamps().map((s) => [s.key, s]));
  const list = candidates
    .map((c) => {
      const s = stamps.get(c.key)!;
      return `${c.key} | ${c.text} | ${c.font} | ${c.color} | x${s.x.toFixed(2)} y${s.y.toFixed(2)}`;
    })
    .join('\n');
  const b64 = Buffer.from(await image.arrayBuffer()).toString('base64');
  const out = await chatJson<{ read_text: string; key: string | null; alternatives: string[] }>({
    model,
    name: 'scan',
    schema: SCAN_SCHEMA,
    system: SCAN_SYSTEM,
    user: [
      { type: 'text', text: candidates.length ? `Names on screen now:\n${list}` : 'No names are on screen right now; just read the name.' },
      { type: 'image_url', image_url: { url: `data:${image.type || 'image/jpeg'};base64,${b64}`, detail: 'high' } },
    ],
  });
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const picked = [out.key, ...out.alternatives].filter((k): k is string => !!k && byKey.has(k));
  const unique = [...new Set(picked)].slice(0, 5);
  if (unique.length) return { source: 'display', read_text: out.read_text, candidates: unique.map((k) => byKey.get(k)!) };
  return fromSearch(out.read_text);
}

// Typed instead of photographed: match the screens first, then the archive.
export async function scanText(text: string): Promise<ScanResult> {
  const q = fold(text);
  const words = q.split(' ').filter(Boolean);
  const hits = screenCandidates().filter((c) => {
    const t = fold(c.text);
    return words.every((w) => t.includes(w));
  });
  if (hits.length) return { source: 'display', read_text: text, candidates: hits.slice(0, 8) };
  return fromSearch(text);
}

// --- Transcription hints ----------------------------------------------------

export function transcriptionPrompt(ctx: PersonContext | null, name?: string) {
  if (!ctx) return name ? `Een verhaal over ${name} uit Suriname.` : '';
  const names = [ctx.name, ...ctx.related.map((r) => r.name)].slice(0, 40);
  return `Een verhaal over ${ctx.name} uit Suriname. Namen: ${names.join(', ')}. Plaatsen: ${['Paramaribo', ...ctx.places].slice(0, 20).join(', ')}.`.slice(0, 1200);
}

// --- Extraction -------------------------------------------------------------

const RELATIONS = ['parent', 'child', 'sibling', 'spouse', 'grandparent', 'grandchild', 'friend', 'colleague', 'other'];
const BLOOD = new Set(['parent', 'child', 'sibling', 'grandparent', 'grandchild']);
const FIELDS = ['occupation', 'birth_year', 'death_year', 'religion', 'address_text'];
const nullable = (t: string, extra: object = {}) => ({ type: [t, 'null'], ...extra });

const TYPES = ['person', 'place', 'date', 'occupation', 'relation', 'organisation', 'other'];

// What the story says about when and where someone lived.
const LIFE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['born', 'died', 'alive_in', 'place'],
  properties: {
    born: nullable('integer'),
    died: nullable('integer'),
    alive_in: nullable('integer', { description: 'A year the story says they were alive (worked, married, moved …)' }),
    place: nullable('string', { description: 'Where they lived, as told' }),
  },
};

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'subject_life', 'entities', 'relations'],
  properties: {
    summary: { type: 'string' },
    subject_life: LIFE_SCHEMA,
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['mention', 'type', 'about', 'is_subject', 'kind', 'related_key', 'name_raw', 'field', 'value', 'place_raw', 'year', 'quote', 'possibly_living', 'life'],
        properties: {
          mention: { type: 'string', description: 'The exact words in the transcript, copied character for character' },
          type: { type: 'string', enum: TYPES },
          about: nullable('string', { description: 'Who this concerns: "subject", "narrator", or the name of another person' }),
          is_subject: { type: 'boolean', description: 'This person entity is the subject themselves' },
          kind: nullable('string', { enum: ['fact', 'place', 'date', null] }),
          related_key: nullable('string'),
          name_raw: nullable('string'),
          field: nullable('string', { enum: [...FIELDS, null] }),
          value: nullable('string'),
          place_raw: nullable('string'),
          year: nullable('integer'),
          quote: { type: 'string', description: 'The sentence from the transcript it comes from, copied exactly' },
          possibly_living: { type: 'boolean' },
          life: LIFE_SCHEMA,
        },
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'type', 'quote'],
        properties: {
          from: { type: 'string', description: '"subject", "narrator", or a person entity\'s mention, copied exactly' },
          to: { type: 'string', description: 'same as from' },
          type: { type: 'string', enum: RELATIONS, description: 'What `to` is of `from`' },
          quote: { type: 'string' },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You read a visitor's spoken story (Dutch, sometimes Sranan; transcribed, so spelling may be off) about a person from the Suriname archives (the subject).

Step 1, recognise: list EVERY entity in the transcript, in order of appearance: each person, place (country, district, town, street, plantation, building), date or year, occupation, and organisation. People: a relative referred to only by kinship ("zijn vader", "zijn moeder", "háár grootmoeder", "mijn oma" when no name follows) IS a person entity (type person, name_raw null, mention = those words), so they can have relations. A kinship word directly followed by that person's name ("mijn grootvader" in "mijn grootvader heette Ramlal") is a separate entity of type relation. One entry per distinct entity (its first mention). Never skip one because it is not about the subject or not in the archive. Set type, and about = "subject", "narrator" or the name of the other person it concerns (for a person or kinship word: whose relative they are). is_subject = true only for a person entity that is the subject themselves (same person, possibly named differently, e.g. "mijn grootmoeder Johanna" when Johanna is the subject); else false.

Step 2, place it in the dataset: if the entity can be stored as an addition about the subject, set kind and its columns of the contributions table; otherwise kind = null (it is still listed).
- persons never get a kind: their family ties go in "relations" (step 3). related_key = a key from the candidate people list only if clearly the same person, else null. name_raw = the name as told (null if unnamed). value = anything told about that person, in a few words.
- kind "fact": about the subject. field = one of ${FIELDS.join(', ')}; value = as told (years as digits).
- kind "place": a place in the subject's life. place_raw = as told; value = what happened there.
- kind "date": a dated event in the subject's life. year; value = the event.
A kinship word right before a named person ("mijn grootvader" in "mijn grootvader heette Ramlal") is its own entity of type relation with kind null. Places, dates and occupations of other people get kind null.

Step 3, relations: list every family or social tie the story states between two people, including the subject and the narrator, as {from, to, type, quote}. from and to are "subject", "narrator", or a person entity's mention copied exactly. type is what "to" is of "from". Examples: "G.W. had twee kinderen, Anna en Kees" → {from: "subject", to: "Anna", type: "child"}, {from: "subject", to: "Kees", type: "child"}; "Anna kreeg een dochter, Maria" → {from: "Anna", to: "Maria", type: "child"}; "mijn grootvader heette Ramlal Doerga" → {from: "narrator", to: "Ramlal Doerga", type: "grandparent"}; "zijn vader kwam uit Calcutta" (his = Ramlal) → {from: "Ramlal Doerga", to: "zijn vader", type: "parent"}. Kinship is relative to whoever it is said of: "mijn oma" is the narrator's grandmother, not the subject's; "háár grootmoeder" is oma's. Only ties that are said, never derived ones (do not add grandparent ties that follow from two parent ties).

Rules: only what is said, never infer. "mention" is copied exactly from the transcript; "quote" is the sentence it is in, copied exactly. For person entities set name_raw to the name as told and possibly_living true if they may still be alive (the narrator's parents or siblings, anyone born after 1930). Columns that do not apply are null. value and summary are written in Dutch; call people by their name, never "the subject" or "de subject".

Lifetimes: "life" (on every person entity; all null for other types) and "subject_life" (the subject) hold only what the transcript itself says, never what is known from the archive: born / died years, alive_in = one year they were alive (worked, married, arrived …; "rond 1908" → 1908), place = where they lived. Use null when not said; never guess from generations.`;

const KINSHIP = /\b(oma|opa|grootmoeder|grootvader|over\w*|moeder|vader|ma|pa|zus|zuster|broer|oom|tante|neef|nicht|zoon|dochter|kind|man|vrouw|echtgeno\w*|kleinkind|kleinzoon|kleindochter|familie)\b/i;

const NARRATOR_KIN = '(?:moeder|vader|oma|opa|ouders?|broer|zus|zuster|oom|tante|neef|nicht|zoon|dochter|man|vrouw|\\w*moeder|\\w*vader)';
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "mijn grootvader (heette) Ramlal": the narrator's own relative.
// The kinship word itself, for when the model leaves narrator_relation empty.
const KIN_TYPE: [RegExp, string][] = [
  [/^(groot|over|oud)\w*(moeder|vader)$|^(oma|opa)$/, 'grandparent'],
  [/^(moeder|vader|ouders?|ma|pa)$/, 'parent'],
  [/^(broer|zus|zuster)$/, 'sibling'],
  [/^(man|vrouw)$/, 'spouse'],
  [/^(zoon|dochter)$/, 'child'],
];
// The kinship word the narrator used for a named person ("grootvader").
const narratorKinWord = (quote: string, name: string): string | null =>
  new RegExp(`\\b(?:mijn|onze)\\s+(${NARRATOR_KIN})\\s+(?:heette\\s+|was\\s+|,\\s*)?${escapeRe(name.trim().split(/\s+/)[0])}`, 'i').exec(quote)?.[1].toLowerCase() ?? null;
const narratorKin = (quote: string, name: string): string | null => {
  const word = narratorKinWord(quote, name);
  return word ? (KIN_TYPE.find(([re]) => re.test(word))?.[1] ?? 'other') : null;
};
// Same kinship, other words: "oma" is the "grootmoeder" named earlier.
const KIN_CLASS: [RegExp, string][] = [
  [/^(oma|\w*grootmoeder)$/, 'grandmother'],
  [/^(opa|\w*grootvader)$/, 'grandfather'],
  [/^(moeder|ma|mama|mams)$/, 'mother'],
  [/^(vader|pa|papa|paps)$/, 'father'],
];
const kinClass = (word: string | null) => (word ? (KIN_CLASS.find(([re]) => re.test(word))?.[1] ?? null) : null);

// --- Relations between the people of a story ---------------------------------

type RawRelation = { from: string; to: string; type: string; quote: string };

// Stored one way only: elder → younger ("to is child of from"), partners and
// siblings in a fixed order, so "A parent of B" and "B child of A" are one tie.
const FLIP: Record<string, string> = { parent: 'child', grandparent: 'grandchild' };
function canonical(r: StoryRelation): StoryRelation {
  if (FLIP[r.type]) return { ...r, from: r.to, to: r.from, type: FLIP[r.type] };
  if ((r.type === 'spouse' || r.type === 'sibling' || r.type === 'friend') && r.from > r.to) return { ...r, from: r.to, to: r.from };
  return r;
}

// What `who` is of `other`, read from the canonical ties ("parent", "child" …).
const UNFLIP: Record<string, string> = { child: 'parent', grandchild: 'grandparent' };
function tieOf(relations: StoryRelation[], who: string, other: string): string | null {
  for (const r of relations) {
    if (r.from === other && r.to === who) return r.type;
    if (r.from === who && r.to === other) return UNFLIP[r.type] ?? r.type;
  }
  return null;
}

// The model names people by their mention; turn that into entity ids
// ("s3"), "subject" or "narrator". Ties nobody can be found for are dropped.
function resolveRelations(entities: Suggestion[], raw: RawRelation[], isSelf: (x: string) => boolean): StoryRelation[] {
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const people = entities.map((e, i) => ({ e, id: `s${i}` })).filter(({ e }) => e.type === 'person');
  // "Volgens oma …" after "mijn grootmoeder Johanna": a bare kinship word is
  // the narrator's relative named earlier with that kinship, if only one fits.
  const alias = new Map<string, string>();
  const named = people.flatMap(({ e, id }) => {
    const cls = kinClass(narratorKinWord(e.quote, e.name_raw ?? e.mention) ?? fold(e.mention).match(/^(?:mijn|onze)\s+(\S+)\s+\S/)?.[1] ?? null);
    return cls && e.name_raw !== null ? [{ id: e.is_subject ? 'subject' : id, cls }] : [];
  });
  for (const { e, id } of people) {
    if (e.name_raw !== null || e.is_subject) continue;
    const cls = kinClass(fold(e.mention).replace(/^(mijn|onze)\s+/, ''));
    const fits = named.filter((n) => n.cls === cls);
    if (cls && fits.length === 1) {
      alias.set(id, fits[0].id);
      e.type = 'relation'; // shown as a kinship word for that person, not a person of its own
    }
  }
  const ref = (x: string): string | null => {
    const r = refOnce(x);
    return r && alias.has(r) ? alias.get(r)! : r;
  };
  const refOnce = (x: string): string | null => {
    const f = fold(x);
    if (f === 'subject') return 'subject';
    if (f === 'narrator' || f === 'verteller') return 'narrator';
    const hit =
      people.find(({ e }) => fold(e.mention) === f || (e.name_raw && fold(e.name_raw) === f)) ??
      people.find(({ e }) => fold(e.mention).includes(f) || f.includes(fold(e.mention)));
    if (hit) return hit.e.is_subject ? 'subject' : hit.id;
    return isSelf(x) ? 'subject' : null;
  };

  const out = new Map<string, StoryRelation>();
  const add = (r: StoryRelation) => {
    const c = canonical(r);
    const k = `${c.from}|${c.to}`;
    if (c.from !== c.to && !out.has(k) && !out.has(`${c.to}|${c.from}`)) out.set(k, c);
  };
  for (const r of raw) {
    const from = ref(r.from);
    const to = ref(r.to);
    if (from && to && RELATIONS.includes(r.type)) add({ id: '', from, to, type: r.type, quote: r.quote });
  }
  // "mijn grootvader heette Ramlal" says it in so many words: the narrator's
  // relative, never the subject's (unless the story says so separately).
  for (const { e, id } of people) {
    const kin = narratorKin(e.quote, e.name_raw ?? e.mention);
    if (!kin || e.is_subject || e.type !== 'person') continue;
    if (alias.has(id)) continue;
    const misread = canonical({ id: '', from: 'subject', to: id, type: kin, quote: '' });
    out.delete(`${misread.from}|${misread.to}`);
    add({ id: '', from: 'narrator', to: id, type: kin, quote: e.quote });
  }
  return [...out.values()].map((r, i) => ({ ...r, id: `r${i}` }));
}

const CATEGORY: Record<string, ResolvedSuggestion['category']> = {
  person: 'per',
  place: 'pla',
  date: 'dat',
  occupation: 'rol',
  relation: 'rel',
  organisation: 'oth',
  other: 'oth',
};

const MAX_OPTIONS = 10;
const yearsOf = (l: LifeFacts) => [l.born && `geboren ${l.born}`, l.died && `overleden ${l.died}`, l.alive_in && l.alive_in !== l.died && `leefde in ${l.alive_in}`].filter(Boolean).join(', ');

// Is the chosen record the person the story is about? A screen stamp is
// certain; a pick from the search (or "not sure") is checked against what
// the story says, and the records that do fit are offered instead.
async function checkSubject(key: string, name: string, certain: boolean, life: LifeFacts): Promise<SubjectCheck> {
  if (certain) return { status: 'ok', reason: null, options: [] };
  const own = await lifeOfKey(key).catch(() => null);
  const ownFits = own ? fits(own, life) : false;
  if (own && ownFits) return { status: 'ok', reason: null, options: [] };
  const options = (await searchPeople(name).catch(() => [])).filter((o) => o.id !== key && fits({ born: o.born ?? null, died: o.died ?? null }, life)).slice(0, MAX_OPTIONS);
  const told = yearsOf(life);
  const reason = own ? `Je verhaal zegt: ${told || 'iets anders'}. Dat past niet bij het gekozen archiefstuk.` : null;
  return { status: options.length ? 'check' : 'none', reason, options };
}

export async function extract(key: string, transcript: string, opts: { name?: string; certain?: boolean; model?: string } = {}): Promise<ExtractResult> {
  const { model } = opts;
  const ctx = await buildContext(key).catch(() => null);
  const subjectName = ctx?.name ?? opts.name ?? key;
  const people = (ctx?.related ?? []).slice(0, 60);
  // An uncertain pick may be the wrong record: then its facts must not
  // leak into what the story is taken to say.
  const known = opts.certain && ctx;
  const user = [
    `Subject: ${subjectName} (${key})${known && ctx.birthYear ? `, born about ${ctx.birthYear}` : ''}.`,
    known && ctx.facts.length ? `Known from the archive: ${ctx.facts.map((f) => `${f.label}: ${f.value}`).join('; ')}.` : '',
    people.length ? `Candidate people (key | name | role on record | year):\n${people.map((p) => `${p.key} | ${p.name} | ${p.role ?? ''} | ${p.year ?? ''}`).join('\n')}` : 'No candidate people.',
    `Transcript:\n"""${transcript}"""`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const out = await chatJson<{ summary: string; subject_life: LifeFacts; entities: Suggestion[]; relations: RawRelation[] }>({ model, name: 'story', schema: EXTRACT_SCHEMA, system: EXTRACT_SYSTEM, user });
  // The model sometimes writes the subject's name instead of "subject".
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const selfNames = [subjectName, ...out.entities.filter((e) => e.is_subject).flatMap((e) => [e.name_raw ?? '', e.mention])].map(fold).filter((x) => x.length > 2);
  // Same person when every word of one name occurs in the other ("Johanna"
  // in "Johanna Wijngaarde"); kinship words and short fragments never count.
  const words = (x: string) => fold(x).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !KINSHIP.test(w) && w !== 'mijn');
  const isSelf = (about: string) => {
    const a = words(about);
    return a.length > 0 && selfNames.some((n) => {
      const w = words(n);
      return w.length > 0 && (a.every((x) => w.includes(x)) || w.every((x) => a.includes(x)));
    });
  };
  for (const e of out.entities) if (e.about && e.about !== 'subject' && e.about !== 'narrator' && isSelf(e.about)) e.about = 'subject';
  const relations = resolveRelations(out.entities, out.relations, isSelf);
  // Per person, their tie to the subject and to the narrator (for the list,
  // the archive search and the save screen).
  out.entities.forEach((e, i) => {
    const id = e.is_subject ? 'subject' : `s${i}`;
    e.relation_type = e.is_subject ? null : tieOf(relations, id, 'subject');
    e.narrator_relation = tieOf(relations, id, 'narrator');
  });
  const keyed = new Map(people.map((p) => [p.key, p.name]));

  const suggestions = await Promise.all(
    out.entities.map(async (s, i): Promise<ResolvedSuggestion> => {
      const r: ResolvedSuggestion = { ...s, id: `s${i}`, category: CATEGORY[s.type] ?? 'oth', options: [], linked: null, linkedLabel: null };
      // Places, facts and dates only become rows when they are about the
      // subject; the model's own `about` decides, not its `kind`.
      // Only what concerns the subject becomes a row: someone else's relatives,
      // places and dates stay recognised-only. A person can only be a
      // relation, and the subject is never their own relative.
      if (r.about && r.about !== 'subject') r.kind = null;
      // An occupation of the subject always has a column of its own.
      else if (r.type === 'occupation' && !r.kind) Object.assign(r, { kind: 'fact', field: 'occupation', value: r.value ?? r.mention });
      if (r.type === 'person') r.kind = null; // their ties are in `relations`
      if (r.is_subject) {
        r.kind = null;
        r.linked = key.startsWith('name:') ? null : key;
        r.linkedLabel = ctx?.name ?? null;
        r.category = 'per';
        return r;
      }
      if (r.type === 'other' && KINSHIP.test(r.mention)) {
        r.type = 'relation';
        r.category = 'rel';
      }
      if (s.related_key && !keyed.has(s.related_key)) r.related_key = null; // only keys we offered
      if (r.related_key) {
        r.linked = r.related_key;
        r.linkedLabel = keyed.get(r.related_key)!;
      } else if (s.type === 'person') {
        // "his brother Carl": blood relatives usually share the surname.
        const name = (s.name_raw ?? s.mention).trim();
        const firstOnly = !name.includes(' ') && BLOOD.has(s.relation_type ?? '') && ctx?.surname;
        // Only records that can be this person, given what the story says.
        const found = await searchPeople(firstOnly ? `${name} ${ctx.surname}` : name, ctx?.birthYear).catch(() => []);
        r.options = found.filter((o) => fits({ born: o.born ?? null, died: o.died ?? null }, s.life)).slice(0, MAX_OPTIONS);
      }
      const place = s.type === 'place' || r.kind === 'place' ? (s.place_raw ?? s.mention) : s.field === 'address_text' ? s.value : null;
      if (place) {
        r.options = await searchPlaces(place).catch(() => []);
        // Only auto-link a place that becomes a row; the rest are just shown.
        if (s.kind && r.options[0]) {
          r.linked = r.options[0].id;
          r.linkedLabel = r.options[0].label;
        }
      }
      return r;
    }),
  );
  // What the story says about the subject: its own lifetime, plus what the
  // named subject entity carries.
  const self = out.entities.find((e) => e.is_subject)?.life;
  const life: LifeFacts = {
    born: out.subject_life.born ?? self?.born ?? null,
    died: out.subject_life.died ?? self?.died ?? null,
    alive_in: out.subject_life.alive_in ?? self?.alive_in ?? null,
    place: out.subject_life.place ?? self?.place ?? null,
  };
  const subject = await checkSubject(key, subjectName, !!opts.certain, life);
  return { summary: out.summary, suggestions, subject, relations };
}
