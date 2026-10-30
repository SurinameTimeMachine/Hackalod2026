import type { Map } from 'maplibre-gl';

export function addPlantations(map: Map) {
  map.addSource('plantations', {
    type: 'geojson',
    data: '/data/plantations-1930.geojson',
    attribution: 'Historical plantation polygons: Suriname Time Machine',
  });

  map.addLayer(
    {
      id: 'plantation-fill',
      type: 'fill',
      source: 'plantations',
      minzoom: 8,
      paint: {
        'fill-color': '#10291f',
        'fill-opacity': 0.06,
      },
    },
    'water',
  );

  map.addLayer(
    {
      id: 'plantation-outline',
      type: 'line',
      source: 'plantations',
      minzoom: 8,
      layout: {
        'line-join': 'round',
      },
      paint: {
        'line-color': '#10291f',
        'line-width': 1.6,
        'line-opacity': 0.5,
        'line-blur': 0.3,
      },
    },
    'water',
  );

  map.addLayer(
    {
      id: 'plantation-engraving-light',
      type: 'line',
      source: 'plantations',
      minzoom: 8,
      layout: {
        'line-join': 'round',
      },
      paint: {
        'line-color': '#a2b39a',
        'line-width': 0.6,
        'line-opacity': 0.3,
        'line-translate': [0, -0.7],
        'line-translate-anchor': 'viewport',
      },
    },
    'water',
  );
}
