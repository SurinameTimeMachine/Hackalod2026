'use client';

import { useEffect, useState } from 'react';
import type { PeopleCluster } from '../lib/people-data';

type Person = { person_id: number; full_name: string; role: string | null; source_dataset: string; event_year: number | null };
export type PersonSelection = { person: Person; ids: string[]; limited: boolean };

type Props = {
  clusters: PeopleCluster[];
  onPlace: (place: PeopleCluster) => void;
  onPerson: (selection: PersonSelection) => void;
};

export default function PeopleSearch({ clusters, onPlace, onPerson }: Props) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState('');
  const [limited, setLimited] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyPerson, setBusyPerson] = useState<number | null>(null);
  const [error, setError] = useState('');
  const places = query.trim().length < 2 ? [] : clusters.filter(p => p.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 20);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
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
      setError('Connected places could not load. Please try again.');
    } finally { setBusyPerson(null); }
  }

  return <div className="people-search">
    <label htmlFor="people-search-input">Search people and places</label>
    <input id="people-search-input" type="search" placeholder="Name or place" value={query} maxLength={100}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setPeople([]); setState(''); setOpen(true); }} />
    {open && query.trim().length >= 2 && <div className="search-results">
      <div className="search-results-heading"><strong>Places</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close search results">Close</button></div>
      {places.length ? places.map(place => <button type="button" key={place.id} onClick={() => { onPlace(place); setOpen(false); }}><strong>{place.label}</strong><small>{place.type} · {place.person_count.toLocaleString()} person records</small></button>) : <p>No matching places with spheres.</p>}
      <strong>People</strong>
      {state === '' && <p>Searching…</p>}
      {state === 'error' && <p>Person search unavailable. Try changing your search.</p>}
      {state === 'done' && !people.length && <p>No person records found.</p>}
      {state === 'done' && people.map(person => <button type="button" key={person.person_id} disabled={busyPerson !== null} onClick={() => void selectPerson(person)}><strong>{person.full_name || 'Unnamed person'}</strong><small>{[person.role, person.event_year, person.source_dataset].filter(Boolean).join(' · ')} · record {person.person_id}</small></button>)}
      {limited && <p>Showing the first 100 person records. Refine your search.</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
