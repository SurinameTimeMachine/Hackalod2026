'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import dynamic from 'next/dynamic';
import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { addPlantations } from '../lib/map-plantations';
import { landscapeStyle } from '../lib/map-style';
import { getHomeView } from '../lib/map-views';
import { isPopularPlace, type PeopleCluster, type PeopleResponse } from '../lib/people-data';
import { specialPlaceForId } from '../lib/special-places';
import PeopleSearch, { type PersonSelection } from './PeopleSearch';
import TimeSlider, { type YearRange } from './TimeSlider';
import './LandscapeTheme.css';

const PlaceWall = dynamic(() => import('./PlaceWall'), { ssr: false });
const HOSPITAL_ID = 'stm-1885-address-0327';

maplibregl.setWorkerUrl(
  new URL(
    'maplibre-gl/dist/maplibre-gl-worker.mjs',
    import.meta.url,
  ).toString(),
);

export default function Landscape() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState('Kaart laden…');
  const [peopleStatus, setPeopleStatus] = useState('Personen laden…');
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [popularOnly, setPopularOnly] = useState(false);
  const popularOnlyRef = useRef(false);
  const [clusters, setClusters] = useState<PeopleCluster[]>([]);
  const [wallPlace, setWallPlace] = useState<PeopleCluster | null>(null);
  const [wallVisible, setWallVisible] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PeopleCluster | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<PeopleCluster[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSelection | null>(null);
  const [wallPatientId, setWallPatientId] = useState<number | undefined>();
  const [walkerIndex, setWalkerIndex] = useState<number | null>(null);
  const [hospitalPeople, setHospitalPeople] = useState<{ patient_id: number; achternaam: string; initialen_of_contractnr: string; geboortejaar: string }[]>([]);
  const [desktop, setDesktop] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const layerRef = useRef<{ select: (ids: string[]) => void; setPopularOnly: (value: boolean) => void; setData: (data: PeopleCluster[]) => void; setConnections: (ids: string[]) => void; setHospitalVisible: (value: boolean) => void; setHospitalFocus: (value: boolean) => void; setHospitalOnly: (value: boolean) => void; pickWalker: (point: [number, number]) => number; clearWalker: () => void; hitTest: (point: [number, number]) => PeopleCluster[] } | null>(null);
  const hospitalVisibleRef = useRef(false);
  const hospitalFocusRef = useRef(false);
  const hospitalOnlyRef = useRef(false);
  const [hospitalMode, setHospitalMode] = useState(false);
  const clustersRef = useRef<PeopleCluster[]>([]);
  const allClusters = useRef<PeopleCluster[]>([]);
  const timeRequest = useRef<AbortController | null>(null);
  const [appliedYears, setAppliedYears] = useState<YearRange>(null);
  const [timeKey, setTimeKey] = useState(0);
  const retryPeople = useRef<(() => void) | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const year = selectedPerson?.person.event_year;
    const personInRange = !appliedYears || (year != null && year >= appliedYears[0] && year <= appliedYears[1]);
    const visible = desktop && (selectedPlace?.id === HOSPITAL_ID ||
      !!(selectedPerson && personInRange && selectedPerson.ids.includes(HOSPITAL_ID) && clusters.some(place => place.id === HOSPITAL_ID)));
    const focused = desktop && selectedPlace?.id === HOSPITAL_ID;
    hospitalVisibleRef.current = visible;
    hospitalFocusRef.current = focused;
    const only = focused && hospitalMode;
    hospitalOnlyRef.current = only;
    layerRef.current?.setHospitalOnly(only);
    layerRef.current?.setHospitalVisible(visible);
    layerRef.current?.setHospitalFocus(focused);
    if (mapRef.current && selectedPlace?.id === HOSPITAL_ID) updateSelectionIndicators(mapRef.current, focused ? [] : [selectedPlace]);
  }, [desktop, hospitalMode, selectedPlace, selectedPerson, appliedYears, clusters]);

  useEffect(() => {
    if (!container.current) return;

    const mobile = window.innerWidth < 768;

    const map = new maplibregl.Map({
      container: container.current,
      style: landscapeStyle,
      ...getHomeView(mobile),
      minZoom: 5,
      maxZoom: 20,
      maxPitch: 65,
      maxBounds: [
        [-60, 0],
        [-51, 9],
      ],
      renderWorldCopies: false,
      attributionControl: false,
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
      setPeopleStatus('Personen laden…');
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
        peopleLayer.setHospitalVisible(hospitalVisibleRef.current);
        peopleLayer.setHospitalFocus(hospitalFocusRef.current);
        peopleLayer.setHospitalOnly(hospitalOnlyRef.current);
        allClusters.current = data.clusters;
        clustersRef.current = data.clusters;
        setClusters(data.clusters);
        peopleLayerAdded = true;
        setPeopleStatus('');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('People layer:', error);
        setPeopleStatus(
          'Personen konden niet worden geladen. Je kunt de kaart blijven bekijken.',
        );
        setPeopleFailed(true);
      } finally {
        loadingPeople = false;
      }
    }
    retryPeople.current = () => {
      void loadPeople();
    };

    const attribution = new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>' });
    map.addControl(attribution, 'bottom-right');
    const attributionElement = map.getContainer().querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
    let attributionTouched = false;
    const rememberAttributionClick = () => { attributionTouched = true; };
    const closeInitialAttribution = () => {
      if (attributionTouched || !attributionElement) return;
      attributionElement.classList.remove('maplibregl-compact-show');
      attributionElement.removeAttribute('open');
    };
    attributionElement?.addEventListener('click', rememberAttributionClick, true);
    map.on('sourcedata', closeInitialAttribution);
    map.on('styledata', closeInitialAttribution);
    closeInitialAttribution();
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      map.addSource('selection-indicators', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'selection-indicators', type: 'circle', source: 'selection-indicators', paint: {
        'circle-radius': 15, 'circle-color': '#ffcf50', 'circle-opacity': 0.08,
        'circle-stroke-color': '#ffcf50', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.95,
      } });
      map.setTerrain({
        source: 'elevation',
        exaggeration: 2.4,
      });

      addPlantations(map);
      void loadPeople();
    });

    map.on('click', (event) => {
      const walker = layerRef.current?.pickWalker([event.point.x, event.point.y]) ?? -1;
      if (walker !== -1) { setWalkerIndex(walker >= 0 ? walker : null); return; }
      const hits = layerRef.current?.hitTest([event.point.x, event.point.y]) ?? [];
      if (hits.length === 1) {
        const place = hits[0];
        layerRef.current?.select([place.id]);
        updateSelectionIndicators(map, [place]);
        setNearbyPlaces([]);
        setSelectedPerson(null);
        setSelectedPlace(place);
        layerRef.current?.setConnections([]);
        if (place.id === HOSPITAL_ID && window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches) {
          map.flyTo({ center: place.center, zoom: Math.max(map.getZoom(), 17.5), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
        }
      } else if (hits.length > 1) {
        setNearbyPlaces(hits);
      }
    });

    map.once('idle', () => setStatus(''));

    map.on('error', (event) => {
      console.error(event.error);
      setStatus('Sommige kaartgegevens konden niet worden geladen. Controleer je verbinding.');
    });

    return () => {
      controller.abort();
      attributionElement?.removeEventListener('click', rememberAttributionClick, true);
      map.off('sourcedata', closeInitialAttribution);
      map.off('styledata', closeInitialAttribution);
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

  // Deep links from the story pages: /?person=<person_id>&name=&year= or /?place=<gazetteer id>&label=&lat=&lng=
  const deepLinkDone = useRef(false);
  const deepLinkPreviewed = useRef<maplibregl.Map | null>(null);
  const deepLinkPreview = useRef<PeopleCluster | null>(null);
  useEffect(() => {
    if (deepLinkDone.current || !mapRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get('place');
    const personId = params.get('person');
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    const pointCluster = placeId && params.get('lat') && params.get('lng') && Number.isFinite(lat) && Number.isFinite(lng)
      ? { id: placeId, uri: null, label: params.get('label') || placeId, type: 'place', lat, lng, person_count: 0, center: [lng, lat] as [number, number], radiusMeters: 0, placement: 'gazetteer-point', sizeCapped: false } as PeopleCluster
      : null;
    if (!clusters.length) {
      // The people layer can take a while (or fail). Go to the place from the story link right away;
      // once the people layer is in, the place is selected again with its real counts.
      // (Once per map instance: in development React mounts the map twice.)
      const map = mapRef.current;
      if (pointCluster && deepLinkPreviewed.current !== map) {
        deepLinkPreviewed.current = map;
        deepLinkPreview.current = pointCluster;
        showPlace(pointCluster);
        // Before the style has loaded, a flyTo can be dropped; repeat it once the map is ready.
        if (!map.loaded()) map.once('load', () => { if (!deepLinkDone.current && mapRef.current === map) showPlace(pointCluster); });
      }
      return;
    }
    deepLinkDone.current = true;
    if (placeId) {
      const cluster = clusters.find(c => c.id === placeId) ?? pointCluster;
      if (cluster) {
        showPlace(cluster);
        // ?place=<hospital>&patient=<id> opens that patient's family tree directly.
        const patient = Number(params.get('patient'));
        if (cluster.id === HOSPITAL_ID && Number.isInteger(patient) && patient > 0) {
          setWallPatientId(patient);
          setWallPlace(cluster);
          setWallVisible(true);
        }
      }
    } else if (personId && params.get('year') === '1921' && clusters.some(c => c.id === HOSPITAL_ID)) {
      // 1921 persons are hospital patients: open their family tree on the wall.
      const cluster = clusters.find(c => c.id === HOSPITAL_ID)!;
      showPlace(cluster);
      setWallPatientId(Number(personId));
      setWallPlace(cluster);
      setWallVisible(true);
    } else if (personId && /^[1-9]\d{0,14}$/.test(personId)) {
      const year = Number(params.get('year'));
      void fetch(`/api/person-places?id=${personId}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(result => {
        showPerson({ person: { person_id: Number(personId), full_name: params.get('name') || '', role: null, source_dataset: '', event_year: Number.isFinite(year) && params.get('year') ? year : null }, ids: result.ids ?? [], limited: !!result.limited });
      }).catch(error => console.error('Story link:', error));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters]);

  // Keep the URL in sync with the selection so it can be shared and survives a reload.
  useEffect(() => {
    if (!deepLinkDone.current) return;
    const params = new URLSearchParams();
    if (selectedPlace) {
      params.set('place', selectedPlace.id);
      params.set('label', selectedPlace.label);
      params.set('lat', String(selectedPlace.lat));
      params.set('lng', String(selectedPlace.lng));
      const patient = new URLSearchParams(window.location.search).get('patient');
      if (wallPlace && patient) params.set('patient', patient);
    } else if (selectedPerson && !selectedPerson.family) {
      const { person } = selectedPerson;
      params.set('person', String(person.person_id));
      if (person.full_name) params.set('name', person.full_name);
      if (person.event_year !== null) params.set('year', String(person.event_year));
    }
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next);
  }, [selectedPlace, selectedPerson]);

  function toggleHospitalOnly() {
    if (hospitalMode && selectedPlace?.id === HOSPITAL_ID) {
      setHospitalMode(false);
      clearSelection();
      return;
    }
    const place = allClusters.current.find(cluster => cluster.id === HOSPITAL_ID);
    if (!place) return;
    setWallPlace(null);
    setHospitalMode(true);
    showPlace(place);
  }

  function togglePopularOnly() {
    setHospitalMode(false);
    clearSelection();
    updatePopularOnly(!popularOnlyRef.current);
  }

  const hospitalFocused = desktop && selectedPlace?.id === HOSPITAL_ID;
  useEffect(() => {
    if (!hospitalFocused) { layerRef.current?.clearWalker(); queueMicrotask(() => setWalkerIndex(null)); return; }
    if (hospitalPeople.length) return;
    const controller = new AbortController();
    fetch('/data/mh1921_patienten.json', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error()))
      .then(data => setHospitalPeople(Array.isArray(data) ? data : []))
      .catch(() => {});
    return () => controller.abort();
  }, [hospitalFocused, hospitalPeople.length]);

  const walkerPerson = walkerIndex !== null && hospitalPeople.length ? hospitalPeople[walkerIndex % hospitalPeople.length] : null;

  function showPlace(place: PeopleCluster) {
    setNearbyPlaces([]);
    if (popularOnlyRef.current && !isPopularPlace(place)) updatePopularOnly(false);
    setSelectedPerson(null);
    setSelectedPlace(place);
    layerRef.current?.select([place.id]);
    const map = mapRef.current;
    if (map) updateSelectionIndicators(map, [place]);
    layerRef.current?.setConnections([]);
    map?.flyTo({ center: place.center, zoom: Math.max(map.getZoom(), desktop && place.id === HOSPITAL_ID ? 18.2 : 13), ...(desktop && place.id === HOSPITAL_ID ? { pitch: Math.max(map.getPitch(), 50) } : {}), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
  }

  function showPerson(selection: PersonSelection) {
    setSelectedPlace(null);
    setSelectedPerson(selection);
    const year = selection.person.event_year;
    const inRange = !appliedYears || (year !== null && year >= appliedYears[0] && year <= appliedYears[1]);
    const selected = inRange ? clusters.filter(c => selection.ids.includes(c.id)) : [];
    setNearbyPlaces([]);
    if (popularOnlyRef.current && selected.some(c => !isPopularPlace(c))) updatePopularOnly(false);
    layerRef.current?.select(selected.map(p => p.id));
    const map = mapRef.current;
    if (!map) return;
    updateSelectionIndicators(map, selected);
    layerRef.current?.setConnections(selection.family ? [] : selected.map(place => place.id));
    if (selected.length === 1) map.flyTo({ center: selected[0].center, zoom: Math.max(map.getZoom(), 15), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    if (selected.length > 1) {
      const bounds = selected.reduce((b, place) => b.extend(place.center), new maplibregl.LngLatBounds(selected[0].center, selected[0].center));
      map.fitBounds(bounds, { padding: 55, maxZoom: 16, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    }
  }

  function clearSelection() {
    setSelectedPlace(null); setSelectedPerson(null); setNearbyPlaces([]);
    setWallVisible(false); setWallPlace(null);
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
      if (!controller.signal.aborted) console.error('Tijd selection:', error);
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
    setTimeOpen(false);
    setTimeKey(value => value + 1);
    clearSelection();
    setHospitalMode(false);
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
      className="landscape-shell"
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100dvh - var(--site-header-height))',
        background: '#101f20',
      }}
    >
      <div
        ref={container}
        aria-label="Kaart van Suriname"
        style={{ position: 'absolute', inset: 0 }}
      />

      <div className="map-toolbar">
      <button
        type="button"
        className="map-home"
        onClick={resetView}
        aria-label="Terug naar het begin"
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
      </button>

      <button type="button" className="map-tool" aria-label="Inzoomen" title="Inzoomen" onClick={() => mapRef.current?.zoomIn()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
      <button type="button" className="map-tool" aria-label="Uitzoomen" title="Uitzoomen" onClick={() => mapRef.current?.zoomOut()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
      <button type="button" className="map-tool" aria-label="Noorden boven" title="Noorden boven" onClick={() => mapRef.current?.resetNorth()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 7 14l5-2 5 2-5-11Z" /><path d="M12 12v9" /></svg></button>

      {/* Hidden for now; only the hospital view is offered.
      <button type="button" className="popular-toggle" aria-pressed={popularOnly} onClick={togglePopularOnly}>
        Populaire plaatsen <span>meer dan 50.000</span>
      </button>
      */}
      {desktop && (
        <button type="button" className="popular-toggle hospital-toggle" aria-pressed={hospitalMode && selectedPlace?.id === HOSPITAL_ID} onClick={toggleHospitalOnly}>
          Alleen ziekenhuis <span>3D-model</span>
        </button>
      )}
      </div>

      <div className="map-sidebar">
      <PeopleSearch clusters={clusters} onPlace={place => { setWallPlace(null); showPlace(place); }} onPerson={selection => { setWallPlace(null); showPerson(selection); }} />
      <div className={`map-panel-stack${timeOpen ? ' time-open' : ''}`}>
      {status && <div className="map-status" role="status">{status}</div>}
      {peopleStatus && <div className="people-status" role="status">
        <p>{peopleStatus}</p>
        {peopleFailed && <button type="button" onClick={() => retryPeople.current?.()}>Opnieuw proberen</button>}
      </div>}
      {nearbyPlaces.length > 0 && <section className="nearby-places" aria-label="Kies een plaats">
        <div className="search-results-heading"><strong>Kies een plaats</strong><button type="button" onClick={() => setNearbyPlaces([])}>Sluiten</button></div>
        {nearbyPlaces.length > 30 && <button type="button" className="nearby-place" onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const bounds = nearbyPlaces.reduce((b, place) => b.extend(place.center), new maplibregl.LngLatBounds(nearbyPlaces[0].center, nearbyPlaces[0].center));
          map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000 });
          setNearbyPlaces([]);
        }}>Inzoomen voor meer plaatsen</button>}
        {nearbyPlaces.slice(0, 30).map(place => <button type="button" className="nearby-place" key={place.id} onClick={() => showPlace(place)}>{place.label} <small>{place.person_count.toLocaleString('nl-NL')}</small></button>)}
      </section>}
      {hospitalFocused && walkerIndex !== null && <section className="selection-panel" aria-label="Geselecteerde persoon">
        <button type="button" onClick={() => { layerRef.current?.clearWalker(); setWalkerIndex(null); }} aria-label="Selectie sluiten">Sluiten</button>
        {walkerPerson ? <><h2>{[walkerPerson.achternaam, walkerPerson.initialen_of_contractnr].filter(Boolean).join(' ')}</h2><p>was hier · 1921{walkerPerson.geboortejaar && walkerPerson.geboortejaar !== '?' ? ` · geb. ${walkerPerson.geboortejaar}` : ''}</p></> : <p>Patiënt bij ’s Lands Hospitaal · 1921</p>}
      </section>}
      {(selectedPlace || selectedPerson) && !(hospitalFocused && walkerIndex !== null) && <section className="selection-panel" aria-label="Selectie">
        <button type="button" onClick={clearSelection} aria-label="Selectie sluiten">Sluiten</button>
        {selectedPlace && <><h2>{selectedPlace.label}</h2><p>{selectedPlace !== deepLinkPreview.current || peopleFailed ? `${selectedPlace.person_count.toLocaleString('nl-NL')} persoonsvermeldingen` : 'Persoonsvermeldingen laden…'} · {appliedYears ? `${appliedYears[0]} – ${appliedYears[1]}` : 'Alle jaren'}</p><button type="button" className="open-wall" disabled={selectedPlace.person_count === 0 && !specialPlaceForId(selectedPlace.id)} onClick={() => { setWallPatientId(undefined); setWallPlace(selectedPlace); setWallVisible(true); }}>Open namenmuur</button></>}
        {selectedPerson && <><h2>{selectedPerson.family ? 'Familie van ' : ''}{selectedPerson.person.full_name || 'Naam onbekend'}</h2>{appliedYears && (selectedPerson.person.event_year === null || selectedPerson.person.event_year < appliedYears[0] || selectedPerson.person.event_year > appliedYears[1]) ? <p>Buiten de gekozen jaren.</p> : <p>{clusters.filter(place => selectedPerson.ids.includes(place.id)).length} plaatsen op de kaart{selectedPerson.family ? ' · waar familieleden voorkomen' : ''}</p>}{selectedPerson.limited && <p>Sommige koppelingen ontbreken mogelijk.</p>}</>}
        {selectedPerson && wallPlace && !wallVisible && <button type="button" className="return-wall" onClick={() => setWallVisible(true)}>← Terug naar namenmuur</button>}
      </section>}

      </div>
      </div>
      <div className={`timeline-dock${timeOpen ? ' time-open' : ''}`}>
        <button type="button" className="mobile-time-toggle" aria-expanded={timeOpen} aria-controls="time-controls" onClick={() => setTimeOpen(value => !value)}>{timeOpen ? 'Tijd sluiten' : 'Tijd'}</button>
        <div id="time-controls" className="time-controls"><TimeSlider key={timeKey} onApply={applyTime} onCancel={() => timeRequest.current?.abort()} /></div>
      </div>
      {wallPlace && <PlaceWall patientId={wallPatientId} place={wallPlace} years={appliedYears} visible={wallVisible} onClose={() => { setWallVisible(false); setWallPlace(null); setWallPatientId(undefined); }} onPerson={selection => { setWallVisible(false); showPerson(selection); }} />}

    </main>
  );
}
