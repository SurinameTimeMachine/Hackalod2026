// Live family-tree layout: one force simulation that keeps running while the
// constellation is open, ticked once per frame. New names grow out of the name
// they came from; the others drift aside to make room, then settle.
// Every name floats towards its generation's row (parents a row above their
// children, grandparents two, partners and siblings on the same row), and no
// two names (or a name and a line's sentence) overlap.
import { forceLink, forceManyBody, forceSimulation, type ForceLink, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { rng } from './stampStyle';
import { WALL } from './wallLayout';

export type Point = { x: number; y: number };
// A name's text box around its centre: half width, and how far it reaches up
// and down (the caption hangs below).
export type Box = { hw: number; up: number; down: number };
export type TreeEdge = {
  from: string;
  to: string;
  parent?: string;
  generations?: number; // a parent line spanning more than one generation (grandparent: 2)
  level?: boolean;
  label?: { at: number; hw: number; hh: number }; // the sentence on the line, kept clear of names
};

type N = SimulationNodeDatum & { key: string; box: Box };
type L = SimulationLinkDatum<N> & { e: TreeEdge };

const GENERATION = 220; // row height, shrunk when the tree is deeper than the wall
const PAD = 16; // air between two text boxes
const ALPHA_MIN = 0.008;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class TreeLayout {
  private nodes = new Map<string, N>();
  private links: L[] = [];
  private root: string | null = null;
  private sim: Simulation<N, L>;
  private settled = true;
  private onSettle: () => void;
  private row = new Map<string, number>(); // generation relative to the root, up is positive
  private step = GENERATION;
  private middle = 0; // the row drawn at the wall's vertical centre

  constructor(onSettle: () => void) {
    this.onSettle = onSettle;
    // Gentle cooling: the tree floats into its rows over a couple of
    // seconds instead of snapping, but settles calmly.
    this.sim = forceSimulation<N, L>([])
      .alphaDecay(0.02)
      .alphaMin(ALPHA_MIN)
      .velocityDecay(0.6)
      .force('charge', forceManyBody<N>().strength(-160).distanceMax(600))
      .force(
        'link',
        forceLink<N, L>([])
          .id((n) => n.key)
          .distance(
            (l) =>
              (l.e.parent ? this.step * (l.e.generations ?? 1) : l.e.level ? 150 : 200) +
              (l.source as N).box.hw * 0.4 +
              (l.target as N).box.hw * 0.4 +
              // A line with a sentence needs room for it between the names.
              (l.e.label ? l.e.label.hh * 3 : 0),
          )
          .strength(0.2),
      )
      .force('rows', (alpha: number) => this.rows(alpha))
      .force('home', (alpha: number) => this.home(alpha))
      .force('boxes', () => this.boxes())
      .stop();
  }

  pos(key: string): Point | undefined {
    const n = this.nodes.get(key);
    return n && n.x !== undefined ? { x: n.x, y: n.y! } : undefined;
  }

  // Bring the simulation in line with what is shown. Reheats only when names
  // or lines were added; a changed box (focus moved) gets a gentle nudge.
  sync(root: string, boxes: Map<string, Box>, edges: TreeEdge[]) {
    if (root !== this.root) {
      this.nodes.clear();
      this.root = root;
    }
    for (const k of [...this.nodes.keys()]) if (!boxes.has(k)) this.nodes.delete(k);
    const fresh: N[] = [];
    let resized = false;
    for (const [key, box] of boxes) {
      const n = this.nodes.get(key);
      if (!n) {
        const m: N = { key, box };
        this.nodes.set(key, m);
        fresh.push(m);
      } else if (n.box.hw !== box.hw || n.box.up !== box.up || n.box.down !== box.down) {
        n.box = box;
        resized = true;
      }
    }
    // A new name starts right at a neighbour that is already placed, so it
    // grows out of it. Several passes: neighbours can be new themselves.
    for (let pass = 0; pass < 4 && fresh.some((n) => n.x === undefined); pass++)
      for (const n of fresh) {
        if (n.x !== undefined) continue;
        if (n.key === root) {
          Object.assign(n, { x: 0, y: 0 });
          continue;
        }
        const e = edges.find((e) => (e.from === n.key && this.pos(e.to)) || (e.to === n.key && this.pos(e.from)));
        if (!e && pass < 3) continue;
        const p = (e && this.pos(e.from === n.key ? e.to : e.from)) ?? { x: 0, y: 0 };
        const a = rng(hash(n.key))() * Math.PI * 2;
        Object.assign(n, { x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20 });
      }
    const r = this.nodes.get(root);
    if (r) Object.assign(r, { fx: 0, fy: 0 });

    const seen = new Set<string>();
    const before = this.links.length;
    this.links = edges
      .filter((e) => this.nodes.has(e.from) && this.nodes.has(e.to) && e.from !== e.to)
      .filter((e) => {
        const pair = [e.from, e.to].sort().join('~');
        return !seen.has(pair) && !!seen.add(pair);
      })
      .map((e) => ({ source: e.from, target: e.to, e }) as unknown as L);
    this.sim.nodes([...this.nodes.values()]);
    (this.sim.force('link') as ForceLink<N, L>).links(this.links);
    this.rank(root);

    const heat = fresh.length || this.links.length !== before ? 0.8 : resized ? 0.25 : 0;
    if (heat > this.sim.alpha()) {
      this.sim.alpha(heat);
      this.settled = false;
    }
  }

  // One step per frame while warm; tells the page once it has come to rest.
  tick() {
    if (this.sim.alpha() < ALPHA_MIN) {
      if (!this.settled) {
        this.settled = true;
        this.onSettle();
      }
      return;
    }
    this.sim.tick();
    const hw = WALL.width / 2 - WALL.margin;
    const hh = WALL.height / 2 - WALL.margin;
    for (const n of this.nodes.values()) {
      if (n.fx != null) continue;
      n.x = Math.min(Math.max(n.x!, -hw + n.box.hw), hw - n.box.hw);
      n.y = Math.min(Math.max(n.y!, -hh + n.box.down), hh - n.box.up);
    }
  }

  // Generation rows, counted from the root through the lines: a parent line
  // moves one row (or `generations` rows), any other line keeps the row.
  // The first path found wins, so a loop in the data cannot tear a row.
  private rank(root: string) {
    this.row = new Map([[root, 0]]);
    const queue = [root];
    while (queue.length) {
      const k = queue.shift()!;
      const r = this.row.get(k)!;
      for (const { e } of this.links) {
        if (e.from !== k && e.to !== k) continue;
        const other = e.from === k ? e.to : e.from;
        if (this.row.has(other)) continue;
        const up = e.parent === other ? 1 : e.parent === k ? -1 : 0;
        this.row.set(other, r + up * (e.generations ?? 1));
        queue.push(other);
      }
    }
    // The band of rows sits centred on the wall, as tall as it fits.
    const rows = [...this.row.values()];
    const [lo, hi] = [Math.min(...rows), Math.max(...rows)];
    this.middle = (lo + hi) / 2;
    this.step = Math.min(GENERATION, (WALL.height - 2 * WALL.margin - 60) / Math.max(hi - lo, 1));
    const r = this.nodes.get(root);
    if (r) r.fy = this.y(0);
  }

  private y = (row: number) => (row - this.middle) * this.step;

  // Each name floats towards its row; names off the tree just drift.
  private rows(alpha: number) {
    for (const n of this.nodes.values()) {
      const r = this.row.get(n.key);
      if (r === undefined || n.fy != null) continue;
      n.vy! += (this.y(r) - n.y!) * 0.15 * alpha;
    }
  }

  // A soft pull towards the middle column; the rows hold the height.
  private home(alpha: number) {
    for (const n of this.nodes.values()) n.vx! -= n.x! * 0.006 * alpha;
  }

  // Text boxes push apart along the axis where they overlap least.
  private boxes() {
    const all = [...this.nodes.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const [a, b] = [all[i], all[j]];
        const ox = Math.min(a.x! + a.box.hw, b.x! + b.box.hw) - Math.max(a.x! - a.box.hw, b.x! - b.box.hw) + PAD;
        const oy = Math.min(a.y! + a.box.up, b.y! + b.box.up) - Math.max(a.y! - a.box.down, b.y! - b.box.down) + PAD;
        if (ox <= 0 || oy <= 0) continue;
        push(a, b, ox, oy);
      }
    const spot = (l: L) => {
      const [a, b] = [l.source as N, l.target as N];
      return { a, b, x: a.x! + (b.x! - a.x!) * l.e.label!.at, y: a.y! + (b.y! - a.y!) * l.e.label!.at, ...l.e.label! };
    };
    // Two sentences on top of each other: move the names at their outer ends
    // apart, which swings the lines (and their sentences) away from each other.
    const spots = this.links.filter((l) => l.e.label).map(spot);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const [p, q] = [spots[i], spots[j]];
        const ox = Math.min(p.x + p.hw, q.x + q.hw) - Math.max(p.x - p.hw, q.x - q.hw) + PAD / 2;
        const oy = Math.min(p.y + p.hh, q.y + q.hh) - Math.max(p.y - p.hh, q.y - q.hh) + PAD / 2;
        if (ox <= 0 || oy <= 0) continue;
        const outer = (s: typeof p, other: typeof p) => (s.a === other.a || s.a === other.b || s.a.fx != null ? s.b : s.a);
        const [m, n] = [outer(p, q), outer(q, p)];
        if (m === n) continue;
        const [dx, dy] = [q.x - p.x || 1e-3, q.y - p.y];
        const d = Math.hypot(dx, dy);
        const k = Math.min(ox, oy) * 0.15;
        m.vx! -= (dx / d) * k;
        m.vy! -= (dy / d) * k;
        n.vx! += (dx / d) * k;
        n.vy! += (dy / d) * k;
      }
    // Names step out from under sentences on lines they are not part of.
    for (const { a, b, x: lx, y: ly, hw, hh } of spots) {
      const obstacle: N = { key: '', box: { hw, up: hh, down: hh }, x: lx, y: ly, fx: lx, fy: ly, vx: 0, vy: 0 };
      for (const n of all) {
        if (n === a || n === b) continue;
        const ox = Math.min(n.x! + n.box.hw, lx + hw) - Math.max(n.x! - n.box.hw, lx - hw) + PAD / 2;
        const oy = Math.min(n.y! + n.box.up, ly + hh) - Math.max(n.y! - n.box.down, ly - hh) + PAD / 2;
        if (ox <= 0 || oy <= 0) continue;
        push(obstacle, n, ox, oy);
      }
    }
  }
}

// Separate two overlapping boxes; a pinned one does not move. Sideways by
// preference: the rows hold the height, so only a name almost straight above
// another is pushed up or down.
function push(a: N, b: N, ox: number, oy: number) {
  const aFixed = a.fx != null;
  const bFixed = b.fx != null;
  if (aFixed && bFixed) return;
  const [sa, sb] = aFixed ? [0, 1] : bFixed ? [1, 0] : [0.5, 0.5];
  const k = 0.35;
  if (ox < oy * 4) {
    const d = (b.x! >= a.x! ? 1 : -1) * ox * k;
    a.vx! -= d * sa;
    b.vx! += d * sb;
  } else {
    const ca = a.y! + (a.box.up - a.box.down) / 2;
    const cb = b.y! + (b.box.up - b.box.down) / 2;
    const d = (cb >= ca ? 1 : -1) * oy * k;
    a.vy! -= d * sa;
    b.vy! += d * sb;
  }
}
