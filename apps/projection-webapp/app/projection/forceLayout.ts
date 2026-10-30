// Incremental constellation layout. Names already on screen are pinned; new
// ones start next to the name they came from and are pushed into free space,
// so nothing that is already shown jumps.
import { forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { rng } from './stampStyle';
import { WALL } from './wallLayout';

export type Point = { x: number; y: number };

type SimNode = SimulationNodeDatum & { key: string; r: number };

const TICKS = 300;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function placeNodes(
  fixed: Map<string, Point & { r: number }>, // already placed, never moves
  fresh: { key: string; parent: string; r: number }[],
  links: { from: string; to: string }[],
): Map<string, Point> {
  const hw = WALL.width / 2 - WALL.margin;
  const hh = WALL.height / 2 - WALL.margin;
  const nodes = new Map<string, SimNode>();
  for (const [key, p] of fixed) nodes.set(key, { key, r: p.r, x: p.x, y: p.y, fx: p.x, fy: p.y });
  for (const f of fresh) {
    const parent = fixed.get(f.parent) ?? { x: 0, y: 0 };
    const r = rng(hash(f.key));
    const a = r() * Math.PI * 2;
    nodes.set(f.key, { key: f.key, r: f.r, x: parent.x + Math.cos(a) * 60, y: parent.y + Math.sin(a) * 60 });
  }
  const simLinks = links
    .filter((l) => nodes.has(l.from) && nodes.has(l.to))
    .map((l) => ({ source: nodes.get(l.from)!, target: nodes.get(l.to)! }));

  const sim = forceSimulation([...nodes.values()])
    .force('link', forceLink(simLinks).distance((l) => 260 + (l.source as SimNode).r + (l.target as SimNode).r).strength(0.5))
    .force('charge', forceManyBody().strength(-260).distanceMax(500))
    .force('collide', forceCollide<SimNode>((n) => n.r).strength(1).iterations(3))
    .stop();

  for (let i = 0; i < TICKS; i++) {
    sim.tick();
    for (const n of nodes.values()) {
      if (n.fx != null) continue;
      n.x = Math.min(Math.max(n.x!, -hw + n.r), hw - n.r);
      n.y = Math.min(Math.max(n.y!, -hh + n.r * 0.4), hh - n.r * 0.4);
    }
  }
  const out = new Map<string, Point>();
  for (const f of fresh) {
    const n = nodes.get(f.key)!;
    out.set(f.key, { x: n.x!, y: n.y! });
  }
  return out;
}
