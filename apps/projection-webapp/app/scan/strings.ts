// All wording of the phone app (Dutch, as in the "I was here" prototype).
// Terminology is still to be checked with Nisha. Also used by the server for
// the labels on the "found" card.

export const APP_NAME = 'I was here';

export const HOME = {
  place: "Paramaribo · Suriname",
  title: 'Achter elke naam zit een verhaal.',
  lede: 'Help mee om iedereen in Suriname met elkaar te verbinden via verhalen. Daarvoor is jouw verhaal nodig.',
  scan: 'Scan de naam',
  type: 'Of typ een naam',
  hint: 'Richt je camera op een naam op de muur.',
};

export const SCAN = {
  title: 'Scan de naam',
  uploading: 'Foto versturen…',
  reading: 'Naam lezen…',
  found: 'Naam herkend. Zoeken in archieven…',
  none: 'Geen naam gevonden. Probeer het nog eens, of typ de naam.',
  retry: 'Opnieuw',
  typePlaceholder: 'Typ de naam die je ziet',
  typeGo: 'Zoeken',
  failed: 'Er ging iets mis. Probeer het nog eens.',
};

export const FOUND = {
  recognised: 'Naam herkend',
  fromSearch: 'Gevonden in het archief',
  ask: 'Wat weet jij over deze persoon?',
  askBody: 'Je hoeft niets te typen. Vertel je verhaal hardop. Namen, plekken en jaartallen worden herkend en verbonden met archieven.',
  prompts: ['Wie was dit voor jou of je familie?', 'Waar woonde of werkte deze persoon?', 'Welke namen, plekken en jaartallen horen bij het verhaal?'],
  start: 'Start met vertellen',
  others: 'Niet de juiste naam?',
  rescan: 'Scan opnieuw',
  loading: 'Archief raadplegen…',
};

export const DICT = {
  storyFor: 'Jouw verhaal bij',
  label: 'Transcript',
  empty: 'Tik op de microfoon en begin met vertellen…',
  listening: 'Luistert… tik om te stoppen',
  transcribing: 'Je verhaal wordt uitgeschreven…',
  extracting: 'Namen, plekken en jaartallen herkennen…',
  done: (n: number) => `Klaar · ${n} ${n === 1 ? 'begrip' : 'begrippen'} herkend`,
  idle: 'Tik op de microfoon om te beginnen',
  typeInstead: 'Typ in plaats daarvan',
  typePlaceholder: 'Schrijf hier wat je weet…',
  typeGo: 'Verwerken',
  again: 'Opnieuw',
  tabFound: 'Gevonden',
  tabData: 'In de dataset',
  foundEmpty: 'Namen, plekken, data en beroepen die je noemt verschijnen hier, met wat er in de bronnen over gevonden is.',
  dataEmpty: 'Zodra je verhaal verwerkt is, zie je hier welke regels het oplevert in de dataset met aanvullingen.',
  dataNote: 'Niets wordt opgeslagen zonder jouw bevestiging. Archiefgegevens worden nooit aangepast; alles komt in de aanvullingen, als "nog niet gecontroleerd".',
  back: '← Terug naar de lijst',
  ok: 'Klopt',
  remove: 'Weghalen',
  keepRaw: 'Houd zoals verteld',
  choose: 'Kies de juiste uit het archief',
  confirmed: 'bevestigd',
  removed: 'weggehaald',
  micDenied: 'Geen toegang tot de microfoon. Je kunt je verhaal ook typen.',
  failed: 'Er ging iets mis bij het verwerken. Probeer het nog eens.',
  living: 'mogelijk nog in leven: wordt niet opgeslagen',
};

export const CATEGORY: Record<string, string> = {
  per: 'persoon',
  pla: 'plaats',
  dat: 'datum',
  rol: 'beroep',
  rel: 'relatie',
  oth: 'overig',
};

export const RELATION: Record<string, string> = {
  parent: 'ouder van',
  child: 'kind van',
  sibling: 'broer/zus van',
  spouse: 'partner van',
  grandparent: 'grootouder van',
  grandchild: 'kleinkind van',
  friend: 'vriend(in) van',
  colleague: 'collega van',
  other: 'verbonden met',
};

export const FIELD: Record<string, string> = {
  occupation: 'beroep',
  birth_year: 'geboortejaar',
  death_year: 'overlijdensjaar',
  religion: 'religie',
  address_text: 'adres',
};

export const BADGE = {
  linked: 'gekoppeld',
  choose: 'kies',
  new: 'nieuw',
};

export const DATASETS: Record<string, string> = {
  '02-death': 'overlijdensakten',
  '03-birth': 'geboorteakten',
  '04-ward-registers': 'wijkregisters',
  '05-slave-emancipation': 'slavenregisters & emancipatie',
  '06-almanakken': 'almanakken',
  '09-volkstelling-1921': 'volkstelling 1921',
  '10-volkstelling-1950': 'volkstelling 1950',
  '11-madeisu': 'Madeisu-contracten',
  '12-migratie-datasets': 'migratieregisters',
  '13-civil': 'burgerlijke stand',
};
export const datasetLabel = (d: string | null | undefined) => (d ? (DATASETS[d] ?? d) : 'archief');

export const FACT = {
  born: 'Geboren',
  was: 'Was hier',
  wasValue: "'s Lands Hospitaal, 1921",
  found: 'Ook in',
  role: 'Rol',
  year: 'Jaar',
  place: 'Plaats',
  source: 'Bron',
};
