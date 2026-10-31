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
    'historical-region': {
      type: 'raster',
      tiles: ['https://allmaps.xyz/{z}/{x}/{y}.png?url=https%3A%2F%2Fannotations.allmaps.org%2Fmanifests%2F5178b46e14dc211e'],
      tileSize: 256,
      bounds: [-58.4486, 3.9638, -53.6423, 6.576],
      maxzoom: 14,
      attribution: 'Historische kaart van Suriname (1930): Universiteit Leiden · Allmaps',
    },
    'historical-paramaribo': {
      type: 'raster',
      tiles: ['https://allmaps.xyz/{z}/{x}/{y}.png?url=https%3A%2F%2Fannotations.allmaps.org%2Fmaps%2Fa8b80690c8e2e4cb'],
      tileSize: 256,
      bounds: [-55.1867, 5.8048, -55.1364, 5.8555],
      maxzoom: 18,
      attribution: 'Paramaribo 1916–1917: Universiteit van Amsterdam · Allmaps',
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
      id: 'historical-region',
      type: 'raster',
      source: 'historical-region',
      minzoom: 8,
      maxzoom: 15,
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9, 0.35, 12, 0.35, 15, 0],
        'raster-saturation': -1,
      },
    },
    {
      id: 'historical-paramaribo',
      type: 'raster',
      source: 'historical-paramaribo',
      minzoom: 12,
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 0.38, 18, 0.38],
        'raster-saturation': -1,
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
