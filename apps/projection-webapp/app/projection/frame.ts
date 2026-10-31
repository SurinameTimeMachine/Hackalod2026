// Where an open constellation lives: its centre on the wall and how much
// larger than the 1920×1080 wall it is drawn. On the plain projection that is
// the wall itself; a larger wall (searchlight) opens trees where the beam is.
import { createContext } from 'react';

export type Frame = { x: number; y: number; scale: number };

export const WALL_FRAME: Frame = { x: 0, y: 0, scale: 1 };
export const FrameContext = createContext<Frame>(WALL_FRAME);

// A name that is being pointed at brightens; `amount` runs 0..1. Shared by
// every stamp, read once per frame, so pointing never re-renders the wall.
export type Emphasis = { key: string | null; amount: number };
