import type { StyleSpecification } from 'maplibre-gl';

export const ELEVATION_TILES =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const landscapeStyle: StyleSpecification = {
  version: 8,

  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',

  sources: {
    basemap: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution:
        '<a href="https://openfreemap.org/">OpenFreeMap</a> · ' +
        '<a href="https://openmaptiles.org/">OpenMapTiles</a> · ' +
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    },

    elevation: {
      type: 'raster-dem',
      tiles: [ELEVATION_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
      attribution:
        '<a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
    },

    relief: {
      type: 'raster-dem',
      tiles: [ELEVATION_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
    },

    suriname: {
      type: 'geojson',
      data: '/data/suriname.geojson',
      attribution: 'Boundary: GONINI / SBB',
    },
  },

  layers: [
    {
      id: 'land',
      type: 'background',
      paint: {
        'background-color': '#314b3c',
      },
    },
    {
      id: 'forest',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': '#365340',
        'fill-opacity': 0.65,
      },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'relief',
      paint: {
        'hillshade-exaggeration': 0.6,
        'hillshade-shadow-color': '#10271e',
        'hillshade-highlight-color': '#a9b38d',
        'hillshade-accent-color': '#293e2e',
      },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'water',
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          'river',
          '#598b82',
          '#173e42',
        ],
      },
    },
    {
      id: 'water-edge',
      type: 'line',
      source: 'basemap',
      'source-layer': 'water',
      minzoom: 7,
      paint: {
        'line-color': '#76a298',
        'line-width': 0.6,
        'line-opacity': 0.45,
      },
    },
    {
      id: 'rivers',
      type: 'line',
      source: 'basemap',
      'source-layer': 'waterway',
      filter: ['==', ['get', 'class'], 'river'],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#598b82',
        'line-opacity': 1,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 13, 2],
      },
    },
    {
      id: 'suriname-outline',
      type: 'line',
      source: 'suriname',
      paint: {
        'line-color': '#d6bd8b',
        'line-width': 1.2,
        'line-opacity': 0.8,
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'town-names',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'place',
      minzoom: 6,
      filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-letter-spacing': 0.08,
      },
      paint: {
        'text-color': '#e0d6be',
        'text-halo-color': '#18332b',
        'text-halo-width': 1.5,
      },
    },
  ],
};
