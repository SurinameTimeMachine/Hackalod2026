'use client';

import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePatientEdges, usePatients } from '../shared/hooks';
import { useSignals } from '../shared/signals';
import type { Tie } from '../shared/api';
import { displayName, isCertain, nameTag, strongestTie, subtitle, tieReason, tieReference } from '../shared/strings';
import { layoutWall, makeMeasure, type StampLayout } from './wallLayout';
import { FONTS } from './stampStyle';
import Wall from './Wall';
import { useMobileWall } from './useMobileWall';
import WallCamera from './WallCamera';
import WallMapButton from './WallMapButton';
import type { PersonSelection } from '../PeopleSearch';
import { useConstellation } from '../family-graph/projection/useConstellation';
import { usePatientEdges as useGraphEdges, usePatientIndex } from '../family-graph/shared/hooks';

async function loadFonts() {
  await Promise.all(
    FONTS.map(async (f) => {
      const face = new FontFace(f.name, `url(${f.url})`);
      document.fonts.add(await face.load());
    }),
  );
}

export default function ProjectionPage({ onPerson }: { onPerson: (selection: PersonSelection) => void }) {
  const mobile = useMobileWall();
  const { patients, source } = usePatients();
  const { edges } = usePatientEdges();
  const graphEdges = useGraphEdges();
  const patientIndex = usePatientIndex();
  const family = useConstellation({ patientOf: id => patientIndex.get(id), patientName: id => displayName(patients?.find(p => p.patient_id === id) ?? { patient_id: id, achternaam: `#${id}`, initialen_of_contractnr: null, geboortejaar: null, groep: '', aantal_vermeldingen: 0, beste_resultaat: '', gevonden_in: null }), wallTies: graphEdges });
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

  const { open: openFamily, reset: resetFamily } = family;
  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    if (id === null) resetFamily(); else openFamily(id);
  }, [resetFamily, openFamily]);
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
    (id: number) => {
      const p = byId.get(id);
      if (!p) return '';
      return subtitle(p);
    },
    [byId],
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
        <WallCamera selected={stamps.find(stamp => stamp.id === selectedId)} caption={selectedId == null ? '' : describeSelected(selectedId)} />
        <Wall
          stamps={stamps}
          edges={edges}
          selectedId={selectedId}
          onSelect={select}
          describeSelected={describeSelected}
          describeTie={describeTie}
        />
      </Canvas>}
      {selectedPatient && <div className="wall-map-position">
        <WallMapButton person={{ person_id: selectedPatient.patient_id, full_name: displayName(selectedPatient), role: 'patient', source_dataset: 'mh1921', event_year: 1921 }} endpoint="patient-places" onShow={onPerson} />
      </div>}
      {selectedPatient && family.graph && <div className="wall-family-graph" aria-label="Familie en verbindingen">
        <button type="button" className="wall-family-close" onClick={() => select(null)}>Terug naar namen</button>
        {family.offline && <p role="status">Verbindingen konden niet worden geladen.</p>}
        {(() => {
          const graph = family.graph!;
          const nodes = [...graph.nodes.values()];
          const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
          const rows = Math.ceil(nodes.length / columns);
          const positions = new Map(nodes.map((node, i) => [node.key, { x: ((i % columns) + .5) / columns * 100, y: (Math.floor(i / columns) + .5) / rows * 100 }]));
          return <><svg className="wall-family-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{[...graph.edges.values()].map(edge => {
            const a = positions.get(edge.from), b = positions.get(edge.to);
            return a && b ? <line key={edge.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={edge.certain ? undefined : '1 1'} /> : null;
          })}</svg>{nodes.map(node => { const point = positions.get(node.key)!; return <button type="button" key={node.key} className={node.key === graph.focus ? 'wall-family-node is-focused' : 'wall-family-node'} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => family.click(node.key)}><span>{node.name}</span>{node.caption && <small>{node.caption}</small>}</button>; })}</>;
        })()}
      </div>}
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${stamps[0]?.size.toFixed(1) ?? '–'} units\npatient pairs with ties: ${edges.length}\nselected: ${selectedId ?? '–'}`}
        </div>
      )}
    </main>
  );
}
