import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';
import { CAPTION_FONT, FONTS, INKS } from './stampStyle';
import { WALL, type StampLayout } from './wallLayout';

export type StampState = 'idle' | 'selected' | 'related' | 'dimmed';

const DIMMED = 0.08; // the wall behind an open constellation
// Names on the scattered wall are small; lit ones grow so they read from afar.
export const LIT_SCALE = { selected: 2, related: 1.6 };

// Caption under the selected name, in the stamp's local (unscaled) units.
export const captionSize = (s: StampLayout) => Math.max(s.size * 0.45, 6);
export const captionTop = (s: StampLayout) => -s.size * 0.75;
const FADE = 600; // ms

type Props = {
  stamp: StampLayout;
  state: StampState;
  caption?: string; // shown under the name when lit
  pulse?: boolean; // loading: breathe softly
  origin?: { x: number; y: number }; // glide in from here (the name it came from)
  onClick: () => void;
};

// One name: flat solid text on black, no frame. Opacity and scale ease
// towards the target for the current state.
export default function Stamp({ stamp, state, caption, pulse, origin, onClick }: Props) {
  const group = useRef<Group>(null);
  const name = useRef<{ fillOpacity: number } | null>(null);
  const target = state === 'dimmed' ? DIMMED : state === 'idle' ? stamp.opacity : 1;
  const targetScale = state === 'selected' ? LIT_SCALE.selected : state === 'related' ? LIT_SCALE.related : 1;

  const z = state === 'idle' || state === 'dimmed' ? 0 : 1;

  useLayoutEffect(() => {
    group.current?.position.set(origin?.x ?? stamp.x, origin?.y ?? stamp.y, z);
    // Only on mount: afterwards the position eases towards the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp((-dt * 1000 * 4) / FADE);
    const breathe = pulse ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(clock.elapsedTime * 4)) : 1;
    if (name.current) name.current.fillOpacity += (target * breathe - name.current.fillOpacity) * k;
    const g = group.current;
    if (!g) return;
    g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * k);
    g.position.x += (stamp.x - g.position.x) * k;
    g.position.y += (stamp.y - g.position.y) * k;
    g.position.z = z;
  });

  // Keep the caption inside the wall when the name sits near an edge
  // (Courier Prime: ~0.6 em per character).
  const capSize = captionSize(stamp);
  const scale = LIT_SCALE.selected;
  const captionHalf = caption ? (Math.max(...caption.split('\n').map((l) => l.length)) * capSize * 0.6 * scale) / 2 : 0;
  const edge = WALL.width / 2 - WALL.margin / 2;
  const captionDx = (Math.min(Math.max(stamp.x, -edge + captionHalf), edge - captionHalf) - stamp.x) / scale;

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
