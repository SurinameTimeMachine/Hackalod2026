import { Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useRef, useState, type RefObject } from 'react';
import type { Point } from './forceLayout';
import { FrameContext, type Emphasis } from './frame';
import type { Group } from 'three';
import Stamp, { type StampState } from './Stamp';
import { CAPTION_FONT } from './stampStyle';
import { WALL, type StampLayout } from './wallLayout';

export type ConstellationLine = {
  key: string;
  fromKey: string;
  toKey: string;
  from: StampLayout;
  to: StampLayout;
  fromScale: number; // the stamp's scale while lit, to clear its text
  toScale: number;
  fromBelow: number; // extra room under a lit name for its caption, world units
  toBelow: number;
  certain: boolean;
  reason: string;
  reference: string;
  showReference: boolean; // only on lines of the name in focus, to keep it calm
  labelAt: number; // where along the line (0 = from, 1 = to) the label sits
};

// A name that exists only in the constellation (not on the wall).
export type ConstellationName = {
  key: string;
  stamp: StampLayout;
  state: StampState;
  caption?: string;
  headline?: string;
  pulse: boolean;
  origin?: { x: number; y: number };
};

const THREAD = '#e6dcc6';
const DELAY = 0.35; // s, let the wall dim first
const DRAW = 0.8; // s, line grows from the selected name outwards
const LABEL_FADE = 0.5;

// The line's points are set every frame; this only seeds the geometry (a
// stable array, or drei would rebuild the geometry on every render).
const SEED: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, 0],
];

type Drawn = Map<string, Point>; // where each name is drawn this frame
type LineObject = { geometry: { setPositions(p: number[]): void }; computeLineDistances(): void; visible: boolean };

// Distance from a stamp's centre to the edge of its (padded) text box along
// direction (dx, dy), in the stamp's own rotated frame.
function clearance(s: StampLayout, scale: number, dx: number, dy: number, below = 0) {
  const c = Math.cos(-s.rotation);
  const n = Math.sin(-s.rotation);
  const lx = Math.abs(dx * c - dy * n);
  const lyRaw = dx * n + dy * c;
  const ly = Math.abs(lyRaw);
  const hw = (s.width * scale) / 2 + s.size * 0.4;
  const hh = s.size * scale * 0.9 + (lyRaw < 0 ? below : 0);
  return Math.min(lx > 1e-6 ? hw / lx : Infinity, ly > 1e-6 ? hh / ly : Infinity);
}

// A line between two names that may still be moving: it is rebuilt every
// frame from where both names are drawn.
function Thread({ line, drawn }: { line: ConstellationLine; drawn: Drawn }) {
  const frame = useContext(FrameContext);
  const stroke = useRef<LineObject>(null);
  const label = useRef<Group>(null);
  const texts = useRef<({ fillOpacity: number } | null)[]>([]);
  const t0 = useRef<number | null>(null);

  const { from, to } = line;
  const size = Math.max(from.size * 0.6, 11);
  // Courier Prime is monospaced: ~0.6 em per character.
  const labels = line.showReference ? [line.reason, line.reference] : [line.reason];
  const labelHalf = (Math.min(Math.max(line.reason.length, line.showReference ? line.reference.length * 0.8 : 0), 26 / 0.6) * size * 0.6) / 2;
  const edge = (WALL.width / 2 - WALL.margin / 2) * frame.scale;

  useFrame(({ clock }) => {
    const a = drawn.get(line.fromKey);
    const b = drawn.get(line.toKey);
    const l = stroke.current;
    if (!a || !b || !l) return;
    t0.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const [ux, uy] = [dx / dist, dy / dist];
    const start = clearance(from, line.fromScale, ux, uy, line.fromBelow);
    const end = Math.max(dist - clearance(to, line.toScale, ux, uy, line.toBelow), start);
    const p = Math.min(Math.max((t - DELAY) / DRAW, 0), 1);
    const grown = start + (end - start) * (1 - Math.pow(1 - p, 3));
    l.visible = grown - start > 0.5;
    l.geometry.setPositions([a.x + ux * start, a.y + uy * start, 0.5, a.x + ux * grown, a.y + uy * grown, 0.5]);
    l.computeLineDistances();

    // The sentence stays horizontal so it reads from a distance on the
    // beamer, nudged inside the wall if it would run off an edge.
    const mid = start + (end - start) * line.labelAt;
    const g = label.current;
    if (g) g.position.set(Math.min(Math.max(a.x + ux * mid, frame.x - edge + labelHalf), frame.x + edge - labelHalf), a.y + uy * mid, 0.8);
    const o = Math.min(Math.max((t - DELAY - DRAW) / LABEL_FADE, 0), 1);
    for (const txt of texts.current) if (txt) txt.fillOpacity = o;
    if (g) g.visible = o > 0;
  });

  return (
    <>
      {/* No `visible` prop here: drei passes it on to the material as well,
          which would hide the line for good. useFrame toggles the object. */}
      <Line
        ref={stroke as never}
        points={SEED}
        frustumCulled={false}
        color={THREAD}
        lineWidth={1.2}
        transparent
        opacity={0.7}
        dashed={!line.certain}
        dashSize={size * 0.6}
        gapSize={size * 0.5}
      />
      <group ref={label} visible={false}>
        {line.reason && labels.map((text, i) => (
          <Text
            key={i}
            ref={(el) => {
              texts.current[i] = el;
            }}
            font={CAPTION_FONT}
            fontSize={i === 0 ? size : size * 0.8}
            color={THREAD}
            fillOpacity={0}
            anchorX="center"
            anchorY={i === 0 ? 'bottom' : 'top'}
            position={[0, i === 0 ? size * 0.35 : -size * 0.35, 0]}
            // Black outline cuts the label free of the dimmed names behind it.
            outlineWidth="30%"
            outlineColor="#000"
            maxWidth={size * 26}
            textAlign="center"
          >
            {text}
          </Text>
        ))}
      </group>
    </>
  );
}

// The names reached by clicking, and the lines between all lit names, each
// labelled with why they are connected.
export default function Constellation({
  names,
  lines,
  at,
  emphasis,
  onClick,
}: {
  names: ConstellationName[];
  lines: ConstellationLine[];
  at: (key: string) => Point | undefined; // live layout position
  emphasis?: RefObject<Emphasis>; // keyed by node key
  onClick: (key: string) => void;
}) {
  const [drawn] = useState<Drawn>(() => new Map());
  return (
    <>
      {lines.map((l) => (
        <Thread key={l.key} line={l} drawn={drawn} />
      ))}
      {names.map((n) => (
        <Stamp
          key={n.key}
          stamp={n.stamp}
          state={n.state}
          caption={n.caption}
          headline={n.headline}
          pulse={n.pulse}
          origin={n.origin}
          at={() => at(n.key)}
          shown={(x, y) => drawn.set(n.key, { x, y })}
          emphasis={emphasis}
          emKey={n.key}
          onClick={() => onClick(n.key)}
        />
      ))}
    </>
  );
}
