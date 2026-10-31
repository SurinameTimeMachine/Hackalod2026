// Fonts, ink palette and seeded per-stamp variation. Everything is
// deterministic per patient_id so a stamp looks the same on every load.

export type StampFont = { name: string; url: string; weight: number; scale: number };

// weight = relative share on the wall; hand-lettered kept rare (≤15 %).
// scale evens out the optical size between faces.
export const FONTS: StampFont[] = [
  { name: 'stardos-stencil', url: '/fonts/stardos-stencil.woff', weight: 3, scale: 1.0 },
  { name: 'saira-stencil-one', url: '/fonts/saira-stencil-one.woff', weight: 3, scale: 0.92 },
  { name: 'special-elite', url: '/fonts/special-elite.woff', weight: 3, scale: 1.0 },
  { name: 'courier-prime', url: '/fonts/courier-prime.woff', weight: 2, scale: 1.0 },
  { name: 'alfa-slab-one', url: '/fonts/alfa-slab-one.woff', weight: 2, scale: 0.88 },
  { name: 'im-fell-english', url: '/fonts/im-fell-english.woff', weight: 2, scale: 1.08 },
  { name: 'old-standard-tt', url: '/fonts/old-standard-tt.woff', weight: 2, scale: 1.02 },
  { name: 'caveat', url: '/fonts/caveat.woff', weight: 2, scale: 1.2 },
];

// Small explanatory text under a lit name: plain typewriter, for legibility.
export const CAPTION_FONT = '/fonts/courier-prime.woff';

export const INKS = [
  '#e6dcc6', // bone
  '#c25a4e', // faded red
  '#c9a24a', // ochre
  '#7f93ad', // slate blue
  '#8c9c68', // dull green
  '#a58ab0', // faded violet
];

// Names for the inks, as reported to the display registry and the phone.
export const INK_NAMES = ['bone', 'red', 'ochre', 'slate', 'green', 'violet'];

// People only a visitor's story knows (told relatives, the storyteller): all
// in handwriting and one ink, so they read as told, not archived.
export const TOLD_COMBO = { font: FONTS.findIndex((f) => f.name === 'caveat'), ink: 0 };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT_BAG = FONTS.flatMap((f, i) => Array(f.weight).fill(i) as number[]);

export type Combo = { font: number; ink: number };

// Preferred font/ink for a patient, then fallbacks in a fixed order, so
// layout can skip combinations a neighbour already uses.
export function comboCandidates(patientId: number): Combo[] {
  const r = rng(patientId * 7919);
  const font = FONT_BAG[Math.floor(r() * FONT_BAG.length)];
  const ink = Math.floor(r() * INKS.length);
  const out: Combo[] = [{ font, ink }];
  for (let i = 1; i < INKS.length; i++) out.push({ font, ink: (ink + i) % INKS.length });
  for (let j = 1; j < FONTS.length; j++)
    for (let i = 0; i < INKS.length; i++)
      out.push({ font: (font + j) % FONTS.length, ink: (ink + i) % INKS.length });
  return out;
}

export function variation(patientId: number) {
  const r = rng(patientId * 104729 + 13);
  return {
    rotation: ((r() * 2 - 1) * 3 * Math.PI) / 180, // ±3°
    opacity: 0.7 + r() * 0.3,
    scale: 0.92 + r() * 0.16, // ±8 %
  };
}
