// What a screen reports to the display registry (POST /display): the names a
// visitor can read on it right now, so a phone scan only has to choose among
// these. Shared by the projection (writer) and the server (store).

export type DisplayStamp = {
  key: string; // shared key, see keys.ts
  text: string; // exactly as lettered on the wall
  font: string; // stampStyle FONTS[].name
  color: string; // stampStyle INK_NAMES
  x: number; // centre, 0–1 across the 1920×1080 wall, from the left
  y: number; // centre, 0–1 down the wall, from the top (like a photo)
  size: number; // letter height as a share of the wall height
  state: 'idle' | 'selected' | 'related';
  subtitle?: string; // e.g. "was here · 1921 · b. 1884", for the phone's confirm screen
};

export type DisplayReport = {
  screen: string;
  view: 'wall' | 'constellation';
  focus: string | null; // key of the selected name, if a constellation is open
  stamps: DisplayStamp[];
};

export type DisplayScreen = DisplayReport & { updatedAt: string };
