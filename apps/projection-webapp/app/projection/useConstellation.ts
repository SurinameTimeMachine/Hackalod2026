// State of the live constellation: one growing graph, a history for Esc, and
// which names are loading. Results of an older click are ignored (generation
// counter) rather than aborted, so they still fill the request cache.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatientEdge } from '../shared/api';
import { isCertain, strongestTie, summaryName, SUMMARY_CAPTION, tieReason, tieReference } from '../shared/strings';
import { placeNodes, type Point } from './forceLayout';
import {
  expandPatient,
  expandPersonNode,
  patientKey,
  sameNameCandidates,
  type Context,
  type Found,
  type GEdge,
  type GNode,
  type NodeKey,
} from './graph';

// Above this many new names in one expansion, only family is shown in full
// and the rest collapses into one summary name per role. Tune on the beamer.
export const GROUP_THRESHOLD = 20;
const BATCH = 20; // names revealed per click on a summary

export type Graph = {
  root: NodeKey;
  focus: NodeKey;
  nodes: Map<NodeKey, GNode>;
  edges: Map<string, GEdge>;
  pos: Map<NodeKey, Point>;
  origin: Map<NodeKey, Point>; // where a name appeared from, for its glide-in
  expanded: Set<NodeKey>;
  sameNamed: Set<NodeKey>;
  empty: Set<NodeKey>; // expanded, but the archive had nothing more
  own: Map<NodeKey, number[]>; // a patient's own attestations
};

type Options = Context & {
  wallPos: (patientId: number) => Point | undefined;
  radius: (node: GNode) => number; // collision radius for the layout
  wallTies: PatientEdge[];
};

const clone = (g: Graph): Graph => ({
  ...g,
  nodes: new Map(g.nodes),
  edges: new Map(g.edges),
  pos: new Map(g.pos),
  origin: new Map(g.origin),
  expanded: new Set(g.expanded),
  sameNamed: new Set(g.sameNamed),
  empty: new Set(g.empty),
  own: new Map(g.own),
});

export function useConstellation(opts: Options) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState<Set<NodeKey>>(() => new Set());
  const [offline, setOffline] = useState(false);
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

  const posOf = useCallback((g: Graph, n: GNode): Point | undefined => {
    if (n.kind === 'patient') return optsRef.current.wallPos(n.patientId!);
    return g.pos.get(n.key);
  }, []);

  // Add what an expansion found: new names get a place, busy groups collapse.
  const merge = useCallback(
    (g: Graph, parent: NodeKey, found: Found[], truncated: boolean) => {
      const o = optsRef.current;
      const next = clone(g);
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
      const newNodes: { key: string; parent: string; r: number }[] = [];
      for (const f of show) {
        if (!next.nodes.has(f.node.key)) {
          next.nodes.set(f.node.key, f.node);
          if (f.node.kind !== 'patient') newNodes.push({ key: f.node.key, parent: f.edge.from, r: o.radius(f.node) });
        }
        if (!next.edges.has(f.edge.key)) next.edges.set(f.edge.key, f.edge);
      }
      // Patients met along the way: add the precomputed wall ties among them.
      const patients = new Set([...next.nodes.values()].filter((n) => n.kind === 'patient').map((n) => n.patientId!));
      for (const e of o.wallTies) {
        if (!patients.has(e.a) || !patients.has(e.b)) continue;
        const t = strongestTie(e.ties);
        const key = `wall:${e.a}~${e.b}`;
        if (!next.edges.has(key))
          next.edges.set(key, {
            key,
            from: patientKey(e.a),
            to: patientKey(e.b),
            certain: isCertain(t),
            reason: tieReason(t, e.a, e.b, o.patientName),
            reference: tieReference(t),
          });
      }
      if (newNodes.length) {
        const fixed = new Map<string, Point & { r: number }>();
        for (const n of next.nodes.values()) {
          const p = posOf(next, n);
          if (p) fixed.set(n.key, { ...p, r: o.radius(n) });
        }
        const placed = placeNodes(
          fixed,
          newNodes,
          [...next.edges.values()].map((e) => ({ from: e.from, to: e.to })),
        );
        const parentPos = posOf(next, next.nodes.get(parent)!);
        for (const [k, p] of placed) {
          next.pos.set(k, p);
          if (parentPos) next.origin.set(k, parentPos);
        }
      }
      if (!found.length) next.empty.add(parent);
      return next;
    },
    [posOf],
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

  const expand = useCallback(
    (key: NodeKey) =>
      run(key, async () => {
        const node = current.current!.nodes.get(key)!;
        if (node.kind === 'patient') {
          const r = await expandPatient(optsRef.current, node.patientId!);
          const g = clone(current.current!);
          g.expanded.add(key);
          g.own.set(key, r.ownIds);
          return merge(g, key, r.found, r.truncated);
        }
        const r = await expandPersonNode(optsRef.current, node);
        const g = clone(current.current!);
        g.expanded.add(key);
        return merge(g, key, r.found, r.truncated);
      }),
    [run, merge],
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
        next.pos.delete(key);
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
    commit(null, false);
  }, [commit]);

  const open = useCallback(
    (patientId: number) => {
      gen.current++;
      history.current = [];
      const key = patientKey(patientId);
      const node: GNode = { key, kind: 'patient', patientId, name: optsRef.current.patientName(patientId) };
      commit(
        {
          root: key,
          focus: key,
          nodes: new Map([[key, node]]),
          edges: new Map(),
          pos: new Map(),
          origin: new Map(),
          expanded: new Set(),
          sameNamed: new Set(),
          empty: new Set(),
          own: new Map(),
        },
        false,
      );
      expand(key);
    },
    [commit, expand],
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
      else if (!g.expanded.has(key)) expand(key);
      else if (!g.sameNamed.has(key)) sameName(key);
    },
    [open, expand, sameName, reveal],
  );

  // Esc: undo the last step; at the first step, back to the full wall.
  const back = useCallback(() => {
    gen.current++;
    setLoading(new Set());
    const prev = history.current.pop();
    if (prev) commit(prev, false);
    else reset();
  }, [commit, reset]);

  return { graph, loading, offline, open, click, back, reset };
}
