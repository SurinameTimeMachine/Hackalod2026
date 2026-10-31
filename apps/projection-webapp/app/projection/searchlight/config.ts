// Every searchlight tunable in one place. The committed defaults below are a
// starting point; on site they are adjusted live with keys, kept in
// localStorage, and printed with P so they can be copied back in here.
import { WALL, type Bounds } from '../wallLayout';

export type SearchlightConfig = {
  hFov: number; // degrees, measured: 2·atan(W / 2d)
  lensShiftY: number; // fraction of the image height the image sits above the lens axis
  wallBeams: { x: number; y: number }; // virtual wall shape, in beams
  wallScale: number; // × wallBeams: a larger wall gets larger names (2 = names twice as large)
  ignoreRoll: boolean;
  invertYaw: boolean;
  invertPitch: boolean;
  minCutoff: number; // One Euro filter, Hz
  beta: number; // One Euro filter: how fast the cutoff opens up with speed
  dCutoff: number; // Hz, for the speed estimate
  predictMs: number; // extrapolate the turn by this much, to hide network delay (0 = off)
  beamEdge: boolean;
  beamRadius: number; // round beam, % of half the image height (100: touches top and bottom)
  treeNames: number; // names in an open tree, × their size on the plain projection (the tree fills the projection)
  trackerLost: number; // ms without poses before the last one is frozen
  keyStep: number; // degrees per arrow key
};

export const DEFAULTS: SearchlightConfig = {
  hFov: 36.9, // W = 2.0 m at d = 3.0 m
  lensShiftY: 0,
  wallBeams: { x: 3, y: 2 },
  wallScale: 2,
  ignoreRoll: true,
  invertYaw: false,
  invertPitch: false,
  minCutoff: 1.0, // calm when the beamer stands still…
  beta: 0.3, // …but opens up fast when it turns (deg/s): little lag in motion
  dCutoff: 2.0,
  predictMs: 0,
  beamEdge: true,
  beamRadius: 100,
  treeNames: 2,
  trackerLost: 2000,
  keyStep: 1,
};

const STORE = 'searchlight-config';
// Saves before version 2 carry the old, sluggish filter: keep their
// calibration but not their filter.
const VERSION = 2;
const FILTER = ['minCutoff', 'beta', 'dCutoff', 'predictMs'] as const;

export function loadConfig(): SearchlightConfig {
  try {
    const { v, ...saved } = JSON.parse(localStorage.getItem(STORE) ?? 'null') ?? {};
    if (saved && typeof saved === 'object') {
      if (v !== VERSION) for (const k of FILTER) delete saved[k];
      return { ...DEFAULTS, ...saved, wallBeams: { ...DEFAULTS.wallBeams, ...saved.wallBeams } };
    }
  } catch {}
  return { ...DEFAULTS, wallBeams: { ...DEFAULTS.wallBeams } };
}

export function saveConfig(c: SearchlightConfig) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...c, v: VERSION }));
  } catch {}
  console.log('searchlightConfig', JSON.stringify(c, null, 2));
}

// One beam is the 1920×1080 wall of the plain projection; the virtual wall
// is `wallBeams × wallScale` of them. Names are laid out over all of it, so
// their size grows with `wallScale`.
export const BEAM = { width: WALL.width, height: WALL.height };

// The test grid's calibration targets sit a quarter beam from the centre:
// at zero they are always inside the image, whatever the field of view.
export const TARGET = { x: BEAM.width / 4, y: BEAM.height / 4 };

export const wallBounds = (c: SearchlightConfig): Bounds => ({
  width: c.wallBeams.x * c.wallScale * BEAM.width,
  height: c.wallBeams.y * c.wallScale * BEAM.height,
  margin: WALL.margin,
});
