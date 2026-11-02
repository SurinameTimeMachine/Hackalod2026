// The only writer. Each saved story becomes rows in the contributions
// database (Datasette, next to the archive): the story itself in `stories`,
// its entities with their positions in `story_entities` (for a clickable
// view), and in `contributions` one row per entity placed in the dataset, the
// narrator as a person of their own, and every relation the story told.
// Archive ids (person_id, obs_key, patient_id) are filled in from the keys so
// rows join the archive directly. Nothing here is ever deleted; a save that
// Datasette refuses is kept in data/failed.jsonl so no story is lost.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseKey } from '../shared/keys';
import type { ContributeRequest, ContributionRow, SavedStory, StoryEntity, ToldEdge, ToldGraph, ToldNode } from '../shared/story';
import { obsKeyOf } from './archive';
import { CONTRIBUTIONS, LIMITS } from './config';

const DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

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
    // Every person gets one key for the whole story: the scanned person, an
    // archive record they were linked to, or a told person of their own.
    if (e.type === 'person')
      clean.key = clean.is_subject ? req.key : clean.link && isArchive(clean.link) ? clean.link : `told:${storyId}/${clean.id}`;
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

  // Every tie the story told, between any two of its people ("Anna kreeg
  // een dochter, Maria"), as one relation row: `to` is `type` of `from`.
  const byId = new Map(entities.filter((e) => e.key).map((e) => [e.id, e]));
  const keyOf = (end: string) => (end === 'subject' ? req.key : end === 'narrator' ? narratorKey : (byId.get(end)?.key ?? null));
  const nameOf = (end: string) => (end === 'subject' ? cut(req.subject_name, 200) : end === 'narrator' ? narrator.name : (byId.get(end)?.link_label ?? byId.get(end)?.mention ?? null));
  const relations: SavedStory['relations'] = [];
  for (const r of (req.relations ?? []).slice(0, 200)) {
    const from = keyOf(String(r.from));
    const to = keyOf(String(r.to));
    // The narrator's tie to the subject comes from the save screen, as chosen.
    const pair = [r.from, r.to].sort().join('|');
    if (!from || !to || from === to || pair === 'narrator|subject') continue;
    const row_id = randomUUID();
    const type = cut(r.type, 40) ?? 'other';
    rows.push({ id: row_id, person_key: from, kind: 'relation', relation_type: type, related_key: to, name_raw: nameOf(String(r.to)), quote: cut(r.quote, 500), confirmed: true, ...base });
    relations.push({ id: String(r.id), from: String(r.from), to: String(r.to), type, quote: cut(r.quote, 500) ?? '', row_id, from_key: from, to_key: to });
  }

  const story: SavedStory = {
    id: storyId,
    person_key: req.key,
    person_name: cut(req.subject_name, 200) ?? '',
    transcript: req.transcript.trim(),
    summary: cut(req.summary, 500) ?? '',
    entities,
    narrator,
    relations,
    created_at: now,
    reviewed: 0,
  };
  await persist(story, rows).catch(async (e) => {
    await mkdir(DIR, { recursive: true });
    await appendFile(path.join(DIR, 'failed.jsonl'), JSON.stringify({ story, rows, error: String(e) }) + '\n', 'utf8');
    throw e;
  });
  return { story, added: graphOf(story, rows) };
}

// --- Datasette ---------------------------------------------------------------

async function write(query: string, params: { [k: string]: unknown }, retry = 1): Promise<void> {
  const r = await fetch(`${CONTRIBUTIONS}/${query}?_json=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Datasette turns a JSON null into the text "None"; '' is NULLIF'd to NULL.
    body: JSON.stringify(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v ?? '']))),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => {
    if (retry) return null; // one retry on a network hiccup
    throw e;
  });
  if (!r) return write(query, params, retry - 1);
  const out = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!r.ok || !out?.ok) throw new Error(`contributions ${query}: ${r.status} ${out?.message ?? ''}`);
}

type Row = { [k: string]: string | number | null };

async function sql(query: string, params: { [k: string]: string } = {}): Promise<Row[]> {
  const qs = new URLSearchParams({ sql: query, _shape: 'array', ...params });
  const r = await fetch(`${CONTRIBUTIONS}.json?${qs}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!r.ok) throw new Error(`contributions ${r.status}`);
  return r.json() as Promise<Row[]>;
}

// The archive columns a key stands for.
async function ids(key: string | null | undefined) {
  const k = key ? parseKey(key) : null;
  return {
    person_id: k?.kind === 'person' ? k.id : null,
    patient_id: k?.kind === 'patient' ? k.id : null,
    obs_key: await obsKeyOf(key ?? null),
  };
}

async function persist(story: SavedStory, rows: Record[]) {
  const subject = await ids(story.person_key);
  await write('add_story', {
    id: story.id,
    person_key: story.person_key,
    ...subject,
    person_name: story.person_name,
    transcript: story.transcript,
    summary: story.summary,
    narrator_key: story.narrator.key,
    narrator_name: story.narrator.name,
    narrator_relation: story.narrator.relation,
    narrator_relation_label: story.narrator.relation_label,
    narrator_about: story.narrator.about,
    consent: 1,
    created_at: story.created_at,
  });
  const contributions = await Promise.all(
    rows.map(async ({ id, ...r }) => {
      const [own, related] = await Promise.all([ids(r.person_key), ids(r.related_key as string | null)]);
      return {
        ...r,
        uid: id,
        ...own,
        related_person_id: related.person_id,
        related_patient_id: related.patient_id,
        related_obs_key: related.obs_key,
        confirmed: r.confirmed ? 1 : 0,
        consent: 1,
      };
    }),
  );
  if (contributions.length) await write('add_story_contributions', { story_id: story.id, rows: JSON.stringify(contributions) });
  const entities = await Promise.all(
    story.entities.map(async (e) => {
      const link = await ids(e.link);
      return {
        id: `${story.id}/${e.id}`,
        story_id: story.id,
        start: e.start,
        end: e.end,
        mention: e.mention,
        type: e.type,
        category: e.category,
        about: e.about,
        is_subject: e.is_subject ? 1 : 0,
        confirmed: e.confirmed ? 1 : 0,
        quote: e.quote,
        link: e.link,
        link_label: e.link_label,
        link_person_id: link.person_id,
        link_obs_key: link.obs_key,
        link_patient_id: link.patient_id,
        link_place_norm: e.link?.startsWith('place:') ? e.link.slice(6) : null,
        contribution_uid: e.row_id,
      };
    }),
  );
  if (entities.length) await write('add_story_entities', { story_id: story.id, rows: JSON.stringify(entities) });
}

// --- What stories add to a constellation ------------------------------------

// `to` is `type` of `from`: which end a family tree draws higher, and by how
// many generations; partners and siblings side by side.
function shape(type: string, from: string, to: string): Pick<ToldEdge, 'up' | 'generations' | 'level'> {
  if (type === 'parent') return { up: to, generations: 1 };
  if (type === 'grandparent') return { up: to, generations: 2 };
  if (type === 'child') return { up: from, generations: 1 };
  if (type === 'grandchild') return { up: from, generations: 2 };
  if (type === 'great-grandchild') return { up: from, generations: 3 };
  if (type === 'spouse' || type === 'sibling') return { level: true };
  return {};
}

const isArchive = (key: string) => /^(patient|person):/.test(key);

function graphOf(story: SavedStory, rows: Record[]): ToldGraph {
  const names = new Map<string, string>([
    [story.person_key, story.person_name],
    [story.narrator.key, story.narrator.name],
  ]);
  for (const e of story.entities) {
    if (e.link && e.link_label && isArchive(e.link)) names.set(e.link, e.link_label);
    if (e.key && !names.has(e.key)) names.set(e.key, e.link_label ?? e.mention);
  }

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
  const stories = await load(
    `select * from stories where person_key = :k or narrator_key = :k
       or id in (select story_id from story_entities where link = :k)
       or id in (select story_id from contributions where person_key = :k or related_key = :k)
     order by created_at`,
    { k: key },
  );
  const out: ToldGraph = { nodes: [], edges: [], notes: [] };
  const seen = new Set<string>();
  for (const { story, rows } of stories) {
    const g = graphOf(story, rows);
    for (const n of g.nodes) if (!seen.has(n.key) && seen.add(n.key)) out.nodes.push(n);
    out.edges.push(...g.edges);
    out.notes.push(...g.notes);
  }
  return out;
}

// Stories with their entities and contribution rows, rebuilt from the three tables.
async function load(query: string, params: { [k: string]: string } = {}): Promise<{ story: SavedStory; rows: Record[] }[]> {
  const stories = await sql(query, params);
  if (!stories.length) return [];
  const list = { ids: JSON.stringify(stories.map((s) => s.id)) };
  const [contribs, ents] = await Promise.all([
    sql('select * from contributions where story_id in (select value from json_each(:ids)) order by id', list),
    sql('select * from story_entities where story_id in (select value from json_each(:ids)) order by start, "end"', list),
  ]);
  return stories.map((s) => {
    const id = String(s.id);
    const rows = contribs.filter((c) => c.story_id === id).map(asRecord);
    return { story: asStory(s, ents.filter((e) => e.story_id === id), rows), rows };
  });
}

const text = (v: unknown) => (v === null || v === undefined ? null : String(v));

const asRecord = (c: Row): Record => ({
  ...c,
  id: String(c.uid ?? c.id),
  story_id: text(c.story_id),
  person_key: String(c.person_key ?? ''),
  kind: String(c.kind ?? ''),
  created_at: String(c.created_at ?? ''),
  reviewed: 0,
  confirmed: !!c.confirmed,
});

function asStory(s: Row, ents: Row[], rows: Record[]): SavedStory {
  const id = String(s.id);
  const person_key = String(s.person_key ?? '');
  const narratorKey = String(s.narrator_key ?? '');
  const byUid = new Map(rows.map((r) => [r.id, r]));
  const entities: StoryEntity[] = ents.map((e) => {
    const eid = String(e.id).replace(`${id}/`, '');
    const link = text(e.link);
    const r = e.contribution_uid ? byUid.get(String(e.contribution_uid)) : undefined;
    const row: ContributionRow | null = r
      ? {
          kind: r.kind as ContributionRow['kind'],
          relation_type: text(r.relation_type),
          related_key: text(r.related_key),
          name_raw: text(r.name_raw),
          field: text(r.field),
          value: text(r.value),
          place_raw: text(r.place_raw),
          place_norm: text(r.place_norm),
          year: typeof r.year === 'number' ? r.year : null,
        }
      : null;
    return {
      id: eid,
      start: Number(e.start) || 0,
      end: Number(e.end) || 0,
      mention: String(e.mention ?? ''),
      type: e.type as StoryEntity['type'],
      category: e.category as StoryEntity['category'],
      about: text(e.about),
      is_subject: !!e.is_subject,
      confirmed: !!e.confirmed,
      link,
      link_label: text(e.link_label),
      quote: String(e.quote ?? ''),
      row,
      row_id: text(e.contribution_uid),
      narrator_relation: null,
      ...(e.type === 'person' ? { key: e.is_subject ? person_key : link && isArchive(link) ? link : `told:${id}/${eid}` } : {}),
    };
  });
  // Relation rows back to the story's people (`to` is `type` of `from`). Not
  // an entity's own row, nor the narrator's tie to the subject (the save
  // screen's).
  const own = new Set(entities.map((e) => e.row_id));
  const endOf = (key: string) =>
    key === person_key ? 'subject' : key === narratorKey ? 'narrator' : (entities.find((e) => e.key === key)?.id ?? key);
  const relations: SavedStory['relations'] = rows
    .filter((r) => r.kind === 'relation' && !own.has(r.id) && !(r.person_key === person_key && r.related_key === narratorKey))
    .map((r) => ({
      id: r.id,
      from: endOf(r.person_key),
      to: endOf(String(r.related_key)),
      type: String(r.relation_type ?? 'other'),
      quote: String(r.quote ?? ''),
      row_id: r.id,
      from_key: r.person_key,
      to_key: String(r.related_key),
    }));
  return {
    id,
    person_key,
    person_name: String(s.person_name ?? ''),
    transcript: String(s.transcript ?? ''),
    summary: String(s.summary ?? ''),
    entities,
    narrator: {
      key: narratorKey,
      name: String(s.narrator_name ?? ''),
      relation: text(s.narrator_relation),
      relation_label: text(s.narrator_relation_label),
      about: text(s.narrator_about),
    },
    relations,
    created_at: String(s.created_at ?? ''),
    reviewed: s.reviewed ? 1 : 0,
  };
}

// Stories about a key (as the subject, or naming it as a linked entity), newest first.
export async function storiesFor(key: string): Promise<SavedStory[]> {
  const found = await load(
    `select * from stories where person_key = :k or id in (select story_id from story_entities where link = :k) order by created_at desc limit 200`,
    { k: key },
  );
  return found.map((f) => f.story);
}

export async function getStory(id: string): Promise<{ story: SavedStory; rows: Record[] } | null> {
  const [found] = await load('select * from stories where id = :id', { id });
  return found ?? null;
}

export async function allStories(): Promise<SavedStory[]> {
  return (await load('select * from stories order by created_at desc limit 500')).map((f) => f.story);
}
