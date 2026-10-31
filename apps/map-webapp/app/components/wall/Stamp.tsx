import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { CAPTION_FONT, FONTS, INKS } from './stampStyle';
import type { StampLayout } from './wallLayout';

export type StampState = 'idle' | 'selected' | 'related' | 'dimmed';

const DIMMED = 0.15;
// Names on the scattered wall are small; lit ones grow so they read from afar.
export const LIT_SCALE = { selected: 2, related: 1.6 };

// Caption under the selected name, in the stamp's local (unscaled) units.
export const captionSize = (s: StampLayout) => Math.max(s.size * 0.45, 6);
export const captionTop = (s: StampLayout) => -s.size * 0.75;
const FADE = 600; // ms

type Props = {
  stamp: StampLayout;
  state: StampState;
  caption?: string; // shown under the name when selected
  onSelect: (id: number) => void;
};

// One name: flat solid text on black, no frame. Opacity and scale ease
// towards the target for the current state.
export default function Stamp({ stamp, state, caption, onSelect }: Props) {
  const group = useRef<Group>(null);
  const name = useRef<{ fillOpacity: number; strokeOpacity: number } | null>(null);
  const target = state === 'dimmed' ? DIMMED : state === 'idle' ? stamp.opacity : 1;
  const targetScale = state === 'selected' ? LIT_SCALE.selected : state === 'related' ? LIT_SCALE.related : 1;

  useFrame((_, dt) => {
    const k = 1 - Math.exp((-dt * 1000 * 4) / FADE);
    if (name.current) {
      name.current.fillOpacity += (target - name.current.fillOpacity) * k;
      name.current.strokeOpacity += (target * 0.22 - name.current.strokeOpacity) * k;
    }
    const g = group.current;
    if (g) g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * k);
  });

  const capSize = captionSize(stamp);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(stamp.id);
  };

  return (
    <group ref={group} position={[stamp.x, stamp.y, state === 'idle' || state === 'dimmed' ? 0 : 1]} rotation={[0, 0, stamp.rotation]}>
      {(state === 'selected' || state === 'related') && <mesh position={[0, caption ? -stamp.size * .45 : 0, -0.01]}>
        <planeGeometry args={[Math.max(stamp.width, ...((caption ?? '').split('\n').map(line => line.length * capSize * .6))) + stamp.size, caption ? stamp.size * 2.5 + capSize * 1.25 * caption.split('\n').length : stamp.size * 1.8]} />
        <meshBasicMaterial color="#fbfaf6" transparent opacity={0.94} depthWrite={false} />
      </mesh>}
      <Text
        ref={name}
        font={FONTS[stamp.combo.font].url}
        fontSize={stamp.size * FONTS[stamp.combo.font].scale}
        color={INKS[stamp.combo.ink]}
        fillOpacity={stamp.opacity}
        strokeWidth={stamp.size * 0.018}
        strokeColor={INKS[stamp.combo.ink]}
        strokeOpacity={stamp.opacity * 0.22}
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
          position={[0, captionTop(stamp), 0]}
        >
          {caption}
        </Text>
      )}
    </group>
  );
}
