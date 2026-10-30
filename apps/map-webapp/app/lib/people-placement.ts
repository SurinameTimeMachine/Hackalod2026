import type { PeopleCluster, PeoplePlace } from './people-data';

type Point = [number, number];
export type PolygonGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};
const CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
function project([lng, lat]: number[]): Point {
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2];
}
function unproject([x, y]: Point): Point {
  return [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
}
function ringArea(ring: Point[]) {
  return ring.reduce((a, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
}
function insideRing([x, y]: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inside(point: Point, rings: Point[][]) {
  return insideRing(point, rings[0]) && !rings.slice(1).some(r => insideRing(point, r));
}
function clearance(point: Point, rings: Point[][]) {
  let distance = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return distance;
}

// Area centroid when inside; for concave polygons/holes, choose an interior
// scanline midpoint. All rings constrain radius, including holes.
export function interiorFootprint(geometry: PolygonGeometry) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][];
  const candidates = polygons.map(p => p.map(r => r.map(project)))
    .filter(p => p[0]?.length >= 4)
    .sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
  const rings = candidates[0];
  if (!rings) return null;
  // Shift origin before computing areas to avoid cancellation on tiny parcels.
  const origin = rings[0][0];
  const local = rings.map(r => r.map(p => [p[0] - origin[0], p[1] - origin[1]] as Point));
  const outer = local[0], area = ringArea(outer);
  if (Math.abs(area) < 1e-20) return null;
  const centroid: Point = [0, 0];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    centroid[0] += (a[0] + b[0]) * cross / (6 * area);
    centroid[1] += (a[1] + b[1]) * cross / (6 * area);
  }
  let center = centroid;
  if (!inside(center, local)) {
    let best = 0;
    const ys = [...new Set(local.flat().map(p => p[1]))].sort((a, b) => a - b);
    for (let k = 1; k < ys.length; k++) {
      const y = (ys[k - 1] + ys[k]) / 2;
      const xs: number[] = [];
      for (const ring of local) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        const point: Point = [(xs[i - 1] + xs[i]) / 2, y];
        if (!inside(point, local)) continue;
        const d = clearance(point, local);
        if (d > best) { best = d; center = point; }
      }
    }
    if (!best) return null;
  }
  const lngLat = unproject([center[0] + origin[0], center[1] + origin[1]]);
  const radiusMeters = clearance(center, local) * CIRCUMFERENCE * Math.cos(lngLat[1] * Math.PI / 180) * 0.85;
  return { center: lngLat, radiusMeters };
}

export function placeCluster(place: PeoplePlace, geometry?: PolygonGeometry): PeopleCluster | null {
  const footprint = geometry ? interiorFootprint(geometry) : null;
  if (geometry && !footprint) return null; // Do not invent placement for unusable polygons.
  // Logarithmic scaling distinguishes counts within a bounded physical footprint.
  const limit = Math.min(footprint?.radiusMeters ?? Infinity, place.type === 'historical-address' ? 8 : 150);
  const minimum = Math.min(place.type === 'historical-address' ? 2 : 12, limit);
  const fraction = Math.min(1, Math.log1p(place.person_count) / Math.log1p(1_000_000));
  const radius = minimum + (limit - minimum) * fraction;
  return {
    ...place,
    center: footprint?.center ?? [place.lng, place.lat],
    radiusMeters: radius,
    placement: footprint ? 'plantation-interior' : 'gazetteer-point',
    sizeCapped: place.person_count >= 1_000_000,
  };
}
