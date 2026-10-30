'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { addPlantations } from '../lib/map-plantations';
import { landscapeStyle } from '../lib/map-style';
import { getHomeView } from '../lib/map-views';

maplibregl.setWorkerUrl(
  new URL(
    'maplibre-gl/dist/maplibre-gl-worker.mjs',
    import.meta.url,
  ).toString(),
);

export default function Landscape() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState('Loading landscape…');

  useEffect(() => {
    if (!container.current) return;

    const mobile = window.innerWidth < 768;

    const map = new maplibregl.Map({
      container: container.current,
      style: landscapeStyle,
      ...getHomeView(mobile),
      minZoom: 5,
      maxZoom: 16,
      maxPitch: 65,
      maxBounds: [
        [-60, 0],
        [-51, 9],
      ],
      renderWorldCopies: false,
      pixelRatio: Math.min(window.devicePixelRatio, 1.5),
      hash: 'view',
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

      addPlantations(map);
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
      ...getHomeView(window.innerWidth < 768),
      duration:
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 1200
          : 0,
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

      <button
        type="button"
        className="map-home"
        onClick={resetView}
        aria-label="Home: reset map view"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" />
        </svg>
        Home
      </button>

      {status && (
        <p
          role="status"
          style={{
            position: 'absolute',
            top: 'calc(80px + env(safe-area-inset-top, 0px))',
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
