'use client';

import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePatientEdges, usePatients } from '../shared/hooks';
import { useSignals } from '../shared/signals';
import type { Tie } from '../shared/api';
import { displayName, isCertain, nameTag, NO_TIES, strongestTie, subtitle, tieReason, tieReference } from '../shared/strings';
import { layoutWall, makeMeasure, type StampLayout } from './wallLayout';
import { FONTS } from './stampStyle';
import Wall from './Wall';
import { useMobileWall } from './useMobileWall';
import WallCamera from './WallCamera';

async function loadFonts() {
  await Promise.all(
    FONTS.map(async (f) => {
      const face = new FontFace(f.name, `url(${f.url})`);
      document.fonts.add(await face.load());
    }),
  );
}

export default function ProjectionPage() {
  const mobile = useMobileWall();
  const { patients, source } = usePatients();
  const { edges, status: edgesStatus } = usePatientEdges();
  const [fontsReady, setFontsReady] = useState(false);
  // ?patient=<id> opens the wall with that name selected (demo story).
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(window.location.search).get('patient'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const [debug, setDebug] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobile || selectedId == null) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-person-id="${selectedId}"]`);
    item?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [mobile, selectedId, patients]);

  useEffect(() => {
    loadFonts().finally(() => setFontsReady(true));
  }, []);

  const stamps: StampLayout[] = useMemo(() => {
    if (!patients || !fontsReady || mobile) return [];
    const measure = makeMeasure();
    return layoutWall(
      patients.map((p) => ({ id: p.patient_id, text: nameTag(displayName(p), 1921) })),
      measure,
    );
  }, [patients, fontsReady, mobile]);

  const byId = useMemo(() => new Map(patients?.map((p) => [p.patient_id, p]) ?? []), [patients]);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
  }, []);
  useSignals(select);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
      if (e.key === 'd' || e.key === 'D') setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  const describeSelected = useCallback(
    (id: number, hasTies: boolean) => {
      const p = byId.get(id);
      if (!p) return '';
      return hasTies || edgesStatus !== 'ready' ? subtitle(p) : `${subtitle(p)}\n${NO_TIES}`;
    },
    [byId, edgesStatus],
  );

  const describeTie = useCallback(
    (ties: Tie[], a: number, b: number) => {
      const t = strongestTie(ties);
      const nameOf = (id: number) => (byId.has(id) ? displayName(byId.get(id)!) : String(id));
      return { certain: isCertain(t), reason: tieReason(t, a, b, nameOf), reference: tieReference(t) };
    },
    [byId],
  );

  const selectedPatient = selectedId == null ? undefined : byId.get(selectedId);
  const related = selectedPatient ? edges.flatMap(edge => {
    const otherId = edge.a === selectedId ? edge.b : edge.b === selectedId ? edge.a : null;
    const person = otherId == null ? undefined : byId.get(otherId);
    if (!person || edge.ties.length === 0) return [];
    const detail = describeTie(edge.ties, edge.a, edge.b);
    return [{ person, ...detail }];
  }) : [];

  return (
    <main style={{ position: 'absolute', inset: 0 }}>
      {mobile ? <div className="wall-name-list" ref={listRef}>
        {source === 'loading' && <p role="status">Namen laden…</p>}
        {source === 'failed' && <p role="alert">De namen konden niet worden geladen.</p>}
        {patients?.map((patient, index) => <button type="button" className={`wall-name tag-style-${index % 4}`} key={patient.patient_id} data-person-id={patient.patient_id} aria-expanded={selectedId === patient.patient_id} onClick={() => select(selectedId === patient.patient_id ? null : patient.patient_id)}>
          <span>{nameTag(displayName(patient), 1921)}</span>
        </button>)}
      </div> : <Canvas
        flat
        gl={{ alpha: true }}
        dpr={[1, 2]}
        onPointerMissed={() => select(null)}
      >
        <WallCamera selected={stamps.find(stamp => stamp.id === selectedId)} caption={selectedId == null ? '' : describeSelected(selectedId, related.length > 0)} detailsPanel />
        <Wall
          stamps={stamps}
          edges={edges}
          selectedId={selectedId}
          onSelect={select}
          describeSelected={describeSelected}
          describeTie={describeTie}
        />
      </Canvas>}
      {selectedPatient && <aside className="wall-person-details" aria-label="Persoonsgegevens">
        <button type="button" className="wall-details-close" aria-label="Persoonsgegevens sluiten" onClick={() => select(null)}>×</button>
        <h3>{nameTag(displayName(selectedPatient), 1921)}</h3>
        {selectedPatient.geboortejaar && selectedPatient.geboortejaar !== '?' && <p>Geboren: {selectedPatient.geboortejaar}</p>}
        {edgesStatus === 'loading' ? <p>Verbindingen laden…</p> : edgesStatus === 'failed' ? <p>Verbindingen konden niet worden geladen.</p> : related.length > 0 ? <><strong>Verbindingen</strong><ul>{related.map(({ person, reason, reference }) => <li key={person.patient_id}><button type="button" onClick={() => select(person.patient_id)}>{nameTag(displayName(person), 1921)}</button><small>{reason}{reference && ` · ${reference}`}</small></li>)}</ul></> : <p>Geen bekende verbindingen op deze muur.</p>}
      </aside>}
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${stamps[0]?.size.toFixed(1) ?? '–'} units\npatient pairs with ties: ${edges.length}\nselected: ${selectedId ?? '–'}`}
        </div>
      )}
    </main>
  );
}
