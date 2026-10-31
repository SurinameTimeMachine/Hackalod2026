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
      attribution: 'Grens: GONINI / SBB',
    },
  },

  layers: [
    {
      id: 'land',
      type: 'background',
      paint: {
        'background-color': '#f1f0e9',
      },
    },
    {
      id: 'forest',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': '#dfe6d7',
        'fill-opacity': 0.55,
      },
    },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'relief',
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': '#a8b6a5',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#c4cfc0',
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
          '#c2d9db',
          '#d4e4e6',
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
        'line-color': '#9dbdc1',
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
        'line-color': '#a8cbd0',
        'line-opacity': 1,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 13, 2],
      },
    },
    {
      id: 'suriname-outline',
      type: 'line',
      source: 'suriname',
      paint: {
        'line-color': '#907c4d',
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
        'text-color': '#52605c',
        'text-halo-color': '#f6f5ee',
        'text-halo-width': 1.5,
      },
    },
  ],
};
