import { Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { CAPTION_FONT } from './stampStyle';
import { WALL, type StampLayout } from './wallLayout';

export type ConstellationLine = {
  key: string;
  from: StampLayout;
  to: StampLayout;
  fromScale: number; // the stamp's scale while lit, to clear its text
  toScale: number;
  fromBelow: number; // extra room under the selected name for its caption, world units
  certain: boolean;
  reason: string;
  reference: string;
};

const THREAD = '#82601c';
const DELAY = 0.35; // s, let the wall dim first
const DRAW = 0.8; // s, line grows from the selected name outwards
const LABEL_FADE = 0.5;

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

function Thread({ line }: { line: ConstellationLine }) {
  const grow = useRef<Group>(null);
  const label = useRef<Group>(null);
  const texts = useRef<({ fillOpacity: number } | null)[]>([]);
  const t0 = useRef<number | null>(null);

  const { from, to } = line;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist;
  const uy = dy / dist;
  const start = clearance(from, line.fromScale, ux, uy, line.fromBelow);
  const end = dist - clearance(to, line.toScale, ux, uy);
  const length = Math.max(end - start, 0);
  const angle = Math.atan2(dy, dx);
  const mid = start + length / 2;
  const size = Math.max(from.size * 0.6, 11);
  // Label sits at the middle of the line, nudged inside the wall if it would
  // run off an edge (Courier Prime is monospaced: ~0.6 em per character).
  const labelHalf = (Math.min(Math.max(line.reason.length, line.reference.length * 0.8), 26 / 0.6) * size * 0.6) / 2;
  const edge = WALL.width / 2 - WALL.margin / 2;
  const labelX = Math.min(Math.max(from.x + ux * mid, -edge + labelHalf), edge - labelHalf);
  const labelY = from.y + uy * mid;

  useFrame(({ clock }) => {
    t0.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    const p = Math.min(Math.max((t - DELAY) / DRAW, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3);
    if (grow.current) grow.current.scale.x = Math.max(eased, 1e-4);
    const o = Math.min(Math.max((t - DELAY - DRAW) / LABEL_FADE, 0), 1);
    for (const txt of texts.current) if (txt) txt.fillOpacity = o;
    if (label.current) label.current.visible = o > 0;
  });

  return (
    <>
      <group position={[from.x, from.y, 0.5]} rotation={[0, 0, angle]}>
        <group ref={grow}>
          <Line
            points={[
              [start, 0, 0],
              [end, 0, 0],
            ]}
            color={THREAD}
            lineWidth={1.2}
            transparent
            opacity={0.7}
            dashed={!line.certain}
            dashSize={size * 0.6}
            gapSize={size * 0.5}
          />
        </group>
      </group>
      {/* Labels stay horizontal so they read from a distance on the beamer. */}
      <group ref={label} position={[labelX, labelY, 0.8]} visible={false}>
        {[line.reason, line.reference].map((text, i) => (
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
            outlineColor="#fbfaf6"
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

// Lines between lit names, each labelled with why they are connected.
export default function Constellation({ lines }: { lines: ConstellationLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <Thread key={l.key} line={l} />
      ))}
    </>
  );
}
