export type FocusStamp = { x: number; y: number; size: number; width: number; rotation: number };

// Keep the enlarged name and its caption within the canvas, even at the edge.
export function wallFocus(viewWidth: number, viewHeight: number, stamp?: FocusStamp, caption = '') {
  const baseZoom = Math.min(viewWidth / 1920, viewHeight / 1080);
  if (!stamp) return { x: 0, y: 0, zoom: baseZoom };
  const scale = 2;
  const captionSize = Math.max(stamp.size * 0.45, 6);
  const captionWidth = Math.max(0, ...caption.split('\n').map(line => line.length)) * captionSize * 0.6;
  const rotatedNameWidth = Math.abs(Math.cos(stamp.rotation)) * stamp.width + Math.abs(Math.sin(stamp.rotation)) * stamp.size * 2;
  const contentWidth = Math.max(rotatedNameWidth, captionWidth) * scale;
  const lineCount = caption ? caption.split('\n').length : 0;
  const above = stamp.size * scale;
  const below = (stamp.size * 0.75 + captionSize * 1.25 * lineCount) * scale;
  const contentHeight = above + below;
  const fits = Math.min(Math.max(1, viewWidth - 48) / Math.max(contentWidth, 1), Math.max(1, viewHeight - 48) / Math.max(contentHeight, 1));
  const readable = Math.max(baseZoom, 26 / Math.max(stamp.size * scale, 1));
  return { x: stamp.x, y: stamp.y + (above - below) / 2, zoom: Math.min(baseZoom * 3, readable, fits) };
}
