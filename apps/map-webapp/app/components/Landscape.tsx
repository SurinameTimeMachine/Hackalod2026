'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { addPlantations } from '../lib/map-plantations';
import { landscapeStyle } from '../lib/map-style';
import { getHomeView } from '../lib/map-views';
import type { PeopleCluster, PeopleResponse } from '../lib/people-data';
import PeopleSearch, { type PersonSelection } from './PeopleSearch';

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
  const [peopleStatus, setPeopleStatus] = useState('Loading people…');
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [clusters, setClusters] = useState<PeopleCluster[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PeopleCluster | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonSelection | null>(null);
  const layerRef = useRef<{ select: (ids: string[]) => void } | null>(null);
  const clustersRef = useRef<PeopleCluster[]>([]);
  const retryPeople = useRef<(() => void) | null>(null);

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
    const controller = new AbortController();
    let loadingPeople = false;
    let peopleLayerAdded = false;
    async function loadPeople() {
      if (loadingPeople || peopleLayerAdded) return;
      loadingPeople = true;
      setPeopleFailed(false);
      setPeopleStatus('Loading people…');
      try {
        const [response, { createPeopleLayer }] = await Promise.all([
          fetch('/api/people-clusters', {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(100000),
            ]),
          }),
          import('../lib/map-people'),
        ]);
        if (!response.ok) throw new Error(`People API HTTP ${response.status}`);
        const data: PeopleResponse = await response.json();
        if (controller.signal.aborted) return;
        const peopleLayer = createPeopleLayer(data.clusters);
        map.addLayer(peopleLayer.layer);
        layerRef.current = peopleLayer;
        clustersRef.current = data.clusters;
        setClusters(data.clusters);
        peopleLayerAdded = true;
        setPeopleStatus(
          data.clusters.length
            ? `All dates · ${data.clusters.length.toLocaleString()} places · spheres show person records, not simultaneous residents${data.omitted ? ` · ${data.omitted} places could not be positioned` : ''}`
            : 'No geolocated person records available.',
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('People layer:', error);
        setPeopleStatus(
          'People could not load. You can still explore the landscape.',
        );
        setPeopleFailed(true);
      } finally {
        loadingPeople = false;
      }
    }
    retryPeople.current = () => {
      void loadPeople();
    };

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right',
    );

    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      map.addSource('selection-indicators', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'selection-indicators', type: 'circle', source: 'selection-indicators', paint: {
        'circle-radius': 15, 'circle-color': '#ffe28a', 'circle-opacity': 0.08,
        'circle-stroke-color': '#fff1b6', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.95,
      } });
      map.setTerrain({
        source: 'elevation',
        exaggeration: 2.4,
      });

      addPlantations(map);
      void loadPeople();
    });

    map.on('click', (event) => {
      let closest: PeopleCluster | null = null;
      let distance = 24;
      for (const cluster of clustersRef.current) {
        const point = map.project(cluster.center);
        const d = Math.hypot(point.x - event.point.x, point.y - event.point.y);
        if (d < distance) { closest = cluster; distance = d; }
      }
      if (closest) {
        layerRef.current?.select([closest.id]);
        updateSelectionIndicators(map, [closest]);
        setSelectedPerson(null);
        setSelectedPlace(closest);
        if (map.getLayer('person-connections')) map.setLayoutProperty('person-connections', 'visibility', 'none');
      }
    });

    map.once('idle', () => setStatus(''));

    map.on('error', (event) => {
      console.error(event.error);
      setStatus('Some map data could not load. Check your connection.');
    });

    return () => {
      controller.abort();
      retryPeople.current = null;
      layerRef.current = null;
      clustersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function updateSelectionIndicators(map: maplibregl.Map, places: PeopleCluster[]) {
    const source = map.getSource('selection-indicators') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: places.map(place => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: place.center } })) });
  }

  function showPlace(place: PeopleCluster) {
    setSelectedPerson(null);
    setSelectedPlace(place);
    layerRef.current?.select([place.id]);
    const map = mapRef.current;
    if (map) updateSelectionIndicators(map, [place]);
    if (map?.getLayer('person-connections')) map.setLayoutProperty('person-connections', 'visibility', 'none');
    map?.flyTo({ center: place.center, zoom: Math.max(map.getZoom(), 13), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
  }

  function showPerson(selection: PersonSelection) {
    setSelectedPlace(null);
    setSelectedPerson(selection);
    const selected = clusters.filter(c => selection.ids.includes(c.id));
    layerRef.current?.select(selected.map(p => p.id));
    const map = mapRef.current;
    if (!map) return;
    updateSelectionIndicators(map, selected);
    // Straight lines are visual associations, not reconstructed routes.
    const data = { type: 'FeatureCollection' as const, features: selected.slice(1).map(place => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [selected[0].center, place.center] } })) };
    const source = map.getSource('person-connections') as maplibregl.GeoJSONSource | undefined;
    if (source) { source.setData(data); map.setLayoutProperty('person-connections', 'visibility', 'visible'); }
    else {
      map.addSource('person-connections', { type: 'geojson', data });
      map.addLayer({ id: 'person-connections', type: 'line', source: 'person-connections', paint: { 'line-color': '#ffe497', 'line-width': 2, 'line-opacity': 0.85, 'line-blur': 1 } });
    }
    if (selected.length === 1) map.flyTo({ center: selected[0].center, zoom: Math.max(map.getZoom(), 12), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    if (selected.length > 1) {
      const bounds = selected.reduce((b, place) => b.extend(place.center), new maplibregl.LngLatBounds(selected[0].center, selected[0].center));
      map.fitBounds(bounds, { padding: 100, maxZoom: 13, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    }
  }

  function clearSelection() {
    setSelectedPlace(null); setSelectedPerson(null);
    layerRef.current?.select([]);
    if (mapRef.current) updateSelectionIndicators(mapRef.current, []);
    if (mapRef.current?.getLayer('person-connections')) mapRef.current.setLayoutProperty('person-connections', 'visibility', 'none');
  }

  function resetView() {
    clearSelection();
    mapRef.current?.flyTo({
      ...getHomeView(window.innerWidth < 768),
      duration: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

      <PeopleSearch clusters={clusters} onPlace={showPlace} onPerson={showPerson} />
      {(selectedPlace || selectedPerson) && <section className="selection-panel" aria-label="Selection">
        <button type="button" onClick={clearSelection} aria-label="Close selection">Close</button>
        {selectedPlace && <><h2>{selectedPlace.label}</h2><p>{selectedPlace.person_count.toLocaleString()} person records associated with this place across all dates.</p><p>The wall of names is coming later.</p></>}
        {selectedPerson && <><h2>{selectedPerson.person.full_name || 'Unnamed person'}</h2><p>Record {selectedPerson.person.person_id} · {selectedPerson.person.source_dataset}{selectedPerson.person.event_year ? ` · ${selectedPerson.person.event_year}` : ''}</p><p>{clusters.filter(c => selectedPerson.ids.includes(c.id)).length} mapped places linked to this record. Lines connect recorded places; they do not show a travel route.</p>{selectedPerson.limited && <p>Some links may be missing because the API limits results.</p>}</>}
      </section>}

      <div className="people-status" role="status">
        <p>{peopleStatus}</p>
        {peopleFailed && (
          <button type="button" onClick={() => retryPeople.current?.()}>
            Retry people
          </button>
        )}
      </div>

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
