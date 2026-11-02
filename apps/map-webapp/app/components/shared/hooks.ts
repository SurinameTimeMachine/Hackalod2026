import { useEffect, useState } from 'react';
import { apiGet, snapshot, type Patient, type PatientEdge } from './api';

export type Source = 'loading' | 'api' | 'snapshot' | 'failed';

// The wall must always render: live API first, bundled snapshot as fallback.
export function usePatients() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [source, setSource] = useState<Source>('loading');

  useEffect(() => {
    let cancelled = false;
    apiGet<Patient[]>('mh1921_patienten', { _size: 'max' })
      .then((rows) => ['api', rows] as const)
      .catch(() => snapshot<Patient[]>('mh1921_patienten.json').then((rows) => ['snapshot', rows] as const))
      .then(([src, rows]) => {
        if (cancelled) return;
        setPatients(rows);
        setSource(src);
      })
      .catch(() => !cancelled && setSource('failed'));
    return () => {
      cancelled = true;
    };
  }, []);

  return { patients, source };
}

// Patient-to-patient ties have no canned query yet; they are precomputed from
// the API by `pnpm snapshot`. Swap this for a live query once one exists.
export function usePatientEdges() {
  const [edges, setEdges] = useState<PatientEdge[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let active = true;
    snapshot<{ edges: PatientEdge[] }>('patient_relations.json')
      .then((d) => { if (active) { setEdges(d.edges); setStatus('ready'); } })
      .catch(() => { if (active) setStatus('failed'); });
    return () => { active = false; };
  }, []);
  return { edges, status };
}
