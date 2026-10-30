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

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'suggestions'],
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'mention', 'relation_type', 'related_key', 'name_raw', 'field', 'value', 'place_raw', 'year', 'quote', 'possibly_living'],
        properties: {
          kind: { type: 'string', enum: ['relation', 'fact', 'place', 'date'] },
          mention: { type: 'string', description: 'The exact words in the transcript that name this thing, copied character for character' },
          relation_type: nullable('string', { enum: [...RELATIONS, null] }),
          related_key: nullable('string'),
          name_raw: nullable('string'),
          field: nullable('string', { enum: [...FIELDS, null] }),
          value: nullable('string'),
          place_raw: nullable('string'),
          year: nullable('integer'),
          quote: { type: 'string', description: 'The short sentence from the transcript this comes from, copied exactly' },
          possibly_living: { type: 'boolean' },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You turn a visitor's spoken story (Dutch, sometimes Sranan) about a person from the Suriname archives into suggested additions for a dataset.
Each suggestion maps onto these columns of the contributions table:
- kind "relation": a person related to the subject. relation_type = how that person relates to the subject (parent = they are the subject's parent, child = they are the subject's child, etc.). related_key = a key from the candidate people list if it is clearly the same person, otherwise null and name_raw = the name as told (or null if no name was given, e.g. "his father").
- kind "fact": a fact about the subject. field = one of ${FIELDS.join(', ')}; value = the value as told (a year as digits).
- kind "place": a place connected to the subject (lived, worked, born, buried). place_raw = the place as told; value = what happened there in a few words.
- kind "date": a dated event. year = the year; value = the event in a few words.
"fact", "place" and "date" are only about the subject. Anything told about another person (where they lived, their work, their dates) goes in that person's relation suggestion as value, in a few words; never as a separate place/fact/date.
Rules: only what is actually said, never infer. Every suggestion needs "mention" (the exact words naming it, copied from the transcript) and "quote" (the sentence it comes from, copied exactly). Set possibly_living true for any person who may still be alive (e.g. the narrator's parents or siblings, anyone born after 1930). The narrator themselves is not a suggestion. Fields that do not apply are null. summary: one sentence in Dutch.`;

function category(s: Suggestion): ResolvedSuggestion['category'] {
  if (s.kind === 'relation') return s.name_raw || s.related_key ? 'per' : 'rel';
  if (s.kind === 'place') return 'pla';
  if (s.kind === 'date') return 'dat';
  if (s.field === 'occupation') return 'rol';
  if (s.field === 'birth_year' || s.field === 'death_year') return 'dat';
  if (s.field === 'address_text') return 'pla';
  return 'oth';
}

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

  const out = await chatJson<{ summary: string; suggestions: Suggestion[] }>({ model, name: 'story', schema: EXTRACT_SCHEMA, system: EXTRACT_SYSTEM, user });
  const known = new Map(people.map((p) => [p.key, p.name]));

  const suggestions = await Promise.all(
    out.suggestions.map(async (s, i): Promise<ResolvedSuggestion> => {
      const r: ResolvedSuggestion = { ...s, id: `s${i}`, category: category(s), options: [], linked: null, linkedLabel: null };
      if (s.related_key && !known.has(s.related_key)) r.related_key = null; // only keys we offered
      if (r.related_key) {
        r.linked = r.related_key;
        r.linkedLabel = known.get(r.related_key)!;
      } else if (s.kind === 'relation' && s.name_raw) {
        // "his brother Carl": blood relatives usually share the surname.
        const firstOnly = !s.name_raw.trim().includes(' ') && BLOOD.has(s.relation_type ?? '') && ctx?.surname;
        r.options = await searchPeople(firstOnly ? `${s.name_raw} ${ctx.surname}` : s.name_raw, ctx?.birthYear).catch(() => []);
      }
      const place = s.place_raw ?? (s.field === 'address_text' ? s.value : null);
      if (place) {
        r.options = await searchPlaces(place).catch(() => []);
        if (r.options[0]) {
          r.linked = r.options[0].id;
          r.linkedLabel = r.options[0].label;
        }
      }
      return r;
    }),
  );
  return { summary: out.summary, suggestions };
}
