import Link from 'next/link';
import type { ReactNode } from 'react';

// People and places named in the stories, linked to the map page.
// In story text, write [shown words](p:<person_id>) for a person or [shown words](g:<place id>) for a place.
// A person opens on the map with the places of that record; a place opens at its point.

const people: Record<string, { name: string; year: number }> = {
  // Gekomen, gebleven
  '629316': { name: 'Jacobus Carolus van Bochove', year: 1891 },
  '629315': { name: 'Susanna Francina Maria van Zorgen', year: 1891 },
  '481266': { name: 'Catharina Elisabeth Baank', year: 1841 },
  '150549': { name: 'Petronella Lodevica Esther van Zorgen', year: 1889 },
  // Vrij sinds 1836
  '831685': { name: 'Christiana Biervliet', year: 1839 },
  '478243': { name: 'Charles Hendrik Boschman', year: 1839 },
  '831682': { name: 'Amelia van Leesten', year: 1839 },
  '485062': { name: 'Henriette Floortje Biervliet', year: 1843 },
  '546189': { name: 'Michel Jacob Biervliet', year: 1870 },
  '541635': { name: 'Michel Jacob Biervliet', year: 1869 },
  '546176': { name: 'Willem Charles Eduard Biervliet', year: 1870 },
  '193252': { name: 'Marius Petrus Biervliet', year: 1895 },
  '35967': { name: 'Marianna Bleijenhoop', year: 1865 },
  '594469': { name: 'Johanna Charlotte Wilhelmina Biervliet', year: 1884 },
  '776466': { name: 'Salvador Christiaan Biervliet', year: 1919 },
  // Klerk, marechaussee, boer
  '274243': { name: 'Johannes Pieter de Graaff', year: 1907 },
  '433620': { name: 'Beekha 1124/B', year: 1875 },
  '433668': { name: 'Joseph Clarck', year: 1875 },
  '433674': { name: 'Cornelis Woisk', year: 1875 },
  '559374': { name: 'Meindert Verschuur', year: 1874 },
  '161611': { name: 'Cornelia van der Klift', year: 1891 },
  '163846': { name: 'Jansien Perkementis', year: 1891 },
  '112305': { name: 'Boudewijn Evert Johannes de Graaff', year: 1884 },
  '606131': { name: 'Cornelia Maria de Graaff', year: 1886 },
  '274247': { name: 'Willemina Velthuizen', year: 1907 },
  '1917774': { name: 'Teunis Velthuizen', year: 1893 },
  '1932259': { name: 'Willem Gerhardus Lodewijk van Velthuizen', year: 1893 },
  '120645': { name: 'Frederic Fraser', year: 1885 },
  '25488': { name: 'Theodorus Hugo Monsanto', year: 1864 },
  '266112': { name: 'Joseph van de Winkel', year: 1906 },
  '751898': { name: 'Cornelia Henriette de Graaff', year: 1915 },
  '343778': { name: 'Gerardus Hendricus van der Erf', year: 1915 },
};

const places: Record<string, { label: string; lat: number; lng: number }> = {
  'stm-06330': { label: 'Paramaribo', lat: 5.82392031098937, lng: -55.151778467090274 },
  'stm-1885-address-0327': { label: 'Militair Hospitaal (Gravenstraat B 2)', lat: 5.830053055211843, lng: -55.15685854195079 },
  'stm-street-gravenstraat': { label: 'Gravenstraat', lat: 5.829492757476289, lng: -55.15619904535643 },
  'stm-street-zwartenhovenbrugstraat': { label: 'Zwartenhovenbrugstraat', lat: 5.820935459045191, lng: -55.16499886114349 },
  'stm-street-koningstraat': { label: 'Koningsstraat', lat: 5.816530308778009, lng: -55.17464593618431 },
  'stm-street-prinsenstraat': { label: 'Prinsenstraat', lat: 5.822856898548826, lng: -55.16486887293921 },
  'stm-street-pontewerfstraat': { label: 'Pontewerfstraat', lat: 5.821453502112584, lng: -55.16813478740604 },
  'stm-street-weidestraat': { label: 'Weidestraat', lat: 5.829145191279888, lng: -55.16479245109176 },
  'stm-street-rust-en-vredestraat': { label: 'Rust en Vredestraat', lat: 5.825845740760882, lng: -55.16706247029309 },
  'stm-street-wanicastraat': { label: 'Wanicastraat', lat: 5.823416711576716, lng: -55.17216302484715 },
  'stm-street-steenbakkersgracht': { label: 'Steenbakkersgracht', lat: 5.826082313865383, lng: -55.16462868296032 },
  'stm-street-van-idsingastraat': { label: 'Van Idsingastraat', lat: 5.835311089514452, lng: -55.175868796029725 },
  'stm-01345': { label: 'Plantage Waterloo (Nickerie)', lat: 5.9190388783333345, lng: -56.974461096666666 },
  'stm-06248': { label: 'Groningen (Saramacca)', lat: 5.794432744286655, lng: -55.47509896683244 },
  'stm-01933': { label: 'De Drie Gebroeders', lat: 5.606249035384615, lng: -55.0678860276923 },
  'stm-01983': { label: 'Beekhuizen', lat: 5.792310880416665, lng: -55.18540075333333 },
  'stm-01948': { label: 'Kwatta', lat: 5.846638741666666, lng: -55.22653475750001 },
};

function href(kind: string, id: string): string | null {
  if (kind === 'p' && people[id]) {
    const { name, year } = people[id];
    return `/?${new URLSearchParams({ person: id, name, year: String(year) })}`;
  }
  if (kind === 'g' && places[id]) {
    const { label, lat, lng } = places[id];
    return `/?${new URLSearchParams({ place: id, label, lat: String(lat), lng: String(lng) })}`;
  }
  return null;
}

const TOKEN = /\[([^\]]+)\]\((p|g):([^)\s]+)\)/g;

// Story text with [words](p:id) / [words](g:id) turned into links to the map.
export function StoryText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, words, kind, id] = match;
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const target = href(kind, id);
    parts.push(target
      ? <Link key={index} href={target} className="story-link" title={kind === 'p' ? 'Bekijk deze persoon op de kaart' : 'Bekijk deze plek op de kaart'}>{words}</Link>
      : words);
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
