import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import type { StampLayout } from './wallLayout';
import { wallFocus } from './wallFocus';

export default function WallCamera({ selected, caption, detailsPanel = false }: { selected?: StampLayout; caption?: string; detailsPanel?: boolean }) {
  const camera = useRef<ThreeOrthographicCamera>(null);
  const size = useThree(state => state.size);
  const inset = selected && detailsPanel ? Math.min(352, size.width * 0.45) : 0;
  const target = wallFocus(size.width - inset, size.height, selected, caption);

  useFrame((_, delta) => {
    const current = camera.current;
    if (!current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const amount = reduced ? 1 : 1 - Math.exp(-delta * 6);
    const targetX = target.x + (selected && inset ? inset / (2 * target.zoom) : 0);
    current.position.x += (targetX - current.position.x) * amount;
    current.position.y += (target.y - current.position.y) * amount;
    current.zoom += (target.zoom - current.zoom) * amount;
    current.updateProjectionMatrix();
  });

  return <OrthographicCamera ref={camera} makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={Math.min(size.width / 1920, size.height / 1080)} />;
}
