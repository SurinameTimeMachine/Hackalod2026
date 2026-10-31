// Searchlight signals between the phone on the beamer (/tracker), the server
// and the projection. Raw sensor angles only; all maths lives in
// projection/searchlight/.
export type PoseMessage =
  | { type: 'pose'; alpha: number; beta: number; gamma: number; t: number; seq: number }
  | { type: 'pose-zero' }; // "the beamer now points straight at the wall"

// POST /pose bodies: a tracker sends `id` + a PoseMessage; a projection acks.
export type PosePost = (PoseMessage & { id: string }) | { type: 'pose-ack'; seq: number };

// What the tracker gets back on every post.
export type PoseStatus = {
  relayed: boolean; // false: another phone is the active tracker
  projections: number; // projections listening right now
  roundTrip: number | null; // ms, server → projection → server, from the latest ack
};
