// Inside the canvas: the camera that turns with the beamer, the calibration
// grid, and where the centre of the beam lands (a new tree opens there).
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import { BufferGeometry, Euler, Float32BufferAttribute, PerspectiveCamera, Vector3 } from 'three';
import type { Point } from '../forceLayout';
import { BEAM } from './config';
import { distance, type Searchlight } from './state';

const DEG = Math.PI / 180;
const NEAR = 10;
const FAR = 100_000;

type Props = {
  sl: Searchlight;
  beamPointRef: RefObject<() => Point>;
};

// A perspective camera with the beamer's field of view, at the pivot, with
// an asymmetric frustum for the lens offset. R3F leaves it alone (`manual`).
function useSearchlightCamera(sl: Searchlight) {
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);
  const [camera] = useState(() => {
    const c = new PerspectiveCamera() as PerspectiveCamera & { manual?: boolean };
    c.manual = true;
    return c;
  });
  useLayoutEffect(() => {
    const previous = get().camera;
    set({ camera });
    return () => set({ camera: previous });
  }, [camera, get, set]);
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);

  useFrame(({ size, clock }, dt) => {
    const c = sl.config;
    sl.update(clock.elapsedTime * 1000, dt);
    const aspect = size.width / size.height;
    const tanH = Math.tan((c.hFov * DEG) / 2);
    const tanV = tanH / aspect;
    let top = NEAR * tanV;
    let bottom = -top;
    const shift = c.lensShiftY * (top - bottom);
    top += shift;
    bottom += shift;
    camera.projectionMatrix.makePerspective(-NEAR * tanH, NEAR * tanH, top, bottom, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // Pivot in front of the wall centre; with a lens offset, low enough that
    // at zero the middle of the image lands on the middle of the wall.
    const d = distance(c);
    camera.position.set(0, -2 * d * tanV * c.lensShiftY, d);
    euler.set(sl.aim.pitch * DEG, sl.aim.yaw * DEG, sl.aim.roll * DEG, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld();
  }, -2);
  return camera;
}

// World-fixed calibration grid: lines every half beam, a cross at every
// crossing, a large one at the wall's centre.
function TestPattern({ width, height }: { width: number; height: number }) {
  const [grid, crosses] = useMemo(() => {
    const lines: number[] = [];
    const marks: number[] = [];
    const [sx, sy] = [BEAM.width / 2, BEAM.height / 2];
    const nx = Math.floor(width / 2 / sx);
    const ny = Math.floor(height / 2 / sy);
    for (let i = -nx; i <= nx; i++) lines.push(i * sx, -ny * sy, 2, i * sx, ny * sy, 2);
    for (let j = -ny; j <= ny; j++) lines.push(-nx * sx, j * sy, 2, nx * sx, j * sy, 2);
    for (let i = -nx; i <= nx; i++)
      for (let j = -ny; j <= ny; j++) {
        const r = i === 0 && j === 0 ? 120 : 40;
        const [x, y] = [i * sx, j * sy];
        marks.push(x - r, y, 2, x + r, y, 2, x, y - r, 2, x, y + r, 2);
      }
    const geo = (p: number[]) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(p, 3));
      return g;
    };
    return [geo(lines), geo(marks)];
  }, [width, height]);
  return (
    <>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#3a3a3a" />
      </lineSegments>
      <lineSegments geometry={crosses}>
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>
    </>
  );
}

export default function Scene({ sl, beamPointRef }: Props) {
  const camera = useSearchlightCamera(sl);
  useSyncExternalStore(sl.subscribe, sl.getVersion);
  const [ray] = useState(() => new Vector3());

  useLayoutEffect(() => {
    beamPointRef.current = () => ({ ...sl.beam });
    return () => {
      beamPointRef.current = () => ({ x: 0, y: 0 });
    };
  }, [beamPointRef, sl]);

  // The centre of the image, on the wall plane.
  useFrame(() => {
    ray.set(0, 0, 0.5).unproject(camera).sub(camera.position);
    if (ray.z >= 0) return;
    const hit = -camera.position.z / ray.z;
    sl.setBeam(camera.position.x + ray.x * hit, camera.position.y + ray.y * hit);
  });

  return sl.show.pattern ? <TestPattern width={sl.bounds.width} height={sl.bounds.height} /> : null;
}
