import type { CameraOptions } from 'maplibre-gl';

export function getHomeView(mobile: boolean): CameraOptions {
  return {
    center: [-55.9, 4.4],
    zoom: mobile ? 6.2 : 6.7,
    pitch: 53,
    bearing: -15,
  };
}
