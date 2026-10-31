import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useContext, useRef, type RefObject } from 'react';
import type { Group } from 'three';
import { FrameContext, type Emphasis } from './frame';
import { CAPTION_FONT, FONTS, INKS } from './stampStyle';
import { WALL, type StampLayout } from './wallLayout';

export type StampState = 'idle' | 'selected' | 'related' | 'dimmed';

const DIMMED = 0.08; // the wall behind an open constellation
// Names on the scattered wall are small; lit ones grow so they read from afar.
export const LIT_SCALE = { selected: 2, related: 1.6 };

// Caption under the selected name, in the stamp's local (unscaled) units.
export const captionSize = (s: StampLayout) => Math.max(s.size * 0.45, 6);
export const captionTop = (s: StampLayout) => -s.size * 0.75;
export const headlineBottom = (s: StampLayout) => s.size * 0.75;
const FADE = 600; // ms
const EMPHASIS_SCALE = 0.15; // a name being pointed at grows by up to this much

type Props = {
  stamp: StampLayout;
  state: StampState;
  caption?: string; // shown under the name when lit
  headline?: string; // a short line above the name ("new story by …")
  pulse?: boolean; // loading: breathe softly
  origin?: { x: number; y: number }; // glide in from here (the name it came from)
  at?: () => { x: number; y: number } | undefined; // live position (family tree), read every frame
  shown?: (x: number, y: number) => void; // where it is drawn this frame, for the lines
  emphasis?: RefObject<Emphasis>; // brightens while `emphasis.key === emKey`
  emKey?: string;
  onClick: () => void;
};

// One name: flat solid text on black, no frame. Opacity and scale ease
// towards the target for the current state.
export default function Stamp({ stamp, state, caption, headline, pulse, origin, at, shown, emphasis, emKey, onClick }: Props) {
  const frame = useContext(FrameContext);
  const group = useRef<Group>(null);
  const name = useRef<{ fillOpacity: number } | null>(null);
  const target = state === 'dimmed' ? DIMMED : state === 'idle' ? stamp.opacity : 1;
  const targetScale = state === 'selected' ? LIT_SCALE.selected : state === 'related' ? LIT_SCALE.related : 1;

  const z = state === 'idle' || state === 'dimmed' ? 0 : 1;

  const placed = useRef(false);

  useFrame(({ clock }, dt) => {
    // First frame: start where it comes from (its wall spot, or where the
    // layout spawned it); afterwards ease towards the target.
    if (!placed.current && group.current) {
      const start = origin ?? at?.() ?? stamp;
      group.current.position.set(start.x, start.y, z);
      placed.current = true;
    }
    const k = 1 - Math.exp((-dt * 1000 * 4) / FADE);
    const breathe = pulse ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(clock.elapsedTime * 4)) : 1;
    const em = emKey !== undefined && emphasis?.current.key === emKey ? emphasis.current.amount : 0;
    const opacity = target * breathe;
    if (name.current) name.current.fillOpacity += (opacity + (1 - opacity) * em - name.current.fillOpacity) * k;
    const g = group.current;
    if (!g) return;
    g.scale.setScalar(g.scale.x + (targetScale * (1 + EMPHASIS_SCALE * em) - g.scale.x) * k);
    const to = at?.() ?? stamp;
    g.position.x += (to.x - g.position.x) * k;
    g.position.y += (to.y - g.position.y) * k;
    g.position.z = z;
    shown?.(g.position.x, g.position.y);
  });

  // Keep the caption inside the wall when the name sits near an edge
  // (Courier Prime: ~0.6 em per character).
  const capSize = captionSize(stamp);
  const scale = LIT_SCALE.selected;
  const captionHalf = caption ? (Math.max(...caption.split('\n').map((l) => l.length)) * capSize * 0.6 * scale) / 2 : 0;
  const edge = (WALL.width / 2 - WALL.margin / 2) * frame.scale;
  const captionDx = (Math.min(Math.max(stamp.x, frame.x - edge + captionHalf), frame.x + edge - captionHalf) - stamp.x) / scale;

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  };

  return (
    <group ref={group} rotation={[0, 0, stamp.rotation]}>
      <Text
        ref={name}
        font={FONTS[stamp.combo.font].url}
        fontSize={stamp.size * FONTS[stamp.combo.font].scale}
        color={INKS[stamp.combo.ink]}
        fillOpacity={stamp.opacity}
        anchorX="center"
        anchorY="middle"
        onClick={click}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        {stamp.text}
      </Text>
      {headline && (
        <Text
          font={CAPTION_FONT}
          fontSize={captionSize(stamp)}
          color={INKS[stamp.combo.ink]}
          anchorX="center"
          anchorY="bottom"
          position={[0, headlineBottom(stamp), 0]}
        >
          {headline}
        </Text>
      )}
      {caption && (
        <Text
          font={CAPTION_FONT}
          fontSize={capSize}
          color={INKS[stamp.combo.ink]}
          anchorX="center"
          anchorY="top"
          textAlign="center"
          lineHeight={1.25}
          position={[captionDx, captionTop(stamp), 0]}
        >
          {caption}
        </Text>
      )}
    </group>
  );
}
