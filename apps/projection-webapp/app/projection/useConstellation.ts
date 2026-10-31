// State of the live constellation: one growing family tree, a history for
// Esc, and which names are loading. A click grows the tree a generation at a
// time, relatives of relatives, until it runs out or the wall is full. What
// visitors told on their phones is merged in as well: told relatives and the
// storytellers themselves. Results of an older click are ignored (generation
// counter) rather than aborted, so they still fill the request cache.
import { useCallback, useEffect, useRef, useState } from 'react';
import { forgetStories, storyGraph, type PatientEdge } from '../shared/api';
import { fromNodeKey, personKey } from '../shared/keys';
import type { Signal, ToldGraph } from '../shared/story';
import {
  isCertain,
  isFamily,
  narratorCaption,
  newStory,
  strongestTie,
  summaryName,
  SUMMARY_CAPTION,
  tieReason,
  tieReference,
  toldCaption,
  toldReason,
  toldReference,
} from '../shared/strings';
import {
  expandPatient,
  expandPersonNode,
  patientKey,
  sameNameCandidates,
  shape,
  type Context,
  type Found,
  type GEdge,
  type Guess,
  type GNode,
  type NodeKey,
} from './graph';

// Above this many new names in one expansion, only family is shown in full
// and the rest collapses into one summary name per role. Tune on the beamer.
export const GROUP_THRESHOLD = 20;
const BATCH = 20; // names revealed per click on a summary
const MAX_DEPTH = 6; // generations of relatives followed per click
const MAX_NAMES = 45; // the tree stops growing here; a click on an outer name goes on
const FRESH = 10_000; // ms a just-told name pulses

export type Graph = {
  root: NodeKey;
  focus: NodeKey;
  nodes: Map<NodeKey, GNode>;
  edges: Map<string, GEdge>;
  expanded: Set<NodeKey>;
  sameNamed: Set<NodeKey>;
  empty: Set<NodeKey>; // expanded, but the archive had nothing more
  own: Map<NodeKey, number[]>; // a patient's own attestations
  alias: Map<number, NodeKey>; // attestation → the name that stands for that person
  guesses: Map<string, Guess>; // record pairs taken as one person, for the phone
  notes: Map<NodeKey, string[]>; // what stories told about a name, for its caption
};

type StorySaved = Extract<Signal, { type: 'story-saved' }>;

type Options = Context & {
  wallTies: PatientEdge[];
};

const clone = (g: Graph): Graph => ({
  ...g,
  nodes: new Map(g.nodes),
  edges: new Map(g.edges),
  expanded: new Set(g.expanded),
  sameNamed: new Set(g.sameNamed),
  empty: new Set(g.empty),
  own: new Map(g.own),
  alias: new Map(g.alias),
  guesses: new Map(g.guesses),
  notes: new Map(g.notes),
});

// A shared key (patient:/person:/told:/name:) to the name that stands for it.
// An attestation is shown by its patient, or by the name it was folded into.
export function toNodeKey(g: Graph | null, key: string, ctx: Context): NodeKey | null {
  const m = /^(patient|person):(\d+)$/.exec(key);
  if (m?.[1] === 'patient') return patientKey(Number(m[2]));
  if (m?.[1] === 'person') {
    const id = Number(m[2]);
    const p = ctx.patientOf(id);
    return p !== undefined ? patientKey(p) : (g?.alias.get(id) ?? `x:${id}`);
  }
  return /^(told|name):/.test(key) ? `t:${key}` : null;
}

// Put what stories told into `g` (mutates it): new names, dashed lines in
// the tree's shape, and notes for captions. Names already shown are reused.
// Returns the names it added.
function mergeTold(g: Graph, told: ToldGraph, ctx: Context, fresh: boolean): NodeKey[] {
  const made: NodeKey[] = [];
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  for (const n of told.nodes) {
    const key = toNodeKey(g, n.key, ctx);
    if (!key || g.nodes.has(key)) continue;
    const id = Number(key.slice(2));
    const narrator = told.edges.find((e) => e.from === n.key || e.to === n.key)?.narrator ?? '';
    const node: GNode = key.startsWith('p:')
      ? { key, kind: 'patient', patientId: id, name: ctx.patientName(id) }
      : key.startsWith('x:')
        ? { key, kind: 'person', personId: id, name: n.name }
        : n.kind === 'narrator'
          ? { key, kind: 'narrator', name: n.name, caption: narratorCaption(fresh ? time : undefined) }
          : { key, kind: 'told', name: n.name, caption: toldCaption(narrator) };
    g.nodes.set(key, node);
    made.push(key);
  }
  for (const e of told.edges) {
    const [from, to] = [toNodeKey(g, e.from, ctx), toNodeKey(g, e.to, ctx)];
    const key = `told:${e.id}`;
    if (!from || !to || from === to || !g.nodes.has(from) || !g.nodes.has(to) || g.edges.has(key)) continue;
    const up = e.up ? toNodeKey(g, e.up, ctx) : null;
    g.edges.set(key, {
      key,
      from,
      to,
      certain: false, // a visitor's story is not checked yet
      ...(up ? { parent: up, generations: e.generations ?? 1 } : {}),
      ...(e.level ? { level: true } : {}),
      reason: toldReason(g.nodes.get(from)!.name, g.nodes.get(to)!.name, e.relation_type),
      reference: toldReference(e.narrator),
    });
  }
  for (const n of told.notes) {
    const key = toNodeKey(g, n.key, ctx);
    const list = key ? (g.notes.get(key) ?? []) : [];
    if (key && !list.includes(n.text)) g.notes.set(key, [...list, n.text]);
  }
  return made;
}

// Everything stories added around one name: under its shared key, and for a
// patient also under each of their own records.
async function storiesAbout(key: NodeKey, own: number[] = []): Promise<ToldGraph> {
  const shared = fromNodeKey(key);
  const keys = [...(shared ? [shared] : []), ...own.map(personKey)];
  const all = await Promise.all(keys.map(storyGraph));
  return { nodes: all.flatMap((t) => t.nodes), edges: all.flatMap((t) => t.edges), notes: all.flatMap((t) => t.notes) };
}

// `self` turned out to (probably) be the same person as names already shown:
// those names fold into it and their lines move over. Mutates `g`.
function absorb(g: Graph, self: NodeKey, aliases: number[]) {
  for (const id of aliases) {
    const dup = g.alias.get(id) ?? (g.nodes.has(`x:${id}`) ? `x:${id}` : undefined);
    g.alias.set(id, self);
    if (!dup || dup === self || dup === g.root || dup.startsWith('p:')) continue;
    g.nodes.delete(dup);
    for (const [k, owner] of g.alias) if (owner === dup) g.alias.set(k, self);
    for (const [k, e] of g.edges) {
      if (e.from !== dup && e.to !== dup) continue;
      g.edges.delete(k);
      const [from, to] = [e.from === dup ? self : e.from, e.to === dup ? self : e.to];
      const parent = e.parent === dup ? self : e.parent;
      if (from !== to) g.edges.set(`${k}>`, { ...e, key: `${k}>`, from, to, ...(parent ? { parent } : {}) });
    }
  }
  return g;
}

export function useConstellation(opts: Options) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState<Set<NodeKey>>(() => new Set());
  const [offline, setOffline] = useState(false);
  // Names a story just added (they pulse), and the "new story by …" line.
  const [fresh, setFresh] = useState<Set<NodeKey>>(() => new Set());
  const [headline, setHeadline] = useState<{ key: NodeKey; text: string } | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<Graph | null>(null);
  const history = useRef<Graph[]>([]);
  const gen = useRef(0);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const commit = useCallback((next: Graph | null, remember = true) => {
    if (remember && current.current) history.current.push(current.current);
    current.current = next;
    setGraph(next);
  }, []);

  // Add what an expansion found: new names get a place, busy groups collapse.
  const merge = useCallback(
    (g: Graph, parent: NodeKey, raw: Found[], truncated: boolean) => {
      const o = optsRef.current;
      const next = clone(g);
      // A relative already shown under another of their records is that name.
      const found = raw.flatMap((f): Found[] => {
        const owner = f.node.personId !== undefined ? next.alias.get(f.node.personId) : undefined;
        const node = owner && next.nodes.get(owner);
        if (!owner || !node || owner === f.node.key) return [f];
        if (owner === parent) return [];
        const up = f.edge.parent === f.node.key ? owner : f.edge.parent;
        return [{ ...f, node, edge: { ...f.edge, key: `${f.edge.key}>${owner}`, to: owner, ...(up ? { parent: up } : {}) } }];
      });
      const fresh = found.filter((f) => !next.nodes.has(f.node.key));
      const uniqueFresh = new Map(fresh.map((f) => [f.node.key, f]));
      let show = found;
      if (uniqueFresh.size > GROUP_THRESHOLD) {
        show = found.filter((f) => next.nodes.has(f.node.key) || f.family || f.group === 'possibly');
        const groups = new Map<string, Found[]>();
        for (const f of uniqueFresh.values()) {
          if (f.family || f.group === 'possibly') continue;
          if (!groups.has(f.group)) groups.set(f.group, []);
          groups.get(f.group)!.push(f);
        }
        for (const [group, items] of groups) {
          const key = `s:${parent}|${group}`;
          const summary: GNode = { key, kind: 'summary', name: summaryName(group, items.length, truncated), caption: SUMMARY_CAPTION, hidden: items, truncated };
          show.push({ node: summary, family: false, group, edge: { key: `${parent}~${key}`, from: parent, to: key, certain: true, reason: '', reference: '' } });
        }
      }
      for (const f of show) {
        if (!next.nodes.has(f.node.key)) next.nodes.set(f.node.key, f.node);
        if (!next.edges.has(f.edge.key)) next.edges.set(f.edge.key, f.edge);
      }
      // Patients met along the way: add the precomputed family ties among them.
      const patients = new Set([...next.nodes.values()].filter((n) => n.kind === 'patient').map((n) => n.patientId!));
      for (const e of o.wallTies) {
        if (!patients.has(e.a) || !patients.has(e.b)) continue;
        const family = e.ties.filter((t) => t.kind === 'relation' && isFamily(t.type, t.record?.type ?? null));
        if (!family.length) continue;
        const t = strongestTie(family);
        const key = `wall:${e.a}~${e.b}`;
        if (!next.edges.has(key))
          next.edges.set(key, {
            key,
            from: patientKey(e.a),
            to: patientKey(e.b),
            ...(t.kind === 'relation' ? shape(t.type, patientKey(t.from)) : {}),
            certain: isCertain(t),
            reason: tieReason(t, e.a, e.b, o.patientName),
            reference: tieReference(t),
          });
      }
      if (!raw.length) next.empty.add(parent);
      return next;
    },
    [],
  );

  const run = useCallback(
    async (key: NodeKey, work: (g: Graph) => Promise<Graph>) => {
      const myGen = gen.current;
      setLoading((s) => new Set(s).add(key));
      try {
        const g = current.current;
        if (!g) return;
        const next = await work(g);
        if (gen.current !== myGen) return;
        // Merge onto the latest graph in case another expansion landed first.
        commit(next.root === current.current?.root ? next : current.current);
        setOffline(false);
      } catch {
        if (gen.current === myGen) setOffline(true); // graph stays as it is
      } finally {
        setLoading((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [commit],
  );

  // Expand `start`, then the relatives it found, then theirs …, committing
  // each generation so the tree visibly grows. One Esc undoes the whole click.
  // `onFirst`: called once the first generation is shown.
  const grow = useCallback(
    async (start: NodeKey, remember: boolean, onFirst?: () => void) => {
      const myGen = gen.current;
      const o = optsRef.current;
      let frontier = [start];
      for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth++) {
        const g0 = current.current;
        if (!g0) return;
        const keys = frontier;
        setLoading((s) => new Set([...s, ...keys]));
        const results = await Promise.allSettled(
          keys.map((k): Promise<{ found: Found[]; truncated: boolean; aliases: number[]; guesses: Guess[]; ownIds?: number[] }> => {
            const n = g0.nodes.get(k)!;
            return n.kind === 'patient' ? expandPatient(o, n.patientId!) : expandPersonNode(o, n);
          }),
        );
        setLoading((s) => {
          const n = new Set(s);
          for (const k of keys) n.delete(k);
          return n;
        });
        // Stories saved earlier about these names join the tree as well.
        const told = await Promise.all(keys.map((k, i) => storiesAbout(k, results[i].status === 'fulfilled' ? results[i].value.ownIds : undefined)));
        if (gen.current !== myGen || !current.current) return;
        if (results.every((r) => r.status === 'rejected')) {
          if (depth === 0) setOffline(true); // graph stays as it is
          return;
        }
        // Built on the latest graph, with no waiting in between, so a story
        // merged meanwhile is kept.
        let g = clone(current.current);
        const before = new Set(g.nodes.keys());
        results.forEach((r, i) => {
          const key = keys[i];
          if (r.status !== 'fulfilled' || !g.nodes.has(key)) return;
          // Past the cap only links between names already shown are added; a
          // name with relatives left out stays unexpanded, so a click shows them.
          let room = MAX_NAMES - g.nodes.size;
          const fits = r.value.found.filter((f) => {
            const known = g.nodes.has(f.node.key) || (f.node.personId !== undefined && g.alias.has(f.node.personId));
            return known || room-- > 0;
          });
          if (fits.length === r.value.found.length) g.expanded.add(key);
          if (r.value.ownIds) g.own.set(key, r.value.ownIds);
          for (const q of r.value.guesses) g.guesses.set(q.key, q);
          g = merge(absorb(g, key, r.value.aliases), key, fits, r.value.truncated);
        });
        for (const t of told) mergeTold(g, t, o, false);
        commit(g, remember && depth === 0);
        setOffline(false);
        if (depth === 0) onFirst?.();
        const room = MAX_NAMES - g.nodes.size;
        frontier =
          room > 0
            ? [...g.nodes.values()]
                .filter((n) => !before.has(n.key) && !g.expanded.has(n.key) && (n.kind === 'patient' || n.kind === 'person'))
                .map((n) => n.key)
                .slice(0, room)
            : [];
      }
    },
    [commit, merge],
  );

  const sameName = useCallback(
    (key: NodeKey) =>
      run(key, async () => {
        const g0 = current.current!;
        const node = g0.nodes.get(key)!;
        const ids = node.kind === 'patient' ? (g0.own.get(key) ?? []) : [node.personId!];
        const found = await sameNameCandidates(optsRef.current, key, ids);
        const g = clone(current.current!);
        g.sameNamed.add(key);
        const next = merge(g, key, found, false);
        next.empty.delete(key);
        return next;
      }),
    [run, merge],
  );

  const reveal = useCallback(
    (key: NodeKey) => {
      const g = current.current!;
      const s = g.nodes.get(key)!;
      const batch = s.hidden!.slice(0, BATCH);
      const rest = s.hidden!.slice(BATCH);
      const parent = [...g.edges.values()].find((e) => e.to === key)!.from;
      const next = clone(g);
      if (rest.length) next.nodes.set(key, { ...s, hidden: rest, name: summaryName(s.name.split(' · ')[0], rest.length, !!s.truncated) });
      else {
        next.nodes.delete(key);
        for (const [k, e] of next.edges) if (e.to === key) next.edges.delete(k);
      }
      commit(merge(next, parent, batch.map((f) => ({ ...f, family: true })), false));
    },
    [commit, merge],
  );

  const reset = useCallback(() => {
    gen.current++;
    history.current = [];
    setLoading(new Set());
    setOffline(false);
    setFresh(new Set());
    setHeadline(null);
    commit(null, false);
  }, [commit]);

  // A new constellation around `node`; resolves once its first generation is
  // shown (or failed).
  const start = useCallback(
    (node: GNode) => {
      gen.current++;
      history.current = [];
      // Fresh stories for every new constellation: a story saved while this
      // screen missed its signal (reconnecting, reloaded) still shows.
      forgetStories();
      const key = node.key;
      commit(
        {
          root: key,
          focus: key,
          nodes: new Map([[key, node]]),
          edges: new Map(),
          expanded: new Set(),
          sameNamed: new Set(),
          empty: new Set(),
          own: new Map(),
          alias: new Map(),
          guesses: new Map(),
          notes: new Map(),
        },
        false,
      );
      return new Promise<void>((done) => {
        grow(key, false, done).finally(done);
      });
    },
    [commit, grow],
  );

  const open = useCallback(
    (patientId: number) => start({ key: patientKey(patientId), kind: 'patient', patientId, name: optsRef.current.patientName(patientId) }),
    [start],
  );

  // An archive record that is no patient on the wall (a phone chose it).
  const openPerson = useCallback(
    (personId: number, name: string) => start({ key: `x:${personId}`, kind: 'person', personId, name }),
    [start],
  );

  // Open whatever a shared key stands for; `name:` people have no stamp yet.
  const openKey = useCallback(
    (key: string, name: string | null) => {
      const m = /^(patient|person):(\d+)$/.exec(key);
      if (!m) return Promise.resolve(false);
      const id = Number(m[2]);
      const patient = m[1] === 'patient' ? id : optsRef.current.patientOf(id);
      return (patient !== undefined ? open(patient) : openPerson(id, name ?? `#${id}`)).then(() => true);
    },
    [open, openPerson],
  );

  // A story was just saved on a phone: show its subject (opening it if
  // needed), merge what it added, and let the new names pulse for a while.
  const showStory = useCallback(
    async (s: StorySaved) => {
      forgetStories();
      const o = optsRef.current;
      const g0 = current.current;
      const shown = toNodeKey(g0, s.key, o);
      if (!g0 || !shown || !g0.nodes.has(shown)) if (!(await openKey(s.key, s.name))) return;
      const g = current.current;
      if (!g) return;
      const next = clone(g);
      const made = mergeTold(next, s.added, o, true);
      const subject = toNodeKey(next, s.key, o);
      if (subject && next.nodes.has(subject)) next.focus = subject;
      commit(next);
      setFresh(new Set(made));
      setHeadline(subject ? { key: subject, text: newStory(s.narrator) } : null);
      clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => {
        setFresh(new Set());
        setHeadline(null);
      }, FRESH);
    },
    [openKey, commit],
  );

  // A click on any name: open, expand, then (on request) same-name candidates.
  const click = useCallback(
    (key: NodeKey) => {
      const g = current.current;
      const node = g?.nodes.get(key);
      if (!g || !node) {
        if (key.startsWith('p:')) open(Number(key.slice(2)));
        return;
      }
      if (g.focus !== key) {
        const next = clone(g);
        next.focus = key;
        current.current = next;
        setGraph(next);
      }
      if (node.kind === 'summary') reveal(key);
      else if (node.kind === 'told' || node.kind === 'narrator') return; // nothing in the archive to expand
      else if (!g.expanded.has(key)) grow(key, true);
      else if (!g.sameNamed.has(key)) sameName(key);
    },
    [open, grow, sameName, reveal],
  );

  // Esc: undo the last step; at the first step, back to the full wall.
  const back = useCallback(() => {
    gen.current++;
    setLoading(new Set());
    const prev = history.current.pop();
    if (prev) commit(prev, false);
    else reset();
  }, [commit, reset]);

  return { graph, loading, offline, fresh, headline, open, openKey, showStory, click, back, reset };
}
