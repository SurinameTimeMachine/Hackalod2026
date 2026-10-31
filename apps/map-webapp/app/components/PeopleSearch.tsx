'use client';

import { useEffect, useState } from 'react';
import type { PeopleCluster } from '../lib/people-data';
import { specialPlaces, specialPlaceCluster } from '../lib/special-places';

type PlaceResult = { place_norm: string; label: string; records: number; gazetteer_id: string | null; gazetteer_label: string | null; lat: number | null; lng: number | null; match_type: string | null; confidence: number | null };

type Person = { person_id: number; full_name: string; role: string | null; source_dataset: string; event_year: number | null };
export type PersonSelection = { person: Person; ids: string[]; limited: boolean };

type Props = {
  clusters: PeopleCluster[];
  onPlace: (place: PeopleCluster) => void;
  onPerson: (selection: PersonSelection) => void;
};

function ResultIcon({ type }: { type: 'place' | 'person' }) {
  return <span className="search-result-icon" aria-hidden="true">
    {type === 'place' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.4" /></svg>
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>}
  </span>;
}

export default function PeopleSearch({ clusters, onPlace, onPerson }: Props) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placeState, setPlaceState] = useState('');
  const [placesLimited, setPlacesLimited] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState('');
  const [limited, setLimited] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyPerson, setBusyPerson] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      void (async () => {
        try {
          const response = await fetch(`/api/place-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          if (!response.ok) throw new Error();
          const data = await response.json();
          setPlaces(data.places); setPlacesLimited(data.limited); setPlaceState('done');
        } catch { if (!controller.signal.aborted) setPlaceState('error'); }
      })();
      try {
        const response = await fetch(`/api/person-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        setPeople(data.people);
        setLimited(data.limited);
        setState('done');
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  async function selectPerson(person: Person) {
    setBusyPerson(person.person_id);
    setError('');
    try {
      const response = await fetch(`/api/person-places?id=${person.person_id}`);
      if (!response.ok) throw new Error();
      const result = await response.json();
      onPerson({ person, ids: result.ids, limited: result.limited });
      setOpen(false);
    } catch {
      setError('De verbonden plaatsen konden niet worden geladen. Probeer het opnieuw.');
    } finally { setBusyPerson(null); }
  }

  return <div className="people-search">
    <label htmlFor="people-search-input">Zoek personen en plaatsen</label>
    <input id="people-search-input" type="search" placeholder="Naam of plaats" value={query} maxLength={100}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setPeople([]); setPlaces([]); setState(''); setPlaceState(''); setOpen(true); }} />
    {open && query.trim().length >= 2 && <div className="search-results">
      <div className="search-results-heading"><strong>Plaatsen</strong><button type="button" onClick={() => setOpen(false)} aria-label="Zoekresultaten sluiten">Sluiten</button></div>
      {specialPlaces.filter(place => place.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(place => <button type="button" className="search-result" key={place.id} onClick={() => {
        const linked = clusters.find(cluster => place.gazetteerIds?.includes(cluster.id));
        onPlace(linked ?? specialPlaceCluster(place));
        setOpen(false);
      }}><ResultIcon type="place" /><span className="search-result-text"><strong>{place.label}</strong><small>Bijzondere plek</small></span></button>)}
      {placeState === '' && <p>Plaatsen zoeken…</p>}
      {placeState === 'error' && <p>Zoeken naar plaatsen is niet beschikbaar.</p>}
      {placeState === 'done' && !specialPlaces.some(place => place.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && !places.some(place => typeof place.lat === 'number' && Number.isFinite(place.lat) && typeof place.lng === 'number' && Number.isFinite(place.lng)) && <p>Geen plaatsen op de kaart gevonden.</p>}
      {places.filter(place => typeof place.lat === 'number' && Number.isFinite(place.lat) && typeof place.lng === 'number' && Number.isFinite(place.lng)).map(place => {
        const cluster = clusters.find(c => c.id === place.gazetteer_id);
        const hasCoordinates = typeof place.lat === 'number' && Number.isFinite(place.lat) && typeof place.lng === 'number' && Number.isFinite(place.lng);
        return <button type="button" className="search-result" key={place.place_norm} disabled={!hasCoordinates} onClick={() => {
          if (!hasCoordinates) return;
          onPlace(cluster ?? { id: place.gazetteer_id ?? place.place_norm, uri: null, label: place.label, type: 'place', lat: place.lat!, lng: place.lng!, person_count: 0, center: [place.lng!, place.lat!], radiusMeters: 0, placement: 'gazetteer-point', sizeCapped: false });
          setOpen(false);
        }}><ResultIcon type="place" /><span className="search-result-text"><strong><span className="sr-only">Plaats: </span>{place.label}</strong><small>{place.gazetteer_label && place.gazetteer_label !== place.label ? `Gekoppeld aan ${place.gazetteer_label} · ` : ''}{place.records.toLocaleString('nl-NL')} vermeldingen</small></span></button>;
      })}
      {placesLimited && <p>De eerste 100 plaatsen worden getoond. Verfijn je zoekopdracht.</p>}
      <strong>Personen</strong>
      {state === '' && <p>Zoeken…</p>}
      {state === 'error' && <p>Zoeken naar personen is niet beschikbaar.</p>}
      {state === 'done' && !people.length && <p>Geen personen gevonden.</p>}
      {state === 'done' && people.map(person => <button type="button" className="search-result" key={person.person_id} disabled={busyPerson !== null} onClick={() => void selectPerson(person)}><ResultIcon type="person" /><span className="search-result-text"><strong><span className="sr-only">Persoon: </span>{person.full_name || 'Naam onbekend'}</strong><small>{person.event_year}</small></span></button>)}
      {limited && <p>De eerste 100 vermeldingen worden getoond. Verfijn je zoekopdracht.</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
