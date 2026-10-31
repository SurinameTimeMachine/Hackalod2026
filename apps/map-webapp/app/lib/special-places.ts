import type { PeopleCluster } from './people-data';

type SpecialPlace = { id: string; label: string; coordinates: [number, number]; file: string; gazetteerIds?: string[] };

// These landmark coordinates come from the supplied image filenames. Only
// explicitly identified gazetteer records are linked to existing wall data.
export const specialPlaces: SpecialPlace[] = [
  { id: 'special-01', label: 'Fort Zeelandia', coordinates: [-55.1495, 5.8273], file: '01_fort-zeelandia_lon-55.1495_lat5.8273', gazetteerIds: ['stm-06480'] },
  { id: 'special-02', label: 'Presidentieel Paleis', coordinates: [-55.1527, 5.8268], file: '02_presidentieel-paleis_lon-55.1527_lat5.8268' },
  { id: 'special-03', label: 'Ministerie van Financiën', coordinates: [-55.1517, 5.8257], file: '03_ministerie-van-financien_lon-55.1517_lat5.8257' },
  { id: 'special-04', label: 'Sint-Petrus-en-Pauluskathedraal', coordinates: [-55.1532, 5.8300], file: '04_sint-petrus-en-pauluskathedraal_lon-55.1532_lat5.8300' },
  { id: 'special-05', label: 'Centrumkerk', coordinates: [-55.1530, 5.8253], file: '05_centrumkerk_lon-55.1530_lat5.8253' },
  { id: 'special-06', label: 'Keizerstraat: moskee en synagoge', coordinates: [-55.1585, 5.8278], file: '06_keizerstraat-moskee-synagoge_lon-55.1585_lat5.8278' },
  { id: 'special-07', label: 'Huizen aan de Waterkant', coordinates: [-55.1565, 5.8250], file: '07_huizen-aan-de-waterkant_lon-55.1565_lat5.8250' },
  { id: 'special-08', label: 'De Waag', coordinates: [-55.1555, 5.8258], file: '08_de-waag_lon-55.1555_lat5.8258' },
  { id: 'special-09', label: 'Elisabeth Samson Huis', coordinates: [-55.1510, 5.8279], file: '09_elisabeth-samson-huis_lon-55.1510_lat5.8279' },
  { id: 'special-10', label: 'Plantage Frederiksdorp', coordinates: [-54.9890, 5.8640], file: '10_plantage-frederiksdorp_lon-54.9890_lat5.8640', gazetteerIds: ['stm-01254'] },
  { id: 'special-11', label: 'Fort Nieuw Amsterdam', coordinates: [-55.0850, 5.8840], file: '11_fort-nieuw-amsterdam_lon-55.0850_lat5.8840' },
  { id: 'special-12', label: 'Jodensavanne en Cassipora', coordinates: [-54.9908, 5.4252], file: '12_jodensavanne-cassipora_lon-54.9908_lat5.4252' },
];

export function specialPlaceForId(id: string) {
  return specialPlaces.find(place => place.id === id || place.gazetteerIds?.includes(id));
}

export function specialPlaceCluster(place: SpecialPlace): PeopleCluster {
  const [lng, lat] = place.coordinates;
  return { id: place.id, uri: null, label: place.label, type: 'place', lat, lng, center: [lng, lat], person_count: 0, radiusMeters: 0, placement: 'gazetteer-point', sizeCapped: false };
}
