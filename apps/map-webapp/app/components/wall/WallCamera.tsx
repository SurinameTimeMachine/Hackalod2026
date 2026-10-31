import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import type { StampLayout } from './wallLayout';
import { wallFocus } from './wallFocus';

export default function WallCamera({ selected, caption, detailsPanel = false, tree }: { selected?: StampLayout; caption?: string; detailsPanel?: boolean; tree?: { width: number; height: number } | null }) {
  const camera = useRef<ThreeOrthographicCamera>(null);
  const size = useThree(state => state.size);
  const canvas = useThree(state => state.gl.domElement);
  const navigation = useRef({ x: 0, y: 0, scale: 1 });
  useEffect(() => { navigation.current = { x: 0, y: 0, scale: 1 }; }, [selected?.id]);
  useEffect(() => {
    let pointer: { id: number; x: number; y: number } | null = null;
    const down = (event: PointerEvent) => { if (event.isPrimary) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || !camera.current) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      navigation.current.x -= dx / camera.current.zoom;
      navigation.current.y += dy / camera.current.zoom;
    };
    const up = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null; };
    const wheel = (event: WheelEvent) => { event.preventDefault(); navigation.current.scale = Math.max(.5, Math.min(6, navigation.current.scale * Math.exp(-event.deltaY * .001))); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel); };
  }, [canvas]);
  const inset = selected && detailsPanel ? Math.min(352, size.width * 0.45) : 0;
  const target = wallFocus(size.width - inset, size.height, selected, caption);
  if (tree && selected) {
    target.x = selected.x; target.y = selected.y;
    target.zoom = Math.min((size.width - 64) / tree.width, (size.height - 96) / tree.height, size.width / 1100);
  }

  useFrame((_, delta) => {
    const current = camera.current;
    if (!current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const amount = reduced ? 1 : 1 - Math.exp(-delta * 6);
    const targetX = target.x + (selected && inset ? inset / (2 * target.zoom) : 0);
    current.position.x += (targetX + navigation.current.x - current.position.x) * amount;
    current.position.y += (target.y + navigation.current.y - current.position.y) * amount;
    current.zoom += (target.zoom * navigation.current.scale - current.zoom) * amount;
    current.updateProjectionMatrix();
  });

  return <OrthographicCamera ref={camera} makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={Math.min(size.width / 1920, size.height / 1080)} />;
}
