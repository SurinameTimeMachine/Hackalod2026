// Over the canvas: the soft round beam edge and the debug overlay. Also owns
// the searchlight's inputs (tracker stream, calibration keys, arrow keys)
// while it is mounted. The mouse only clicks names, as on the plain wall.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SearchlightConfig } from './config';
import type { Searchlight } from './state';

const round = (v: number, step: number) => Math.round(v / step) * step;
const FULL_BEAM = 250; // % of half the height: past the corners of a 16:9 image

// Field of view and lens offset, by physical key so Shift (×10, for a
// short-throw beamer far from the default) does not change which key it is.
const COARSE: Record<string, (c: SearchlightConfig, n: number) => Partial<SearchlightConfig>> = {
  BracketLeft: (c, n) => ({ hFov: round(Math.max(c.hFov - 0.5 * n, 5), 0.5) }),
  BracketRight: (c, n) => ({ hFov: round(Math.min(c.hFov + 0.5 * n, 150), 0.5) }),
  Semicolon: (c, n) => ({ lensShiftY: round(c.lensShiftY - 0.02 * n, 0.01) }),
  Quote: (c, n) => ({ lensShiftY: round(c.lensShiftY + 0.02 * n, 0.01) }),
};

// The filter keys: key → change, from the current config.
const KEYS: Record<string, (c: SearchlightConfig) => Partial<SearchlightConfig>> = {
  '-': (c) => ({ minCutoff: round(Math.max(c.minCutoff - 0.1, 0.05), 0.05) }),
  '=': (c) => ({ minCutoff: round(c.minCutoff + 0.1, 0.05) }),
  '9': (c) => ({ beta: round(Math.max(c.beta - 0.05, 0), 0.01) }),
  '0': (c) => ({ beta: round(c.beta + 0.05, 0.01) }),
  '7': (c) => ({ predictMs: Math.max(c.predictMs - 10, 0) }),
  '8': (c) => ({ predictMs: Math.min(c.predictMs + 10, 500) }),
};

function useInputs(sl: Searchlight, note: (text: string) => void) {
  useEffect(() => sl.connect(), [sl]);

  useEffect(() => {
    sl.setSim(new URLSearchParams(window.location.search).get('sim') === '1');
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = sl.config;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (COARSE[e.code]) sl.adjust(COARSE[e.code](c, e.shiftKey ? 10 : 1));
      else if (KEYS[k]) sl.adjust(KEYS[k](c));
      else if (k === 'c') sl.calibrate();
      else if (k === 'o') sl.turnMount();
      else if (k === 'f') note(sl.fit(window.innerWidth / window.innerHeight));
      else if (k === ',') sl.adjust({ beamRadius: Math.max(c.beamRadius - 5, 10) });
      else if (k === '.') sl.adjust({ beamRadius: Math.min(c.beamRadius + 5, 250) });
      else if (k === 'n') sl.adjust({ wallScale: round(Math.max(c.wallScale - 0.25, 0.5), 0.25) });
      else if (k === 'm') sl.adjust({ wallScale: round(Math.min(c.wallScale + 0.25, 4), 0.25) });
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sl, note]);
}

// A round beam with a hard edge (a soft one blurs away on a modest beamer).
// Only darkens, so black stays black.
function BeamEdge({ radius }: { radius: number }) {
  // Animates when it opens up for a tree and closes again.
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${radius}vh`,
          height: `${radius}vh`,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          boxShadow: '0 0 0 200vmax #000',
          transition: 'width 0.8s ease, height 0.8s ease',
        }}
      />
    </div>
  );
}

// The middle of the image, for F: turn until it sits on the tape. Fixed to
// the image, not the wall, so only shown with the test grid.
function Crosshair() {
  const arm = { position: 'fixed', background: '#ff5a3c', pointerEvents: 'none' } as const;
  return (
    <>
      <div style={{ ...arm, left: 'calc(50% - 30px)', top: 'calc(50% - 1px)', width: 60, height: 2 }} />
      <div style={{ ...arm, left: 'calc(50% - 1px)', top: 'calc(50% - 30px)', width: 2, height: 60 }} />
    </>
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
    `tracker: ${sl.lastPoseAt ? (lost ? 'LOST (frozen)' : `${Math.round(sl.poseRate)} Hz, age ${Math.round(age!)} ms, delay ~${Math.round(sl.poseDelay ?? 0)} ms`) : 'none yet'}`,
    `yaw ${sl.aim.yaw.toFixed(1)}°  pitch ${sl.aim.pitch.toFixed(1)}°  roll ${sl.aim.roll.toFixed(1)}°  speed ${sl.aim.speed.toFixed(0)}°/s`,
    `manual yaw ${sl.manual.yaw.toFixed(1)}°  pitch ${sl.manual.pitch.toFixed(1)}°   phone roll ${sl.trackerRoll.toFixed(1)}° (tilting should not change it: else O, now ${c.mountYaw}°)`,
    `hFov ${c.hFov}° [ ] (Shift ×10)   lensShiftY ${c.lensShiftY} ; '   minCutoff ${c.minCutoff} - =   beta ${c.beta} 9 0   predict ${c.predictMs} ms 7 8`,
    `beam at x ${Math.round(sl.beam.x)}  y ${Math.round(sl.beam.y)}   radius ${c.beamRadius}% , .   names ×${c.wallScale} n m`,
    `C calibrate  T pattern  F fit to tape  V beam  , . beam size  n m name size  P save  S static`,
    JSON.stringify(c),
  ];
  return (
    <div className="debug" style={{ top: 'auto', bottom: 8, whiteSpace: 'pre-wrap', maxWidth: 'calc(100vw - 16px)' }}>
      {lines.join('\n')}
    </div>
  );
}

// `open`: a tree is open, and the beam opens up to the whole image to show it.
export default function Overlay({ sl, debug, open }: { sl: Searchlight; debug: boolean; open: boolean }) {
  useSyncExternalStore(sl.subscribe, sl.getVersion);
  // What F found, shown for a few seconds (it is projected).
  const [fitNote, setFitNote] = useState<string | null>(null);
  useEffect(() => {
    if (!fitNote) return;
    const t = setTimeout(() => setFitNote(null), 4000);
    return () => clearTimeout(t);
  }, [fitNote]);
  useInputs(sl, setFitNote);
  return (
    <>
      {sl.show.edge && <BeamEdge radius={open ? FULL_BEAM : sl.config.beamRadius} />}
      {sl.show.pattern && <Crosshair />}
      {fitNote && <div className="offline" style={{ color: '#e6dcc6', fontSize: 16 }}>{fitNote}</div>}
      {debug && <DebugOverlay sl={sl} />}
    </>
  );
}
