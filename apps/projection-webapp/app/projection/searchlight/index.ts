// Searchlight mode (README_Searchlight.md): the phone on the beamer turns
// the camera over a virtual wall larger than the beam. Loaded lazily by
// ProjectionPage only; nothing outside it imports from here.
export { default as Overlay } from './Overlay';
export { default as Scene } from './Scene';
export { Searchlight, type Target } from './state';
