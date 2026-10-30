import { Vector2 } from 'three';

export type Coordinate = [number, number];

export const LAND_HEIGHT = 0.08;

const CENTER_LONGITUDE = -56.19;
const CENTER_LATITUDE = 3.75;
const SCALE = 2;

export function project([longitude, latitude]: Coordinate) {
  const correction = Math.cos((CENTER_LATITUDE * Math.PI) / 180);

  return new Vector2(
    (longitude - CENTER_LONGITUDE) * correction * SCALE,
    (latitude - CENTER_LATITUDE) * SCALE,
  );
}

export function toWorld(
  coordinate: Coordinate,
  height = 0,
): [number, number, number] {
  const point = project(coordinate);

  return [point.x, height, -point.y];
}
