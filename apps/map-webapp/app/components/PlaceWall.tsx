'use client';

import dynamic from 'next/dynamic';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PeopleCluster } from '../lib/people-data';
import type { YearRange } from './TimeSlider';
import { layoutWall, makeMeasure } from './wall/wallLayout';
import { FONTS } from './wall/stampStyle';
import Wall from './wall/Wall';
import { useMobileWall } from './wall/useMobileWall';
import { nameTag, roleLabel } from './shared/strings';
import WallCamera from './wall/WallCamera';

const HospitalProjection = dynamic(() => import('./wall/ProjectionPage'), { ssr: false });

type Person = { person_id: number; full_name: string | null; role: string | null; source_dataset: string; event_year: number | null };
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
    <header className="wall-header"><h2 id="hospital-wall-title">’s Lands Hospitaal <span>· 1921</span></h2><button type="button" autoFocus onClick={onClose} aria-label="Namenmuur sluiten">Sluiten <span aria-hidden="true">×</span></button></header>
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
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile || selected == null) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-person-id="${selected}"]`);
    item?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [mobile, selected]);
  useEffect(() => {
    let active = true;
    Promise.all(FONTS.map(async font => {
      const face = new FontFace(font.name, `url(${font.url})`);
      document.fonts.add(await face.load());
    })).then(() => { if (active) setReady(true); }).catch(() => { if (active) setError('De lettertypen konden niet worden geladen.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const yearsQuery = years ? `&from=${years[0]}&to=${years[1]}` : '';
    fetch(`/api/place-wall?id=${encodeURIComponent(place.id)}&offset=${page * 50}${yearsQuery}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { setPeople(data.people); setMore(data.more); setLoading(false); })
      .catch(() => { if (!controller.signal.aborted) { setError('De namenmuur kon niet worden geladen. Probeer het opnieuw.'); setLoading(false); } });
    return () => controller.abort();
  }, [place.id, page, retry, years]);
  const stamps = useMemo(() => ready && !mobile && people.length ? layoutWall(people.map(p => ({ id: p.person_id, text: nameTag(p.full_name, p.event_year) })), makeMeasure()) : [], [people, ready, mobile]);
  const describe = useCallback((id: number) => {
    const p = people.find(person => person.person_id === id);
    return p ? roleLabel(p.role) ?? '' : '';
  }, [people]);
  const changePage = (next: number) => { setLoading(true); setError(''); setSelected(null); setPage(next); };
  return <WallDialog titleId="wall-title" onClose={onClose}>
    <header className="wall-header"><h2 id="wall-title">{place.label} <span>· {years ? `${years[0]} – ${years[1]}` : 'Alle jaren'}</span></h2><button type="button" autoFocus onClick={onClose} aria-label="Namenmuur sluiten">Sluiten <span aria-hidden="true">×</span></button></header>
    <div className="wall-canvas">
      {!loading && !error && mobile && people.length > 0 && <div className="wall-name-list" ref={listRef}>{people.map((person, index) => <button type="button" className={`wall-name tag-style-${index % 4}`} key={person.person_id} data-person-id={person.person_id} aria-expanded={selected === person.person_id} onClick={() => setSelected(selected === person.person_id ? null : person.person_id)}><span>{nameTag(person.full_name, person.event_year)}</span>{selected === person.person_id && <small>{describe(person.person_id)}</small>}</button>)}</div>}
      {!loading && !error && ready && !mobile && people.length > 0 && <Canvas flat gl={{ alpha: true }} dpr={[1, 1.5]} onPointerMissed={() => setSelected(null)}><WallCamera selected={stamps.find(stamp => stamp.id === selected)} caption={selected == null ? '' : describe(selected)} /><Wall stamps={stamps} edges={[]} selectedId={selected} onSelect={setSelected} describeSelected={describe} describeTie={() => ({ certain: false, reason: '', reference: '' })} /></Canvas>}
      {loading && <p role="status">Namen laden…</p>}
      {!loading && !error && !people.length && <p>Geen personen gevonden voor deze plaats.</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setLoading(true); setRetry(value => value + 1); }}>Opnieuw proberen</button></div>}
    </div>
    <footer className="wall-footer" aria-label="Pagina's"><button type="button" aria-label="Vorige pagina" disabled={page === 0 || loading} onClick={() => changePage(page - 1)}>←</button><span aria-label={`Pagina ${page + 1}`}>{page + 1}</span><button type="button" aria-label="Volgende pagina" disabled={!more || loading} onClick={() => changePage(page + 1)}>→</button></footer>
  </WallDialog>;
}
