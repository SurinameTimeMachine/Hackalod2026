'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

maplibregl.setWorkerUrl(
  new URL(
    'maplibre-gl/dist/maplibre-gl-worker.mjs',
    import.meta.url,
  ).toString(),
);

const ELEVATION_TILES =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const style: maplibregl.StyleSpecification = {
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

export default function Landscape() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState('Loading landscape…');

  useEffect(() => {
    if (!container.current) return;

    const mobile = window.innerWidth < 768;

    const map = new maplibregl.Map({
      container: container.current,
      style,
      center: [-55.9, 4.4],
      zoom: mobile ? 6.2 : 6.7,
      pitch: 53,
      bearing: -15,
      minZoom: 5,
      maxZoom: 16,
      maxPitch: 65,
      maxBounds: [
        [-60, 0],
        [-51, 9],
      ],
      renderWorldCopies: false,
      pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right',
    );

    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      map.setTerrain({
        source: 'elevation',
        exaggeration: 2.4,
      });

      map.addControl(
        new maplibregl.TerrainControl({
          source: 'elevation',
          exaggeration: 2.4,
        }),
        'top-right',
      );

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

      const popup = new maplibregl.Popup();

      map.on('click', 'plantation-fill', (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const name = String(feature.properties?.name ?? 'Unnamed plantation');

        popup
          .setLngLat(event.lngLat)
          .setText(`${name} — depicted on the 1930 map.`)
          .addTo(map);
      });

      map.on('mouseenter', 'plantation-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'plantation-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    map.once('idle', () => setStatus(''));

    map.on('error', (event) => {
      console.error(event.error);
      setStatus('Some map data could not load. Check your connection.');
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function resetView() {
    mapRef.current?.flyTo({
      center: [-55.9, 4.4],
      zoom: window.innerWidth < 768 ? 6.2 : 6.7,
      pitch: 53,
      bearing: -15,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 1200,
    });
  }

  return (
    <main
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        background: '#101f20',
      }}
    >
      <div
        ref={container}
        aria-label="Suriname landscape"
        style={{ position: 'absolute', inset: 0 }}
      />

      <div className="map-actions">
        <button onClick={resetView}>Suriname</button>

        <button
          onClick={() =>
            mapRef.current?.flyTo({
              center: [-55.18, 4.94],
              zoom: 11,
              pitch: 65,
              bearing: -25,
              duration: 0,
            })
          }
        >
          Terrain
        </button>

        <button
          onClick={() =>
            mapRef.current?.flyTo({
              center: [-55.02, 5.83],
              zoom: 10.5,
              pitch: 50,
              bearing: -20,
              duration: 0,
            })
          }
        >
          Plantations
        </button>
      </div>

      {status && (
        <p
          role="status"
          style={{
            position: 'absolute',
            top: 68,
            left: 16,
            right: 60,
            color: '#eee8d9',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          {status}
        </p>
      )}
    </main>
  );
}
