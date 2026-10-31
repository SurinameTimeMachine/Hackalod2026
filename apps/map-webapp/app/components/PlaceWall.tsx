'use client';

import dynamic from 'next/dynamic';
import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PeopleCluster } from '../lib/people-data';
import type { YearRange } from './TimeSlider';
import { layoutWall, makeMeasure, WALL } from './wall/wallLayout';
import { FONTS } from './wall/stampStyle';
import Wall from './wall/Wall';
import { useMobileWall } from './wall/useMobileWall';

const HospitalProjection = dynamic(() => import('./wall/ProjectionPage'), { ssr: false });

type Person = { person_id: number; full_name: string | null; role: string | null; source_dataset: string; event_year: number | null };
function FitWall() {
  const size = useThree(state => state.size);
  return <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={Math.min(size.width / WALL.width, size.height / WALL.height)} />;
}

export default function PlaceWall(props: { place: PeopleCluster; onClose: () => void; years: YearRange }) {
  return props.place.id === 'stm-1885-address-0327' && !props.years ? <HospitalWall onClose={props.onClose} /> : <GeneralWall {...props} />;
}

function WallDialog({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);
  return <dialog ref={dialogRef} className="wall-overlay" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function HospitalWall({ onClose }: { onClose: () => void }) {
  return <WallDialog titleId="hospital-wall-title" onClose={onClose}>
    <header className="wall-header"><div><h2 id="hospital-wall-title">’s Lands Hospitaal</h2><p>1921</p></div><button type="button" autoFocus onClick={onClose}>Close wall</button></header>
    <div className="wall-canvas"><HospitalProjection /></div>
  </WallDialog>;
}

function GeneralWall({ place, onClose, years }: { place: PeopleCluster; onClose: () => void; years: YearRange }) {
  const mobile = useMobileWall();
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all(FONTS.map(async font => {
      const face = new FontFace(font.name, `url(${font.url})`);
      document.fonts.add(await face.load());
    })).then(() => { if (active) setReady(true); }).catch(() => { if (active) setError('The wall fonts could not load.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const yearsQuery = years ? `&from=${years[0]}&to=${years[1]}` : '';
    fetch(`/api/place-wall?id=${encodeURIComponent(place.id)}&offset=${page * 50}${yearsQuery}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { setPeople(data.people); setMore(data.more); setLoading(false); })
      .catch(() => { if (!controller.signal.aborted) { setError('The wall could not load. Please try again.'); setLoading(false); } });
    return () => controller.abort();
  }, [place.id, page, retry, years]);
  const stamps = useMemo(() => ready && !mobile && people.length ? layoutWall(people.map(p => ({ id: p.person_id, text: p.full_name || 'Unnamed person' })), makeMeasure()) : [], [people, ready, mobile]);
  const describe = useCallback((id: number) => {
    const p = people.find(person => person.person_id === id);
    return p ? [p.role, p.event_year].filter(Boolean).join(' · ') : '';
  }, [people]);
  const changePage = (next: number) => { setLoading(true); setError(''); setSelected(null); setPage(next); };
  return <WallDialog titleId="wall-title" onClose={onClose}>
    <header className="wall-header"><div><h2 id="wall-title">{place.label}</h2><p>Person records · {years ? `${years[0]} – ${years[1]}` : 'All dates'}</p></div><button type="button" autoFocus onClick={onClose}>Close wall</button></header>
    <div className="wall-canvas">
      {!loading && !error && mobile && people.length > 0 && <div className="wall-name-list">{people.map(person => <button type="button" className="wall-name" key={person.person_id} aria-expanded={selected === person.person_id} onClick={() => setSelected(selected === person.person_id ? null : person.person_id)}><span>{person.full_name || 'Unnamed person'}</span>{selected === person.person_id && <small>{describe(person.person_id)}</small>}</button>)}</div>}
      {!loading && !error && ready && !mobile && people.length > 0 && <Canvas flat dpr={[1, 1.5]} onPointerMissed={() => setSelected(null)}><color attach="background" args={['#fbfaf6']} /><FitWall /><Wall stamps={stamps} edges={[]} selectedId={selected} onSelect={setSelected} describeSelected={describe} describeTie={() => ({ certain: false, reason: '', reference: '' })} /></Canvas>}
      {loading && <p role="status">Loading names…</p>}
      {!loading && !error && !people.length && <p>No person records found for this place.</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setLoading(true); setRetry(value => value + 1); }}>Retry</button></div>}
    </div>
    <footer className="wall-footer"><button type="button" disabled={page === 0 || loading} onClick={() => changePage(page - 1)}>Previous</button><span>Page {page + 1} · up to 50 records</span><button type="button" disabled={!more || loading} onClick={() => changePage(page + 1)}>Next</button></footer>
  </WallDialog>;
}
