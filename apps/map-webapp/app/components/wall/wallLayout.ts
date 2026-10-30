// Scattered layout: names are dropped at seeded random spots on the wall,
// never overlapping, thinning out towards the border so the wall has a ragged
// edge instead of a hard rectangle. Fonts are measured for real.
import { comboCandidates, FONTS, rng, variation, type Combo } from './stampStyle';

export const WALL = { width: 1920, height: 1080, margin: 48 };
const FILL = 0.25; // share of the wall covered by (padded) text boxes; lower = airier
const PAD_X = 0.7; // min clearance around a name, in em
const PAD_Y = 0.55;
const EDGE_FADE = 170; // world units over which density fades out towards the border
const TRIES = 4000; // random spots tried per name before shrinking the font
const BEST_OF = 4; // of the free spots found, keep the one furthest from others

export type StampLayout = {
  id: number;
  text: string;
  x: number; // centre, world units (origin = wall centre, y up)
  y: number;
  size: number; // font size, world units
  width: number; // text width, world units
  rotation: number;
  opacity: number;
  combo: Combo;
};

type Item = { id: number; text: string };
type Measure = (text: string, font: number) => number;

export function makeMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (text, font) => {
    ctx.font = `100px "${FONTS[font].name}"`;
    return (ctx.measureText(text).width / 100) * FONTS[font].scale; // width in em
  };
}

function shuffle<T>(items: T[], seed: number) {
  const r = rng(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const same = (a: Combo, b: Combo) => a.font === b.font && a.ink === b.ink;

type Box = { x0: number; x1: number; y0: number; y1: number; cx: number; cy: number; combo: Combo };

// Uniform grid over the wall for fast overlap and neighbour queries.
class Grid {
  private cells = new Map<number, Box[]>();
  constructor(private cell: number) {}
  private range(b: { x0: number; x1: number; y0: number; y1: number }, grow = 0) {
    const c = this.cell;
    return [
      Math.floor((b.x0 - grow) / c),
      Math.floor((b.x1 + grow) / c),
      Math.floor((b.y0 - grow) / c),
      Math.floor((b.y1 + grow) / c),
    ];
  }
  add(b: Box) {
    const [i0, i1, j0, j1] = this.range(b);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = i * 100003 + j;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k)!.push(b);
      }
  }
  near(b: { x0: number; x1: number; y0: number; y1: number }, grow = 0) {
    const out = new Set<Box>();
    const [i0, i1, j0, j1] = this.range(b, grow);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) for (const o of this.cells.get(i * 100003 + j) ?? []) out.add(o);
    return out;
  }
}

const overlaps = (a: Omit<Box, 'combo' | 'cx' | 'cy'>, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function scatter(items: Item[], size: number, measure: Measure): StampLayout[] | null {
  const r = rng(1921);
  const hw = WALL.width / 2 - WALL.margin;
  const hh = WALL.height / 2 - WALL.margin;
  const grid = new Grid(size * 4);
  const out: StampLayout[] = [];

  // Density falls off near the border, with a little wobble along it.
  const accept = (x: number, y: number) => {
    const d = Math.min(hw - Math.abs(x), hh - Math.abs(y));
    const wobble = 0.35 * Math.sin(x * 0.011 + y * 0.007) + 0.25 * Math.sin(y * 0.019 - x * 0.004);
    const t = Math.min(Math.max(d / EDGE_FADE + wobble * 0.5, 0), 1);
    return r() < t * t * (3 - 2 * t);
  };

  for (const item of items) {
    const v = variation(item.id);
    const s = size * v.scale;
    let placed = false;

    // Neighbouring names never share font+ink (phone recognition later): if
    // the chosen spot has a twin nearby, try the next combination.
    for (const combo of comboCandidates(item.id).slice(0, 12)) {
      const w = measure(item.text, combo.font) * s;
      // Axis-aligned extent of the slightly rotated, padded text box.
      const c = Math.abs(Math.cos(v.rotation));
      const n = Math.abs(Math.sin(v.rotation));
      const bw = w + PAD_X * s * 2;
      const bh = s * (1 + PAD_Y * 2);
      const ex = (bw * c + bh * n) / 2;
      const ey = (bw * n + bh * c) / 2;
      if (ex > hw) continue;

      let best: Box | null = null;
      let bestScore = -1;
      let found = 0;
      for (let t = 0; t < TRIES && found < BEST_OF; t++) {
        const x = (r() * 2 - 1) * (hw - ex);
        const y = (r() * 2 - 1) * (hh - ey);
        if (!accept(x, y)) continue;
        const box = { x0: x - ex, x1: x + ex, y0: y - ey, y1: y + ey };
        const around = grid.near(box, size * 6);
        let free = true;
        let nearest = Infinity;
        for (const o of around) {
          if (overlaps(box, o)) {
            free = false;
            break;
          }
          nearest = Math.min(nearest, Math.hypot(o.cx - x, o.cy - y));
        }
        if (!free) continue;
        found++;
        if (nearest > bestScore) {
          bestScore = nearest;
          best = { ...box, cx: x, cy: y, combo };
        }
      }
      if (!best) continue;
      const twin = [...grid.near(best, size * 4)].some((o) => same(o.combo, combo));
      if (twin) continue;

      grid.add(best);
      out.push({
        id: item.id,
        text: item.text,
        x: best.cx,
        y: best.cy,
        size: s,
        width: w,
        rotation: v.rotation,
        opacity: v.opacity,
        combo,
      });
      placed = true;
      break;
    }
    if (!placed) return null;
  }
  return out;
}

export function layoutWall(items: Item[], measure: Measure): StampLayout[] {
  // Longest names first: they are the hardest to fit.
  const ordered = shuffle(items, 1921)
    .map((it) => ({ it, w: measure(it.text, comboCandidates(it.id)[0].font) }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.it);

  // Font size from the target fill, shrinking until every name finds a spot.
  const area = (WALL.width - 2 * WALL.margin) * (WALL.height - 2 * WALL.margin);
  const emArea = ordered.reduce(
    (sum, it) => sum + (measure(it.text, comboCandidates(it.id)[0].font) + PAD_X * 2) * (1 + PAD_Y * 2),
    0,
  );
  let size = Math.sqrt((area * FILL) / emArea);
  for (let i = 0; i < 12; i++, size *= 0.94) {
    const out = scatter(ordered, size, measure);
    if (out) return out;
  }
  throw new Error('wall layout: names do not fit');
}
