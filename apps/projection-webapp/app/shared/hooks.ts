import { useEffect, useState } from 'react';
import { apiGet, snapshot, type Koppeling, type Patient, type PatientEdge, type Vermelding } from './api';

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
  useEffect(() => {
    snapshot<{ edges: PatientEdge[] }>('patient_relations.json')
      .then((d) => setEdges(d.edges))
      .catch(() => setEdges([]));
  }, []);
  return edges;
}

// person_id -> patient_id for every attestation that is certainly a patient,
// so a patient met inside someone else's constellation lights up their own
// stamp instead of appearing twice. Two small tables, loaded once.
export function usePatientIndex() {
  const [index, setIndex] = useState<Map<number, number>>(() => new Map());
  useEffect(() => {
    Promise.all([
      apiGet<Vermelding[]>('mh1921_vermeldingen', { _size: 'max' }),
      apiGet<Koppeling[]>('mh1921_koppelingen', { _size: 'max' }),
    ])
      .then(([vs, ks]) => {
        const m = new Map<number, number>();
        const shared = new Set<number>();
        for (const v of vs) if (v.person_id) m.set(v.person_id, v.patient_id);
        for (const k of ks) {
          if (!k.doel_person_id || k.resultaat !== 'zeker') continue;
          const prev = m.get(k.doel_person_id);
          if (prev !== undefined && prev !== k.patient_id) shared.add(k.doel_person_id);
          else m.set(k.doel_person_id, k.patient_id);
        }
        for (const id of shared) m.delete(id); // matched to two patients: ambiguous
        setIndex(m);
      })
      .catch(() => {}); // offline: patients are then shown as plain names
  }, []);
  return index;
}
