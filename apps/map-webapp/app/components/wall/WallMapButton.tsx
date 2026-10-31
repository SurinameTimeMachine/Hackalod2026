'use client';

import { useState } from 'react';
import type { PersonSelection } from '../PeopleSearch';

type Props = {
  person: PersonSelection['person'];
  endpoint: 'person-places' | 'patient-places';
  onShow: (selection: PersonSelection) => void;
};

export default function WallMapButton({ person, endpoint, onShow }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function showOnMap() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/${endpoint}?id=${person.person_id}`);
      if (!response.ok) throw new Error('Places unavailable');
      const result: { ids: string[]; limited: boolean } = await response.json();
      if (!result.ids.length) {
        setError('Geen plaatsen op de kaart gevonden.');
        return;
      }
      onShow({ person, ids: result.ids, limited: result.limited });
    } catch {
      setError('De plaatsen konden niet worden geladen. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="wall-map-action">
    <button type="button" onClick={() => void showOnMap()} disabled={loading}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15" /></svg>
      {loading ? 'Laden…' : 'Bekijk op de kaart'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
