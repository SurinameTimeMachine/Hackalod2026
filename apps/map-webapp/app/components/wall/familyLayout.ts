import type { Graph } from '../family-graph/projection/useConstellation';
import type { GEdge, GNode } from '../family-graph/projection/graph';

// A family tree layout: one row per generation (oldest on top), partners and
// siblings side by side, parents centred over their children. Anything that is
// not family (people who probably knew each other) hangs in a band below.

export const NAME_SIZE = 22;
export const CAPTION_SIZE = 11;
export const DOT = 8;
const TEXT_WIDTH = 200;
const GAP = 46;
const ROW = 175;

export type TreeNode = {
  key: string;
  kind: GNode['kind'] | 'connection';
  name: string;
  caption?: string;
  x: number;
  y: number; // dot centre; text hangs below it. World units, y up.
  width: number;
  bottom: number; // distance from the dot centre to the lowest text
  root: boolean;
  patientId?: number;
};

export type TreeEdge = {
  key: string;
  kind: 'parent' | 'level' | 'link';
  from: string;
  to: string; // for 'parent' edges: from = parent, to = child
  certain: boolean;
  reason: string;
  reference: string;
};

export type FamilyTree = { nodes: Map<string, TreeNode>; edges: TreeEdge[]; width: number; height: number };

export type ExtraLink = { patientId: number; key: string; name: string; caption: string; with: string; certain: boolean; reason: string; reference: string };

const lines = (chars: number, size: number, factor: number) => Math.max(1, Math.ceil((chars * size * factor) / TEXT_WIDTH));

function measure(name: string, caption: string | undefined, root: boolean) {
  const size = root ? NAME_SIZE * 1.25 : NAME_SIZE;
  const nameLines = lines(name.length, size, 0.5);
  const captionLines = caption ? lines(caption.length, CAPTION_SIZE, 0.6) : 0;
  const textWidth = Math.min(TEXT_WIDTH, Math.max(name.length * NAME_SIZE * 0.5, (caption?.length ?? 0) * CAPTION_SIZE * 0.6));
  return {
    width: textWidth + GAP,
    bottom: (root ? DOT * 1.6 : DOT) + 8 + nameLines * size * 1.1 + (captionLines ? 4 + captionLines * CAPTION_SIZE * 1.3 : 0),
  };
}

function toEdge(e: GEdge): TreeEdge {
  if (e.parent) return { key: e.key, kind: 'parent', from: e.parent, to: e.parent === e.from ? e.to : e.from, certain: e.certain, reason: e.reason, reference: e.reference };
  return { key: e.key, kind: e.level ? 'level' : 'link', from: e.from, to: e.to, certain: e.certain, reason: e.reason, reference: e.reference };
}

// Evenly spaces `items` left to right around their wished centres.
function spread(items: { width: number; want: number }[]) {
  let cursor = -Infinity;
  const left = items.map(item => {
    const x = Math.max(item.want - item.width / 2, cursor);
    cursor = x + item.width;
    return x;
  });
  const shift = items.length ? items.reduce((sum, item, i) => sum + (item.want - (left[i] + item.width / 2)), 0) / items.length : 0;
  return left.map((x, i) => x + shift + items[i].width / 2);
}

export function buildFamilyTree(graph: Graph, extras: ExtraLink[] = [], rootCaption?: string): FamilyTree {
  const nodes = new Map<string, TreeNode>();
  const add = (n: GNode | (Omit<GNode, 'kind'> & { kind: 'connection' }), patientId?: number) => {
    const m = measure(n.name, n.caption, n.key === graph.root);
    nodes.set(n.key, { key: n.key, kind: n.kind, name: n.name, caption: n.caption, x: 0, y: 0, width: m.width, bottom: m.bottom, root: n.key === graph.root, patientId });
  };
  for (const n of graph.nodes.values()) add(n.key === graph.root && rootCaption ? { ...n, caption: rootCaption } : n, n.patientId);
  const edges: TreeEdge[] = [...graph.edges.values()].filter(e => nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to).map(toEdge);
  for (const x of extras) {
    if (!nodes.has(x.key)) add({ key: x.key, kind: 'connection', name: x.name, caption: x.caption }, x.patientId);
    if (!nodes.has(x.with) || x.with === x.key) continue;
    edges.push({ key: `link:${x.with}~${x.key}`, kind: 'link', from: x.with, to: x.key, certain: x.certain, reason: x.reason, reference: x.reference });
  }
  const root = nodes.get(graph.root);
  if (!root) return { nodes, edges, width: 0, height: 0 };

  // Generations by walking family lines out from the selected name.
  const gen = new Map<string, number>([[graph.root, 0]]);
  const next = new Map<string, { to: string; d: number }[]>();
  const link = (a: string, b: string, d: number) => { (next.get(a) ?? next.set(a, []).get(a)!).push({ to: b, d }); };
  for (const e of edges) {
    if (e.kind === 'parent') { link(e.from, e.to, 1); link(e.to, e.from, -1); }
    else if (e.kind === 'level') { link(e.from, e.to, 0); link(e.to, e.from, 0); }
  }
  const queue = [graph.root];
  for (let i = 0; i < queue.length; i++) {
    for (const { to, d } of next.get(queue[i]) ?? []) {
      if (gen.has(to)) continue;
      gen.set(to, gen.get(queue[i])! + d);
      queue.push(to);
    }
  }

  const rows = new Map<number, string[]>();
  for (const key of gen.keys()) (rows.get(gen.get(key)!) ?? rows.set(gen.get(key)!, []).get(gen.get(key)!)!).push(key);
  const generations = [...rows.keys()].sort((a, b) => a - b);

  // Partners and siblings travel together as one unit.
  const unitsOf = (g: number) => {
    const members = rows.get(g)!;
    const parent = new Map(members.map(k => [k, k]));
    const find = (k: string): string => (parent.get(k) === k ? k : (parent.set(k, find(parent.get(k)!)), parent.get(k)!));
    for (const e of edges) if (e.kind === 'level' && parent.has(e.from) && parent.has(e.to)) parent.set(find(e.from), find(e.to));
    const groups = new Map<string, string[]>();
    for (const k of members) (groups.get(find(k)) ?? groups.set(find(k), []).get(find(k))!).push(k);
    // The selected name sits in the middle of its siblings and partner.
    return [...groups.values()].map(unit => {
      const i = unit.indexOf(graph.root);
      if (i < 0) return unit;
      const rest = unit.filter(k => k !== graph.root);
      rest.splice(Math.floor(rest.length / 2), 0, graph.root);
      return rest;
    });
  };
  const units = new Map(generations.map(g => [g, unitsOf(g)]));
  const neighbours = (key: string, d: 1 | -1) => edges.flatMap(e => e.kind !== 'parent' ? [] : d === -1 && e.to === key ? [e.from] : d === 1 && e.from === key ? [e.to] : []);

  generations.forEach(g => {
    const row = units.get(g)!;
    row.forEach((unit, i) => unit.forEach((k, j) => { nodes.get(k)!.x = (i + j * 0.2) * 200; }));
  });

  const place = (g: number, d: 1 | -1) => {
    const row = units.get(g)!;
    const wished = row.map(unit => {
      const xs = unit.flatMap(k => neighbours(k, d).filter(n => gen.has(n) && gen.get(n) === g + d).map(n => nodes.get(n)!.x));
      const own = unit.reduce((s, k) => s + nodes.get(k)!.x, 0) / unit.length;
      return { unit, want: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : own };
    }).sort((a, b) => a.want - b.want);
    const centres = spread(wished.map(w => ({ width: w.unit.reduce((s, k) => s + nodes.get(k)!.width, 0), want: w.want })));
    wished.forEach((w, i) => {
      const total = w.unit.reduce((s, k) => s + nodes.get(k)!.width, 0);
      let cursor = centres[i] - total / 2;
      for (const k of w.unit) { const n = nodes.get(k)!; n.x = cursor + n.width / 2; cursor += n.width; }
    });
    units.set(g, wished.map(w => w.unit));
  };
  // Parents sit above the children they share with the row above; sweep both ways.
  for (let pass = 0; pass < 3; pass++) {
    for (const g of generations) place(g, -1);
    for (const g of [...generations].reverse()) place(g, 1);
  }
  for (const g of generations) place(g, -1);

  generations.forEach(g => rows.get(g)!.forEach(k => { nodes.get(k)!.y = -(g - generations[0]) * ROW; }));

  // Everyone else (people who probably knew each other) goes in a band underneath.
  const outer = [...nodes.keys()].filter(k => !gen.has(k));
  const bandY = -(generations[generations.length - 1] - generations[0] + 1.25) * ROW;
  const familyKeys = [...gen.keys()];
  const minX = Math.min(...familyKeys.map(k => nodes.get(k)!.x - nodes.get(k)!.width / 2));
  const maxX = Math.max(...familyKeys.map(k => nodes.get(k)!.x + nodes.get(k)!.width / 2));
  const limit = Math.max(maxX - minX, 1000);
  const wishOf = (k: string) => {
    const xs = edges.filter(e => e.from === k || e.to === k).map(e => nodes.get(e.from === k ? e.to : e.from)!).filter(n => gen.has(n.key) || n.y !== 0).map(n => n.x);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : (minX + maxX) / 2;
  };
  const sorted = outer.map(k => ({ k, want: wishOf(k) })).sort((a, b) => a.want - b.want);
  const bands: { k: string; want: number }[][] = [[]];
  let used = 0;
  for (const item of sorted) {
    const w = nodes.get(item.k)!.width;
    if (used + w > limit && bands[bands.length - 1].length) { bands.push([]); used = 0; }
    bands[bands.length - 1].push(item);
    used += w;
  }
  bands.forEach((band, row) => {
    const centres = spread(band.map(item => ({ width: nodes.get(item.k)!.width, want: item.want })));
    band.forEach((item, i) => { const n = nodes.get(item.k)!; n.x = centres[i]; n.y = bandY - row * ROW * 0.9; });
  });

  // Centre the whole drawing on the origin.
  const all = [...nodes.values()];
  const x0 = Math.min(...all.map(n => n.x - n.width / 2)), x1 = Math.max(...all.map(n => n.x + n.width / 2));
  const y0 = Math.min(...all.map(n => n.y - n.bottom)), y1 = Math.max(...all.map(n => n.y + DOT));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const n of all) { n.x -= cx; n.y -= cy; }
  return { nodes, edges, width: x1 - x0, height: y1 - y0 };
}
