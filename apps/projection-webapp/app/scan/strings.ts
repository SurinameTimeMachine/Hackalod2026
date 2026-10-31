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
  provisional: 'nog niet gekoppeld aan het archief',
  unlinked: 'Nog niet gekoppeld',
  archive: 'Archief',
  notLinked: 'Nog niet gekoppeld. Na je verhaal zoeken we samen de juiste persoon.',
};

export const PICK = {
  title: (name: string) => `Welke ${name} bedoel je?`,
  hint: 'Gevonden in het archief. Kies de persoon over wie je wilt vertellen.',
  unsure: 'Weet ik niet zeker / staat er niet tussen',
  unsureHint: 'Geen probleem: na je verhaal zoeken we verder.',
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
  restore: 'Terugzetten',
  removedToast: 'Weggehaald. Tik op het woord om het terug te zetten.',
  restored: 'Teruggezet.',
  keepRaw: 'Houd zoals verteld',
  choose: 'Kies de juiste uit het archief',
  confirmed: 'bevestigd',
  removed: 'weggehaald',
  micDenied: 'Geen toegang tot de microfoon. Je kunt je verhaal ook typen.',
  failed: 'Er ging iets mis bij het verwerken. Probeer het nog eens.',
  living: 'Mogelijk nog in leven.',
  edit: 'Bewerk',
  reprocess: 'Opnieuw herkennen',
  cancel: 'Annuleren',
  editHint: 'Verbeter de spelling en tik op "Opnieuw herkennen".',
  notStored: 'niet in de dataset',
  notStoredNote: 'Herkend in je verhaal, maar het gaat niet over deze persoon. Het blijft onderdeel van je verhaal.',
  retry: 'Probeer opnieuw',
  narrator: 'de verteller',
  self: 'de persoon zelf',
};

export const TYPE: Record<string, string> = {
  person: 'persoon',
  place: 'plaats',
  date: 'datum',
  occupation: 'beroep',
  relation: 'familie',
  organisation: 'organisatie',
  other: 'overig',
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
  only: 'herkend',
  self: 'zelf',
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

export const ASK = {
  banner: (n: number) => `${n} ${n === 1 ? 'vraag' : 'vragen'} om de juiste personen te vinden`,
  go: 'Help zoeken',
  who: 'Over wie gaat je verhaal?',
  subjectCheck: (n: number) => `Klopt de persoon? ${n} ${n === 1 ? 'archiefstuk past' : 'archiefstukken passen'} bij je verhaal`,
  subjectNone: 'Geen archiefstuk past bij je verhaal · het blijft bij deze naam',
  linkedTo: (label: string) => `Gekoppeld aan ${label}`,
  keptAsTold: 'Zoals verteld bewaard, zonder archiefkoppeling.',
  remaining: (n: number) => `${n} mogelijk in het archief`,
  thanks: 'Dank je! Alles is nagelopen.',
};

// "G.W." + "." reads as "G.W..": end a sentence on a name without doubling.
const end = (name: string) => (name.endsWith('.') ? name : `${name}.`);

export const SAVE = {
  button: 'Opslaan',
  title: 'Vertel over jezelf',
  lede: (name: string) => `Je naam komt bij je verhaal te staan, en jij wordt zelf onderdeel van de dataset, verbonden met ${end(name)}`,
  name: 'Je naam of bijnaam',
  who: (name: string) => `Wie ben jij voor ${name}?`,
  about: 'Over jezelf (mag ook leeg)',
  aboutPlaceholder: 'Bijvoorbeeld waar je woont, of hoe je dit verhaal kent…',
  speak: 'Vertel het',
  stop: 'Stop',
  listening: 'Luistert…',
  transcribing: 'Uitschrijven…',
  publish: 'Mijn verhaal en naam mogen openbaar getoond worden, ook in de open dataset.',
  ai: 'Mijn opname is door een AI-dienst (OpenAI) omgezet in tekst.',
  summary: (rows: number, entities: number) => `Wordt opgeslagen: je verhaal met ${entities} herkende ${entities === 1 ? 'begrip' : 'begrippen'}, ${rows} ${rows === 1 ? 'regel' : 'regels'} in de dataset, en jij als verteller.`,
  saving: 'Opslaan…',
  failed: 'Opslaan lukte niet. Probeer het nog eens.',
  back: 'Terug naar je verhaal',
  fromStory: 'Uit je verhaal: jouw familie',
  missingName: 'Vul je naam of bijnaam in.',
  missingConsent: 'Vink beide vakjes aan om op te slaan.',
};

// "je grootouder": how a told person is related to the narrator.
export const KIN: Record<string, string> = {
  parent: 'ouder',
  child: 'kind',
  sibling: 'broer of zus',
  spouse: 'partner',
  grandparent: 'grootouder',
  grandchild: 'kleinkind',
  friend: 'vriend(in)',
  colleague: 'collega',
  other: 'familie',
};

// The person's relation to the narrator → the narrator's chip for that person.
export const NARRATOR_CHIP_FOR: Record<string, number> = { grandparent: 0, parent: 2, other: 3, sibling: 3, spouse: 3, friend: 4 };

// How the narrator relates to the person (relation_type as in the dataset).
export const NARRATOR_RELATIONS: { label: string; value: string | null }[] = [
  { label: 'Kleinkind', value: 'grandchild' },
  { label: 'Achterkleinkind', value: 'other' },
  { label: 'Kind', value: 'child' },
  { label: 'Andere familie', value: 'other' },
  { label: 'Vriend of kennis', value: 'friend' },
  { label: 'Geen familie', value: null },
];

export const THANKS = {
  title: (name: string) => `Dank je, ${name}!`,
  body: (subject: string) => `Je verhaal is opgeslagen bij ${end(subject)} Het staat nu in de aanvullingen, als "nog niet gecontroleerd".`,
  again: 'Scan nog een naam',
  wall: 'Kijk naar de muur: wat je vertelde verschijnt nu in de sterrenbeelden, en jij staat er zelf bij.',
};
