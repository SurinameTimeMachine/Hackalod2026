// Every searchlight tunable in one place. The committed defaults below are a
// starting point; on site they are adjusted live with keys, kept in
// localStorage, and printed with P so they can be copied back in here.
import { WALL, type Bounds } from '../wallLayout';

export type SearchlightConfig = {
  hFov: number; // degrees, measured: 2·atan(W / 2d)
  lensShiftY: number; // fraction of the image height the image sits above the lens axis
  wallBeams: { x: number; y: number }; // virtual wall size, in beams
  ignoreRoll: boolean;
  invertYaw: boolean;
  invertPitch: boolean;
  minCutoff: number; // One Euro filter, Hz
  beta: number; // One Euro filter: how fast the cutoff opens up with speed
  dCutoff: number; // Hz, for the speed estimate
  predictMs: number; // extrapolate by this much (0 = off)
  beamEdge: boolean;
  beamInner: number; // % of the half-diagonal where the round edge starts to darken
  beamOuter: number; // % where it is black (smaller: a smaller searchlight)
  trackerLost: number; // ms without poses before the last one is frozen
  keyStep: number; // degrees per arrow key
};

export const DEFAULTS: SearchlightConfig = {
  hFov: 36.9, // W = 2.0 m at d = 3.0 m
  lensShiftY: 0,
  wallBeams: { x: 3, y: 2 },
  ignoreRoll: true,
  invertYaw: false,
  invertPitch: false,
  minCutoff: 1.0,
  beta: 0.02,
  dCutoff: 1.0,
  predictMs: 0,
  beamEdge: true,
  beamInner: 55,
  beamOuter: 80,
  trackerLost: 2000,
  keyStep: 1,
};

const STORE = 'searchlight-config';

export function loadConfig(): SearchlightConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved, wallBeams: { ...DEFAULTS.wallBeams, ...saved.wallBeams } };
  } catch {}
  return { ...DEFAULTS, wallBeams: { ...DEFAULTS.wallBeams } };
}

export function saveConfig(c: SearchlightConfig) {
  try {
    localStorage.setItem(STORE, JSON.stringify(c));
  } catch {}
  console.log('searchlightConfig', JSON.stringify(c, null, 2));
}

// One beam is the 1920×1080 wall of the plain projection; the virtual wall
// is `wallBeams` of them. Names are laid out over all of it.
export const BEAM = { width: WALL.width, height: WALL.height };

// The test grid's calibration targets sit a quarter beam from the centre:
// at zero they are always inside the image, whatever the field of view.
export const TARGET = { x: BEAM.width / 4, y: BEAM.height / 4 };

export const wallBounds = (c: SearchlightConfig): Bounds => ({
  width: c.wallBeams.x * BEAM.width,
  height: c.wallBeams.y * BEAM.height,
  margin: WALL.margin,
});
