// The story pipeline: which name was scanned, and what a told story says,
// mapped onto the columns of the contributions dataset.
import type { Candidate, ExtractResult, PersonContext, ResolvedSuggestion, ScanResult, Suggestion } from '../shared/story';
import { buildContext, searchPeople, searchPlaces } from './archive';
import { activeStamps } from './display';
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

export function transcriptionPrompt(ctx: PersonContext | null) {
  if (!ctx) return '';
  const names = [ctx.name, ...ctx.related.map((r) => r.name)].slice(0, 40);
  return `Een verhaal over ${ctx.name} uit Suriname. Namen: ${names.join(', ')}. Plaatsen: ${['Paramaribo', ...ctx.places].slice(0, 20).join(', ')}.`.slice(0, 1200);
}

// --- Extraction -------------------------------------------------------------

const RELATIONS = ['parent', 'child', 'sibling', 'spouse', 'grandparent', 'grandchild', 'friend', 'colleague', 'other'];
const BLOOD = new Set(['parent', 'child', 'sibling', 'grandparent', 'grandchild']);
const FIELDS = ['occupation', 'birth_year', 'death_year', 'religion', 'address_text'];
const nullable = (t: string, extra: object = {}) => ({ type: [t, 'null'], ...extra });

const TYPES = ['person', 'place', 'date', 'occupation', 'relation', 'organisation', 'other'];

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'entities'],
  properties: {
    summary: { type: 'string' },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['mention', 'type', 'about', 'is_subject', 'kind', 'relation_type', 'related_key', 'name_raw', 'field', 'value', 'place_raw', 'year', 'quote', 'possibly_living'],
        properties: {
          mention: { type: 'string', description: 'The exact words in the transcript, copied character for character' },
          type: { type: 'string', enum: TYPES },
          about: nullable('string', { description: 'Who this concerns: "subject", "narrator", or the name of another person' }),
          is_subject: { type: 'boolean', description: 'This person entity is the subject themselves' },
          kind: nullable('string', { enum: ['relation', 'fact', 'place', 'date', null] }),
          relation_type: nullable('string', { enum: [...RELATIONS, null] }),
          related_key: nullable('string'),
          name_raw: nullable('string'),
          field: nullable('string', { enum: [...FIELDS, null] }),
          value: nullable('string'),
          place_raw: nullable('string'),
          year: nullable('integer'),
          quote: { type: 'string', description: 'The sentence from the transcript it comes from, copied exactly' },
          possibly_living: { type: 'boolean' },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You read a visitor's spoken story (Dutch, sometimes Sranan; transcribed, so spelling may be off) about a person from the Suriname archives (the subject).

Step 1, recognise: list EVERY entity in the transcript, in order of appearance: each person name (also the narrator's relatives), place (country, district, town, street, plantation, building), date or year, occupation, kinship word ("oma", "broer", "vader"), and organisation. One entry per distinct entity (its first mention). Never skip one because it is not about the subject or not in the archive. Set type, and about = "subject", "narrator" or the name of the other person it concerns (for a person or kinship word: whose relative they are). is_subject = true only for a person entity that is the subject themselves (same person, possibly named differently, e.g. "mijn grootmoeder Johanna" when Johanna is the subject); else false.

Step 2, place it in the dataset: if the entity can be stored as an addition about the subject, set kind and its columns of the contributions table; otherwise kind = null (it is still listed).
- kind "relation": a person related to the subject. relation_type = how that person relates to the subject (parent = they are the subject's parent, etc.). related_key = a key from the candidate people list only if clearly the same person, else null. name_raw = the name as told (null if unnamed, e.g. "zijn vader"). value = anything told about that person, in a few words.
- kind "fact": about the subject. field = one of ${FIELDS.join(', ')}; value = as told (years as digits).
- kind "place": a place in the subject's life. place_raw = as told; value = what happened there.
- kind "date": a dated event in the subject's life. year; value = the event.
A kinship word gets kind null (its person carries the relation). Kinship is relative to whoever it is said of: "mijn oma" is the narrator's grandmother, not the subject's; a narrator's relative becomes kind "relation" only if the story says how they relate to the subject. Places, dates and occupations of other people get kind null.

Rules: only what is said, never infer. "mention" is copied exactly from the transcript; "quote" is the sentence it is in, copied exactly. For person entities set name_raw to the name as told and possibly_living true if they may still be alive (the narrator's parents or siblings, anyone born after 1930). Columns that do not apply are null. summary: one sentence in Dutch.`;

const KINSHIP = /\b(oma|opa|grootmoeder|grootvader|over\w*|moeder|vader|ma|pa|zus|zuster|broer|oom|tante|neef|nicht|zoon|dochter|kind|man|vrouw|echtgeno\w*|kleinkind|kleinzoon|kleindochter|familie)\b/i;

const CATEGORY: Record<string, ResolvedSuggestion['category']> = {
  person: 'per',
  place: 'pla',
  date: 'dat',
  occupation: 'rol',
  relation: 'rel',
  organisation: 'oth',
  other: 'oth',
};

export async function extract(key: string, transcript: string, model?: string): Promise<ExtractResult> {
  const ctx = await buildContext(key).catch(() => null);
  const people = (ctx?.related ?? []).slice(0, 60);
  const user = [
    `Subject: ${ctx?.name ?? key} (${key})${ctx?.birthYear ? `, born about ${ctx.birthYear}` : ''}.`,
    ctx?.facts.length ? `Known: ${ctx.facts.map((f) => `${f.label}: ${f.value}`).join('; ')}.` : '',
    people.length ? `Candidate people (key | name | role on record | year):\n${people.map((p) => `${p.key} | ${p.name} | ${p.role ?? ''} | ${p.year ?? ''}`).join('\n')}` : 'No candidate people.',
    `Transcript:\n"""${transcript}"""`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const out = await chatJson<{ summary: string; entities: Suggestion[] }>({ model, name: 'story', schema: EXTRACT_SCHEMA, system: EXTRACT_SYSTEM, user });
  const known = new Map(people.map((p) => [p.key, p.name]));

  const suggestions = await Promise.all(
    out.entities.map(async (s, i): Promise<ResolvedSuggestion> => {
      const r: ResolvedSuggestion = { ...s, id: `s${i}`, category: CATEGORY[s.type] ?? 'oth', options: [], linked: null, linkedLabel: null };
      // Places, facts and dates only become rows when they are about the
      // subject; the model's own `about` decides, not its `kind`.
      // Only what concerns the subject becomes a row: someone else's relatives,
      // places and dates stay recognised-only. A person can only be a
      // relation, and the subject is never their own relative.
      if (r.about && r.about !== 'subject') r.kind = null;
      if (r.type === 'person' && r.kind !== 'relation') r.kind = null;
      if (r.is_subject) {
        r.kind = null;
        r.linked = key;
        r.linkedLabel = ctx?.name ?? null;
        r.category = 'per';
        return r;
      }
      if (r.type === 'other' && KINSHIP.test(r.mention)) {
        r.type = 'relation';
        r.category = 'rel';
      }
      if (s.related_key && !known.has(s.related_key)) r.related_key = null; // only keys we offered
      if (r.related_key) {
        r.linked = r.related_key;
        r.linkedLabel = known.get(r.related_key)!;
      } else if (s.type === 'person') {
        // "his brother Carl": blood relatives usually share the surname.
        const name = (s.name_raw ?? s.mention).trim();
        const firstOnly = s.kind === 'relation' && !name.includes(' ') && BLOOD.has(s.relation_type ?? '') && ctx?.surname;
        r.options = await searchPeople(firstOnly ? `${name} ${ctx.surname}` : name, ctx?.birthYear).catch(() => []);
      }
      const place = s.type === 'place' ? (s.place_raw ?? s.mention) : s.field === 'address_text' ? s.value : null;
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
  return { summary: out.summary, suggestions };
}
