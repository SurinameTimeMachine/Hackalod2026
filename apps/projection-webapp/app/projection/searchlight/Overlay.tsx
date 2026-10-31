// Over the canvas: the soft round beam edge and the debug overlay. Also owns
// the searchlight's inputs (tracker stream, calibration keys, mouse drag,
// arrow keys) while it is mounted.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SearchlightConfig } from './config';
import type { Searchlight } from './state';

const round = (v: number, step: number) => Math.round(v / step) * step;

// Calibration keys (§7): key → change, from the current config.
const KEYS: Record<string, (c: SearchlightConfig) => Partial<SearchlightConfig>> = {
  '[': (c) => ({ hFov: round(Math.max(c.hFov - 0.5, 5), 0.5) }),
  ']': (c) => ({ hFov: round(Math.min(c.hFov + 0.5, 120), 0.5) }),
  ';': (c) => ({ lensShiftY: round(c.lensShiftY - 0.02, 0.01) }),
  "'": (c) => ({ lensShiftY: round(c.lensShiftY + 0.02, 0.01) }),
  '-': (c) => ({ minCutoff: round(Math.max(c.minCutoff - 0.1, 0.05), 0.05) }),
  '=': (c) => ({ minCutoff: round(c.minCutoff + 0.1, 0.05) }),
  '9': (c) => ({ beta: round(Math.max(c.beta - 0.005, 0), 0.001) }),
  '0': (c) => ({ beta: round(c.beta + 0.005, 0.001) }),
};

function useInputs(sl: Searchlight) {
  useEffect(() => sl.connect(), [sl]);

  useEffect(() => {
    sl.setSim(new URLSearchParams(window.location.search).get('sim') === '1');
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = sl.config;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYS[k]) sl.adjust(KEYS[k](c));
      else if (k === 'c') sl.calibrate();
      else if (k === 't') {
        sl.show.pattern = !sl.show.pattern;
        sl.changed();
      } else if (k === 'v') {
        sl.show.edge = !sl.show.edge;
        sl.changed();
      } else if (k === 'p') sl.persist();
      else if (k === 'ArrowLeft') sl.manual.yaw += c.keyStep;
      else if (k === 'ArrowRight') sl.manual.yaw -= c.keyStep;
      else if (k === 'ArrowUp') sl.manual.pitch += c.keyStep;
      else if (k === 'ArrowDown') sl.manual.pitch -= c.keyStep;
      else return;
      e.preventDefault();
    };
    // Dragging moves the beam with the mouse: a drag across the window turns
    // it by one field of view.
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button === 0) drag = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = sl.config.hFov / window.innerWidth;
      sl.manual.yaw -= (e.clientX - drag.x) * k;
      sl.manual.pitch -= (e.clientY - drag.y) * k;
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [sl]);
}

// Only darkens, so black stays black.
function BeamEdge({ inner, outer }: { inner: number; outer: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(ellipse at center, transparent ${inner}%, #000 ${outer}%)`,
      }}
    />
  );
}

// Projected, so hidden unless D is pressed.
function DebugOverlay({ sl }: { sl: Searchlight }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, []);
  const c = sl.config;
  const age = sl.lastPoseAt ? now - sl.lastPoseAt : null;
  const lost = sl.lastPoseAt > 0 && !sl.trackerLive;
  const lines = [
    `searchlight  ${Math.round(sl.fps)} fps${sl.sim ? '  sim' : ''}`,
    `tracker: ${sl.lastPoseAt ? (lost ? 'LOST (frozen)' : `${Math.round(sl.poseRate)} Hz, age ${Math.round(age!)} ms`) : 'none yet'}`,
    `yaw ${sl.aim.yaw.toFixed(1)}°  pitch ${sl.aim.pitch.toFixed(1)}°  roll ${sl.aim.roll.toFixed(1)}°  speed ${sl.aim.speed.toFixed(0)}°/s`,
    `manual yaw ${sl.manual.yaw.toFixed(1)}°  pitch ${sl.manual.pitch.toFixed(1)}°`,
    `hFov ${c.hFov}° [ ]   lensShiftY ${c.lensShiftY} ; '   minCutoff ${c.minCutoff} - =   beta ${c.beta} 9 0`,
    `dwell: ${sl.dwell.key ?? '–'} ${Math.round(sl.dwell.progress * 100)}%${sl.dwell.empty ? `  back ${sl.dwell.empty.toFixed(1)} s` : ''}`,
    `C calibrate  T pattern  V edge  P save  S static`,
    JSON.stringify(c),
  ];
  return (
    <div className="debug" style={{ top: 'auto', bottom: 8, whiteSpace: 'pre-wrap', maxWidth: 'calc(100vw - 16px)' }}>
      {lines.join('\n')}
    </div>
  );
}

export default function Overlay({ sl, debug }: { sl: Searchlight; debug: boolean }) {
  useSyncExternalStore(sl.subscribe, sl.getVersion);
  useInputs(sl);
  return (
    <>
      {sl.show.edge && <BeamEdge inner={sl.config.beamInner} outer={sl.config.beamOuter} />}
      {debug && <DebugOverlay sl={sl} />}
    </>
  );
}
