// One key format for everything that leaves the projection (display registry,
// phone, contributions). Internally the constellation keeps its short NodeKeys.
//   patient:<patient_id>   a row in mh1921_patienten
//   person:<person_id>     a row in persons (an attestation, not a merged person)
//   name:<uuid>            a name told by a visitor that isn't in the archive (yet)
export type Key = `patient:${number}` | `person:${number}` | `name:${string}`;

export const patientKey = (id: number): Key => `patient:${id}`;
export const personKey = (id: number): Key => `person:${id}`;

export function parseKey(key: string): { kind: 'patient' | 'person'; id: number } | { kind: 'name'; id: string } | null {
  const m = /^(patient|person|name):(.+)$/.exec(key);
  if (!m) return null;
  if (m[1] === 'name') return { kind: 'name', id: m[2] };
  const id = Number(m[2]);
  return Number.isInteger(id) && id > 0 ? { kind: m[1] as 'patient' | 'person', id } : null;
}

// Constellation NodeKey ('p:12' | 'x:345' | 's:…') to a shared key; summary
// names ("witness · 214 more") are not people and have none.
export function fromNodeKey(node: string): Key | null {
  const id = Number(node.slice(2));
  if (node.startsWith('p:')) return patientKey(id);
  if (node.startsWith('x:')) return personKey(id);
  return null;
}
