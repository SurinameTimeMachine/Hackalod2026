'use client';

import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePatientEdges, usePatients } from '../shared/hooks';
import { useSignals } from '../shared/signals';
import type { Tie } from '../shared/api';
import { displayName, isCertain, NO_TIES, strongestTie, subtitle, tieReason, tieReference } from '../shared/strings';
import { layoutWall, makeMeasure, WALL, type StampLayout } from './wallLayout';
import { FONTS } from './stampStyle';
import Wall from './Wall';

const IDLE_TIMEOUT = 60_000;

// Fit the 1920×1080 wall into whatever the window is.
function FitWall() {
  const size = useThree((s) => s.size);
  const zoom = Math.min(size.width / WALL.width, size.height / WALL.height);
  return <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={zoom} />;
}

async function loadFonts() {
  await Promise.all(
    FONTS.map(async (f) => {
      const face = new FontFace(f.name, `url(${f.url})`);
      document.fonts.add(await face.load());
    }),
  );
}

export default function ProjectionPage() {
  const { patients, source } = usePatients();
  const edges = usePatientEdges();
  const [fontsReady, setFontsReady] = useState(false);
  // ?patient=<id> opens the wall with that name selected (demo story).
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(window.location.search).get('patient'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const [debug, setDebug] = useState(false);
  const [lastInput, setLastInput] = useState(() => Date.now());

  useEffect(() => {
    loadFonts().finally(() => setFontsReady(true));
  }, []);

  const stamps: StampLayout[] = useMemo(() => {
    if (!patients || !fontsReady) return [];
    const measure = makeMeasure();
    return layoutWall(
      patients.map((p) => ({ id: p.patient_id, text: displayName(p) })),
      measure,
    );
  }, [patients, fontsReady]);

  const byId = useMemo(() => new Map(patients?.map((p) => [p.patient_id, p]) ?? []), [patients]);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    setLastInput(Date.now());
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

  useEffect(() => {
    if (selectedId == null) return;
    const t = setTimeout(() => setSelectedId(null), IDLE_TIMEOUT - (Date.now() - lastInput));
    return () => clearTimeout(t);
  }, [selectedId, lastInput]);

  const describeSelected = useCallback(
    (id: number, hasTies: boolean) => {
      const p = byId.get(id);
      if (!p) return '';
      return hasTies ? subtitle(p) : `${subtitle(p)}\n${NO_TIES}`;
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

  return (
    <main style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <Canvas
        flat
        dpr={[1, 2]}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={['#000']} />
        <FitWall />
        <Wall
          stamps={stamps}
          edges={edges}
          selectedId={selectedId}
          onSelect={select}
          describeSelected={describeSelected}
          describeTie={describeTie}
        />
      </Canvas>
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${stamps[0]?.size.toFixed(1) ?? '–'} units\npatient pairs with ties: ${edges.length}\nselected: ${selectedId ?? '–'}`}
        </div>
      )}
    </main>
  );
}
