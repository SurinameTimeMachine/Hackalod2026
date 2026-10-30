'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import dynamic from 'next/dynamic';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { addPlantations } from '../lib/map-plantations';
import { landscapeStyle } from '../lib/map-style';
import { getHomeView } from '../lib/map-views';
import { isPopularPlace, type PeopleCluster, type PeopleResponse } from '../lib/people-data';
import PeopleSearch, { type PersonSelection } from './PeopleSearch';
import TimeSlider, { type YearRange } from './TimeSlider';

const PlaceWall = dynamic(() => import('./PlaceWall'), { ssr: false });

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
  const [popularOnly, setPopularOnly] = useState(false);
  const popularOnlyRef = useRef(false);
  const [clusters, setClusters] = useState<PeopleCluster[]>([]);
  const [wallPlace, setWallPlace] = useState<PeopleCluster | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PeopleCluster | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<PeopleCluster[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSelection | null>(null);
  const layerRef = useRef<{ select: (ids: string[]) => void; setPopularOnly: (value: boolean) => void; setData: (data: PeopleCluster[]) => void; setConnections: (ids: string[]) => void; hitTest: (point: [number, number]) => PeopleCluster[] } | null>(null);
  const clustersRef = useRef<PeopleCluster[]>([]);
  const allClusters = useRef<PeopleCluster[]>([]);
  const timeRequest = useRef<AbortController | null>(null);
  const [appliedYears, setAppliedYears] = useState<YearRange>(null);
  const [timeKey, setTimeKey] = useState(0);
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
        peopleLayer.setPopularOnly(popularOnlyRef.current);
        allClusters.current = data.clusters;
        clustersRef.current = data.clusters;
        setClusters(data.clusters);
        peopleLayerAdded = true;
        setPeopleStatus('');
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
      const hits = layerRef.current?.hitTest([event.point.x, event.point.y]) ?? [];
      if (hits.length === 1) {
        const place = hits[0];
        layerRef.current?.select([place.id]);
        updateSelectionIndicators(map, [place]);
        setNearbyPlaces([]);
        setSelectedPerson(null);
        setSelectedPlace(place);
        layerRef.current?.setConnections([]);
      } else if (hits.length > 1) {
        setNearbyPlaces(hits);
      }
    });

    map.once('idle', () => setStatus(''));

    map.on('error', (event) => {
      console.error(event.error);
      setStatus('Some map data could not load. Check your connection.');
    });

    return () => {
      controller.abort();
      timeRequest.current?.abort();
      allClusters.current = [];
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

  function updatePopularOnly(value: boolean) {
    popularOnlyRef.current = value;
    setPopularOnly(value);
    layerRef.current?.setPopularOnly(value);
  }

  function togglePopularOnly() {
    clearSelection();
    updatePopularOnly(!popularOnlyRef.current);
  }

  function showPlace(place: PeopleCluster) {
    setNearbyPlaces([]);
    if (popularOnlyRef.current && !isPopularPlace(place)) updatePopularOnly(false);
    setSelectedPerson(null);
    setSelectedPlace(place);
    layerRef.current?.select([place.id]);
    const map = mapRef.current;
    if (map) updateSelectionIndicators(map, [place]);
    layerRef.current?.setConnections([]);
    map?.flyTo({ center: place.center, zoom: Math.max(map.getZoom(), 13), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
  }

  function showPerson(selection: PersonSelection) {
    setSelectedPlace(null);
    setSelectedPerson(selection);
    const year = selection.person.event_year;
    const inRange = !appliedYears || (year !== null && year >= appliedYears[0] && year <= appliedYears[1]);
    const selected = inRange ? clusters.filter(c => selection.ids.includes(c.id)) : [];
    if (popularOnlyRef.current && selected.some(c => !isPopularPlace(c))) updatePopularOnly(false);
    layerRef.current?.select(selected.map(p => p.id));
    const map = mapRef.current;
    if (!map) return;
    updateSelectionIndicators(map, selected);
    layerRef.current?.setConnections(selected.map(place => place.id));
    if (selected.length === 1) map.flyTo({ center: selected[0].center, zoom: Math.max(map.getZoom(), 12), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    if (selected.length > 1) {
      const bounds = selected.reduce((b, place) => b.extend(place.center), new maplibregl.LngLatBounds(selected[0].center, selected[0].center));
      map.fitBounds(bounds, { padding: 100, maxZoom: 13, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    }
  }

  function clearSelection() {
    setSelectedPlace(null); setSelectedPerson(null); setNearbyPlaces([]);
    layerRef.current?.select([]);
    if (mapRef.current) updateSelectionIndicators(mapRef.current, []);
    layerRef.current?.setConnections([]);
  }

  async function applyTime(range: YearRange) {
    timeRequest.current?.abort();
    const controller = new AbortController();
    timeRequest.current = controller;
    try {
      let data = allClusters.current;
      if (range) {
        const response = await fetch(`/api/people-clusters?from=${range[0]}&to=${range[1]}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]) });
        if (!response.ok) throw new Error('Could not load the selected years');
        data = ((await response.json()) as PeopleResponse).clusters;
      }
      if (controller.signal.aborted || !layerRef.current) return false;
      clearSelection();
      layerRef.current.setData(data);
      clustersRef.current = data;
      setClusters(data);
      setAppliedYears(range);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) console.error('Time selection:', error);
      return false;
    }
  }

  function resetView() {
    timeRequest.current?.abort();
    if (allClusters.current.length) {
      clustersRef.current = allClusters.current;
      setClusters(allClusters.current);
      layerRef.current?.setData(allClusters.current);
    }
    setAppliedYears(null);
    setTimeKey(value => value + 1);
    clearSelection();
    updatePopularOnly(false);
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

      <div className="map-toolbar">
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

      <button type="button" className="popular-toggle" aria-pressed={popularOnly} onClick={togglePopularOnly}>
        Popular places <span>over 50,000</span>
      </button>
      </div>

      <PeopleSearch clusters={clusters} onPlace={showPlace} onPerson={showPerson} />
      <div className="map-panel-stack">
      {status && <div className="map-status" role="status">{status}</div>}
      {peopleStatus && <div className="people-status" role="status">
        <p>{peopleStatus}</p>
        {peopleFailed && <button type="button" onClick={() => retryPeople.current?.()}>Retry people</button>}
      </div>}
      <TimeSlider key={timeKey} onApply={applyTime} />
      {nearbyPlaces.length > 0 && <section className="nearby-places" aria-label="Choose a place">
        <div className="search-results-heading"><strong>Choose a place</strong><button type="button" onClick={() => setNearbyPlaces([])}>Close</button></div>
        {nearbyPlaces.length > 30 && <button type="button" className="nearby-place" onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const bounds = nearbyPlaces.reduce((b, place) => b.extend(place.center), new maplibregl.LngLatBounds(nearbyPlaces[0].center, nearbyPlaces[0].center));
          map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000 });
          setNearbyPlaces([]);
        }}>Zoom in to see more places</button>}
        {nearbyPlaces.slice(0, 30).map(place => <button type="button" className="nearby-place" key={place.id} onClick={() => showPlace(place)}>{place.label} <small>{place.person_count.toLocaleString()}</small></button>)}
      </section>}
      {(selectedPlace || selectedPerson) && <section className="selection-panel" aria-label="Selection">
        <button type="button" onClick={clearSelection} aria-label="Close selection">Close</button>
        {selectedPlace && <><h2>{selectedPlace.label}</h2><p>{selectedPlace.person_count.toLocaleString()} person records · {appliedYears ? `${appliedYears[0]} – ${appliedYears[1]}` : 'All dates'}</p><button type="button" className="open-wall" disabled={selectedPlace.person_count === 0} onClick={() => setWallPlace(selectedPlace)}>Open wall of names</button></>}
        {selectedPerson && <><h2>{selectedPerson.person.full_name || 'Unnamed person'}</h2><p>Record {selectedPerson.person.person_id} · {selectedPerson.person.source_dataset}{selectedPerson.person.event_year ? ` · ${selectedPerson.person.event_year}` : ''}</p>{selectedPerson.limited && <p>Some links may be missing because the API limits results.</p>}</>}
      </section>}

      </div>
      {wallPlace && <PlaceWall place={wallPlace} years={appliedYears} onClose={() => setWallPlace(null)} />}

    </main>
  );
}
