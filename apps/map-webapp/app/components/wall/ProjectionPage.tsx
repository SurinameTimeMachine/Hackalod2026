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
import FamilyConstellation from './FamilyConstellation';

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
  const [familyMapStatus, setFamilyMapStatus] = useState('');
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
  const initialOpened = useRef(false);
  useEffect(() => {
    if (initialOpened.current || selectedId === null || !patients?.some(patient => patient.patient_id === selectedId)) return;
    initialOpened.current = true;
    openFamily(selectedId);
  }, [openFamily, patients, selectedId]);
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
  async function showFamilyOnMap() {
    if (!family.graph || !selectedPatient) return;
    const graph = family.graph;
    const keys = new Set([graph.root]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges.values()) {
        if (!edge.certain || (!edge.parent && !edge.level)) continue;
        if (keys.has(edge.from) && !keys.has(edge.to)) { keys.add(edge.to); changed = true; }
        if (keys.has(edge.to) && !keys.has(edge.from)) { keys.add(edge.from); changed = true; }
      }
    }
    const nodes = [...keys].map(key => graph.nodes.get(key)).filter(node => node && (node.patientId || node.personId));
    setFamilyMapStatus('Plaatsen laden…');
    try {
      const results = await Promise.all(nodes.map(async node => {
        const endpoint = node!.patientId ? 'patient-places' : 'person-places';
        const response = await fetch(`/api/${endpoint}?id=${node!.patientId ?? node!.personId}`);
        if (!response.ok) throw new Error('Could not load places');
        return response.json() as Promise<{ ids: string[]; limited: boolean }>;
      }));
      const ids = [...new Set(results.flatMap(result => result.ids))];
      if (!ids.length) { setFamilyMapStatus('Geen plaatsen op de kaart gevonden.'); return; }
      setFamilyMapStatus('');
      onPerson({ person: { person_id: selectedPatient.patient_id, full_name: displayName(selectedPatient), role: 'patient', source_dataset: 'mh1921', event_year: 1921 }, ids, limited: results.some(result => result.limited), family: true });
    } catch { setFamilyMapStatus('De plaatsen konden niet worden geladen.'); }
  }

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
        <WallCamera selected={stamps.find(stamp => stamp.id === selectedId)} caption={selectedId == null ? '' : describeSelected(selectedId)} familyCount={family.graph?.nodes.size ?? 0} />
        <Wall
          stamps={stamps}
          edges={[]}
          selectedId={selectedId}
          onSelect={select}
          describeSelected={describeSelected}
          describeTie={describeTie}
        />
        {family.graph && selectedId !== null && stamps.find(stamp => stamp.id === selectedId) && <FamilyConstellation graph={family.graph} anchor={stamps.find(stamp => stamp.id === selectedId)!} rootCaption={describeSelected(selectedId)} onSelect={family.click} />}
      </Canvas>}
      {selectedPatient && <div className="wall-map-position">
        <WallMapButton person={{ person_id: selectedPatient.patient_id, full_name: displayName(selectedPatient), role: 'patient', source_dataset: 'mh1921', event_year: 1921 }} endpoint="patient-places" onShow={onPerson} />
        {family.graph && family.graph.nodes.size > 1 && <button type="button" className="wall-family-toggle" onClick={() => void showFamilyOnMap()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15" /></svg>Familie op de kaart</button>}
        {familyMapStatus && <p role="status">{familyMapStatus}</p>}
      </div>}
      {mobile && family.graph && family.graph.nodes.size > 1 && <div className="wall-relations" aria-label="Familie en verbindingen"><strong>Verbindingen</strong><ul>{[...family.graph.nodes.values()].filter(node => node.key !== family.graph?.root).map(node => <li key={node.key}><button type="button" onClick={() => family.click(node.key)}>{node.name}</button><small>{node.caption}</small></li>)}</ul></div>}
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${stamps[0]?.size.toFixed(1) ?? '–'} units\npatient pairs with ties: ${edges.length}\nselected: ${selectedId ?? '–'}`}
        </div>
      )}
    </main>
  );
}
