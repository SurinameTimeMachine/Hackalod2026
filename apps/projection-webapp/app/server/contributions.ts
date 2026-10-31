// The only writer. Each saved story becomes rows in the contributions shape:
// the story itself (with its entities and their positions, for a clickable
// view), one row per entity placed in the dataset, the narrator as a person
// of their own, and their relation to the subject. Stored as JSON lines on
// this machine until the Datasette `add_contribution` write is live; a
// replay script can move them over later. Nothing here is ever deleted.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContributeRequest, SavedStory, StoryEntity, ToldEdge, ToldGraph, ToldNode } from '../shared/story';
import { LIMITS } from './config';

const DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DIR, 'contributions.jsonl');

type Record = { id: string; story_id: string | null; person_key: string; kind: string; created_at: string; reviewed: 0 } & { [k: string]: unknown };

const cut = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);

export function validate(body: unknown): ContributeRequest | string {
  const b = body as Partial<ContributeRequest> | null;
  if (!b || typeof b !== 'object') return 'expected a JSON object';
  if (typeof b.key !== 'string' || !/^(patient|person|name):.+$/.test(b.key)) return 'key: patient:/person:/name: key required';
  if (typeof b.transcript !== 'string' || !b.transcript.trim()) return 'transcript: required';
  if (b.transcript.length > LIMITS.transcriptChars) return 'transcript too long';
  if (!b.consent?.publish) return 'consent.publish must be true';
  if (!b.narrator || typeof b.narrator.name !== 'string' || !b.narrator.name.trim()) return 'narrator.name: required';
  if (!Array.isArray(b.entities) || b.entities.length > 200) return 'entities: array of at most 200';
  return b as ContributeRequest;
}

export async function save(req: ContributeRequest): Promise<{ story: SavedStory; added: ToldGraph }> {
  const now = new Date().toISOString();
  const storyId = randomUUID();
  const narratorKey = `name:${randomUUID()}`;
  const base = { story_id: storyId, created_at: now, reviewed: 0 as const, contributor: cut(req.narrator.name, 120), contributor_key: narratorKey };
  const rows: Record[] = [];

  // One row per entity that lands in the dataset.
  const entities: StoryEntity[] = req.entities.map((e) => {
    const clean: StoryEntity = {
      id: String(e.id),
      start: Number(e.start) || 0,
      end: Number(e.end) || 0,
      mention: cut(e.mention, 200) ?? '',
      type: e.type,
      category: e.category,
      about: cut(e.about, 120),
      is_subject: !!e.is_subject,
      confirmed: !!e.confirmed,
      link: cut(e.link, 200),
      link_label: cut(e.link_label, 200),
      quote: cut(e.quote, 500) ?? '',
      row: null,
      row_id: null,
      narrator_relation: cut(e.narrator_relation, 40),
    };
    if (e.row) {
      const id = randomUUID();
      const r = e.row;
      clean.row = {
        kind: r.kind,
        relation_type: cut(r.relation_type, 40),
        related_key: cut(r.related_key, 120),
        name_raw: cut(r.name_raw, 200),
        field: cut(r.field, 40),
        value: cut(r.value, 500),
        place_raw: cut(r.place_raw, 200),
        place_norm: cut(r.place_norm, 200),
        year: Number.isInteger(r.year) ? r.year : null,
      };
      clean.row_id = id;
      rows.push({ id, person_key: req.key, ...clean.row, quote: clean.quote, mention: clean.mention, confirmed: clean.confirmed, ...base });
    }
    return clean;
  });

  // The narrator: a person of their own, related to the subject.
  const narrator = {
    key: narratorKey,
    name: cut(req.narrator.name, 120)!,
    relation: cut(req.narrator.relation, 40),
    relation_label: cut(req.narrator.relation_label, 80),
    about: cut(req.narrator.about, 2000),
  };
  rows.push({ id: randomUUID(), person_key: narratorKey, kind: 'narrator', name_raw: narrator.name, value: narrator.about, ...base });
  if (narrator.relation || narrator.relation_label)
    rows.push({
      id: randomUUID(),
      person_key: req.key,
      kind: 'relation',
      relation_type: narrator.relation ?? 'other',
      related_key: narratorKey,
      name_raw: narrator.name,
      value: narrator.relation_label,
      confirmed: true,
      ...base,
    });

  // The narrator's own family as told ("mijn grootvader Ramlal"): relation
  // rows from the narrator to those people.
  for (const e of entities)
    if (e.narrator_relation && !e.is_subject)
      rows.push({
        id: randomUUID(),
        person_key: narratorKey,
        kind: 'relation',
        relation_type: e.narrator_relation,
        related_key: e.link && /^(patient|person):/.test(e.link) ? e.link : null,
        name_raw: e.link_label ?? e.mention,
        quote: e.quote,
        confirmed: true,
        ...base,
      });

  const story: SavedStory = {
    id: storyId,
    person_key: req.key,
    person_name: cut(req.subject_name, 200) ?? '',
    transcript: req.transcript.trim(),
    summary: cut(req.summary, 500) ?? '',
    entities,
    narrator,
    created_at: now,
    reviewed: 0,
  };
  const storyRow: Record = { ...story, id: storyId, story_id: null, kind: 'story', value: story.transcript, created_at: now, reviewed: 0, contributor: narrator.name, contributor_key: narratorKey };

  await mkdir(DIR, { recursive: true });
  await appendFile(FILE, [storyRow, ...rows].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return { story, added: graphOf(story, rows) };
}

// --- What stories add to a constellation ------------------------------------

// `to` is `type` of `from`: which end a family tree draws higher, and by how
// many generations; partners and siblings side by side.
function shape(type: string, from: string, to: string): Pick<ToldEdge, 'up' | 'generations' | 'level'> {
  if (type === 'parent') return { up: to, generations: 1 };
  if (type === 'grandparent') return { up: to, generations: 2 };
  if (type === 'child') return { up: from, generations: 1 };
  if (type === 'grandchild') return { up: from, generations: 2 };
  if (type === 'spouse' || type === 'sibling') return { level: true };
  return {};
}

const isArchive = (key: string) => /^(patient|person):/.test(key);

function graphOf(story: SavedStory, rows: Record[]): ToldGraph {
  const names = new Map<string, string>([
    [story.person_key, story.person_name],
    [story.narrator.key, story.narrator.name],
  ]);
  for (const e of story.entities) if (e.link && e.link_label && isArchive(e.link)) names.set(e.link, e.link_label);

  const nodes = new Map<string, ToldNode>();
  const node = (key: string, name?: string | null) => {
    if (nodes.has(key)) return;
    const kind = key === story.narrator.key ? 'narrator' : isArchive(key) ? 'archive' : 'told';
    nodes.set(key, { key, name: name ?? names.get(key) ?? '?', kind, story_id: story.id });
  };
  node(story.person_key);

  const edges: ToldEdge[] = [];
  const facts: string[] = [];
  for (const r of rows) {
    if (r.kind === 'narrator') node(r.person_key, r.name_raw as string);
    if (r.kind === 'relation') {
      // A relative told by name only gets a stable key of their own.
      const to = (r.related_key as string | null) ?? `told:${r.id}`;
      node(r.person_key);
      node(to, (r.name_raw as string | null) ?? names.get(to));
      const type = (r.relation_type as string | null) ?? 'other';
      edges.push({ id: r.id, from: r.person_key, to, relation_type: type, ...shape(type, r.person_key, to), story_id: story.id, narrator: story.narrator.name, quote: (r.quote as string | null) ?? null });
    }
    if (r.person_key === story.person_key && (r.kind === 'fact' || r.kind === 'place' || r.kind === 'date')) {
      const text = r.kind === 'date' ? [r.value, r.year].filter(Boolean).join(' ') : r.kind === 'place' ? (r.place_raw ?? r.place_norm ?? r.value) : r.value;
      if (text) facts.push(String(text));
    }
  }
  return { nodes: [...nodes.values()], edges, notes: facts.length ? [{ key: story.person_key, text: facts.join(' · '), story_id: story.id }] : [] };
}

// Everything saved stories added around a key: stories about them, naming
// them, told by them, or with a relation row pointing at them.
export async function graphFor(key: string): Promise<ToldGraph> {
  const all = await readAll();
  const touched = new Set(all.filter((r) => r.story_id && (r.person_key === key || r.related_key === key)).map((r) => r.story_id as string));
  const stories = all.filter(
    (r) =>
      r.kind === 'story' &&
      (r.person_key === key || touched.has(r.id) || (r.entities as StoryEntity[] | undefined)?.some((e) => e.link === key) || (r.narrator as { key?: string } | undefined)?.key === key),
  );
  const out: ToldGraph = { nodes: [], edges: [], notes: [] };
  const seen = new Set<string>();
  for (const s of stories) {
    const g = graphOf(asStory(s), all.filter((r) => r.story_id === s.id));
    for (const n of g.nodes) if (!seen.has(n.key) && seen.add(n.key)) out.nodes.push(n);
    out.edges.push(...g.edges);
    out.notes.push(...g.notes);
  }
  return out;
}

async function readAll(): Promise<Record[]> {
  const text = await readFile(FILE, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record];
      } catch {
        return [];
      }
    });
}

const asStory = (r: Record): SavedStory => ({
  id: r.id,
  person_key: r.person_key,
  person_name: r.person_name as string,
  transcript: r.transcript as string,
  summary: r.summary as string,
  entities: r.entities as StoryEntity[],
  narrator: r.narrator as SavedStory['narrator'],
  created_at: r.created_at,
  reviewed: r.reviewed,
});

// Stories about a key (as the subject, or naming it as a linked entity), newest first.
export async function storiesFor(key: string): Promise<SavedStory[]> {
  return (await readAll())
    .filter((r) => r.kind === 'story' && (r.person_key === key || (r.entities as StoryEntity[] | undefined)?.some((e) => e.link === key)))
    .map(asStory)
    .reverse();
}

export async function getStory(id: string): Promise<{ story: SavedStory; rows: Record[] } | null> {
  const all = await readAll();
  const s = all.find((r) => r.kind === 'story' && r.id === id);
  return s ? { story: asStory(s), rows: all.filter((r) => r.story_id === id) } : null;
}

export async function allStories(): Promise<SavedStory[]> {
  return (await readAll()).filter((r) => r.kind === 'story').map(asStory).reverse();
}
