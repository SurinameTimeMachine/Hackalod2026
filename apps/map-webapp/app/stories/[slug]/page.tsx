import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { StoryText } from '../links';

type StoryImage = { file: string; width: number; height: number; caption: string; full?: string; displayWidth?: number; href?: string };
type ImageGroup = { layout: 'single' | 'portraits' | 'clippings'; items: StoryImage[] };
const images: Record<string, { folder: string; hero: StoryImage; chapters: Record<string, ImageGroup[]> }> = {
  'gekomen-gebleven': {
    folder: '01-gekomen-gebleven',
    hero: { file: '01-familieportret-paramaribo.jpg', width: 1362, height: 530, caption: 'Familieportret, Paramaribo, datum onbekend.' },
    chapters: {
      'Een huwelijk, vier kinderen': [{ layout: 'single', items: [{ file: '02-krant-huwelijk-1896-knipsel.jpg', width: 450, height: 185, displayWidth: 470, caption: 'Rubriek Burgerlijke Stand – Huwelijken, november 1896.', full: '03-krant-huwelijk-1896-hele-pagina.jpg' }] }],
      'Portier aan de Gravenstraat': [{ layout: 'single', items: [{ file: '04-register-regel4-van-bochove.jpg', width: 1328, height: 937, displayWidth: 664, caption: 'Register, regel 4: Jacobus Carolus van Bochove, portier Mil. H.' }] }],
      'Gebleven': [{ layout: 'single', items: [{ file: '05-portret-jacobus.jpg', width: 520, height: 529, displayWidth: 260, caption: 'Vermoedelijk Jacobus Carolus van Bochove op latere leeftijd.' }] }],
    },
  },
  'door-dezelfde-poort': {
    folder: '02-door-dezelfde-poort',
    hero: { file: '01-groepsfoto-vervuurt-donner.jpg', width: 604, height: 408, caption: 'Familie Vervuurt en Donner, circa 1915–1917.' },
    chapters: {
      'De Donners': [{ layout: 'portraits', items: [
        { file: '02-donner-en-naharen.jpg', width: 678, height: 462, caption: 'J.W.A. Donner en Elmina Albertina Naharen.' },
        { file: '03-paul-donner-geschilderd.jpg', width: 592, height: 880, caption: 'Geschilderd portret van Paul Donner.' },
        { file: '04-antoinette-donner.jpg', width: 664, height: 960, caption: 'Antoinette Donner, moeder van Hilda Louise.' },
      ] }, { layout: 'clippings', items: [
        { file: '05-krant-bevallen-1886.jpg', width: 460, height: 156, caption: 'Rubriek Bevallen, 11 juni 1886.' },
        { file: '06-advertentie-boekhouden.jpg', width: 239, height: 289, caption: 'Advertentie J.W.A. Donner, Gonggrijpstraat.' },
        { file: '07-advertentie-waterverfportretten.jpg', width: 460, height: 277, caption: 'Advertentie Waterverf-Portretten, J.W.H. Donner.' },
        { file: '08-dankbetuiging-1917.jpg', width: 302, height: 265, caption: 'Dankbetuiging na overlijden Elmina, 1 november 1917.' },
      ] }],
      'Vader': [
        { layout: 'single', items: [{ file: '09-vier-portretten-donner.jpg', width: 1328, height: 493, displayWidth: 664, caption: 'Vier portretten uit de familie Donner.' }] },
        { layout: 'single', items: [{ file: '10-jean-donner.jpg', width: 800, height: 1067, displayWidth: 400, caption: 'Jean Donner met John William Donner.' }] },
      ],
    },
  },
  'klerk-marechaussee-boer': {
    folder: '04-klerk-marechaussee-boer',
    hero: { href: 'https://hdl.handle.net/21.12113/06B809D30F104853A7C5DBFDBB34DA6D', file: '01-straatgezicht-middelburg.jpg', width: 1018, height: 632, caption: 'Straatgezicht in Middelburg, negentiende eeuw. Hier werd Johannes Pieter de Graaff op 14 mei 1845 geboren. Zeeuws Archief.' },
    chapters: {
      'Middelburg, 14 mei 1845': [{ layout: 'single', items: [{ href: 'https://www.openarchieven.nl/zar:53A1BDAE-81A0-41B8-90AE-1146F5BDD60C', file: '02-geboorteakte-middelburg-1845.jpg', width: 937, height: 742, displayWidth: 664, caption: 'Geboorteakte van Johannes Pieter de Graaff, Middelburg, 15 mei 1845 (nr. 222). Aangever was de verloskundige Jacobus Johannes Pieterse; de moeder wordt genoemd als weduwe van Boudewijn de Graaff. Zeeuws Archief.' }] }],
      'Kantoorklerk op plantage Waterloo': [{ layout: 'single', items: [{ href: 'http://hdl.handle.net/1887.1/item:808307', file: '03-plantage-waterloo.jpg', width: 600, height: 357, displayWidth: 600, caption: 'Prentbriefkaart “Plantage Waterloo, Suriname, S. Amerika”. Universitaire Bibliotheken Leiden (KITLV), item 808307.' }] }],
      'Marechaussee aan de Saramacca': [{ layout: 'single', items: [{ href: 'http://hdl.handle.net/1887.1/item:925082', file: '04-politiepost-rivier.jpg', width: 600, height: 357, displayWidth: 600, caption: 'Een politiepost aan de rivier. Een foto van marechaussees uit zijn tijd is niet gevonden. Universitaire Bibliotheken Leiden (KITLV), item 925082.' }] }],
      'Weduwnaar en landbouwer': [{ layout: 'single', items: [{ href: 'https://commons.wikimedia.org/wiki/File:Tropenmuseum_Royal_Tropical_Institute_Objectnumber_60006571_Boeren_kolonisatie_in_Suriname._Rijsd.jpg', file: '05-boeroe-echtpaar.jpg', width: 960, height: 769, displayWidth: 480, caption: 'Een boeroe-echtpaar voor hun houten huis. Dit zijn niet De Graaff en zijn vrouw, maar leden van een andere boerenfamilie. Tropenmuseum, objectnummer 60006571, via Wikimedia Commons.' }] }],
      '24 juli 1907, Gravenstraat B 2': [{ layout: 'single', items: [{ href: 'https://www.nationaalarchief.nl/onderzoeken/archief/2.10.61/invnr/@1117/file/NL-HaNA_2.10.61_1117_0174', file: '06-overlijdensakte-1907.jpg', width: 1100, height: 1679, displayWidth: 550, caption: 'Overlijdensakte van Johannes Pieter de Graaff, Paramaribo, 24 juli 1907 (folio 775). Aangever Joseph van de Winkel, administrateur van het Militair Hospitaal. Nationaal Archief Suriname 2.10.61, inv. 1117, scan 0174.' }] }],
    },
  },
  'geboren-in-het-hospitaal': {
    folder: '05-geboren-in-het-hospitaal',
    hero: { href: 'https://www.rijksmuseum.nl/nl/collectie/object/Jodenbreestraat-in-Paramaribo--ad00791191eab7a2ebd2391a9e786967', file: '01-jodenbreestraat.jpg', width: 1400, height: 839, caption: 'De Jodenbreestraat in Paramaribo, waar June-Tjauw Won-Ton-Tja in 1880 werd geboren. Rijksmuseum.' },
    chapters: {
      'Een huwelijk aan huis, 1907': [{ layout: 'single', items: [
        { file: '02-huwelijksakte-1907-nr161.jpg', width: 1600, height: 1296, displayWidth: 664, caption: 'Huwelijksakte nr. 161, Paramaribo, september 1907. Omdat de bruid ziek was, werd het huwelijk gesloten in het huis aan de Saramaccastraat, letter E nummer 21.' },
        { file: '03-huwelijksakte-1907-handtekeningen.jpg', width: 1600, height: 1282, displayWidth: 664, caption: 'Het slot van de akte, met de handtekening “J. T. Won Ton Tja”. De bruidegom en de vader van de bruid verklaarden niet te kunnen schrijven; de akte werd voor hen in het Chinees vertolkt.' },
      ] }],
      'Vijf kinderen': [{ layout: 'single', items: [{ href: 'https://commons.wikimedia.org/wiki/File:Het_zendingsdorp_Ephrata_aan_de_Cotticarivier,_Suriname._-_Collectie_stichting_Nationaal_Museum_van_Wereldculturen_-_TM-60007145.jpg', file: '04-ephrata-cottica.jpg', width: 800, height: 540, displayWidth: 664, caption: 'Het zendingsdorp Ephrata aan de Cotticarivier, waar Cornelis Richenel in 1914 werd geboren. Nationaal Museum van Wereldculturen, TM-60007145, via Wikimedia Commons.' }] }],
    },
  },
  'vrij-sinds-1836': {
    folder: '03-vrij-sinds-1836',
    hero: { href: 'https://commons.wikimedia.org/wiki/File:De_Zwartenhovenbrugstraat_in_Paramaribo,_Bestanddeelnr_252-4935.jpg', file: '01-zwartenhovenbrugstraat-1955.jpg', width: 1280, height: 730, caption: 'De Zwartenhovenbrugstraat in 1955. Het familiehuis stond hier op erf E 218. Foto: Nationaal Archief, bestanddeelnr. 252-4935, via Wikimedia Commons.' },
    chapters: {
      'Vrij geworden, 17 februari 1836': [{ layout: 'single', items: [{ href: 'https://resolver.kb.nl/resolve?urn=ddd:010670226:mpeg21:a0002', file: '02-krant-vrijlating-1835.jpg', width: 447, height: 199, displayWidth: 447, caption: 'Het vrijlatingsverzoek voor “de Slaven Jantje, Doris, Charles en Christiana”, Surinaamsche Courant, 18 april 1835 (Delpher).' }] }],
      'Een erf aan de Zwartenhovenbrugstraat': [{ layout: 'single', items: [{ href: 'https://www.nationaalarchief.nl/onderzoeken/archief/1.05.08.01/invnr/663/file/NL-HaNA_1.05.08.01_663_0451', file: '03-wijkregister-1839.jpg', width: 1600, height: 1059, displayWidth: 664, caption: 'Wijkregister 1839, Zwartenhovenbrugstraat. Christiana Biervliet is de op een na onderste naam; erboven staan Amelia van Leesten en leden van de familie Boschman. Nationaal Archief 1.05.08.01, inv. 663, scan 0451.' }] }],
      'Bezitters van mensen': [{ layout: 'single', items: [{ file: '04-slavenregister-folio-2203.jpg', width: 1600, height: 1219, displayWidth: 664, caption: 'Slavenregister, folio 2203: de minderjarige kinderen Van Leesten en Biervliet, onder wie Henriëtte Floortje Biervliet, als eigenaars van Jan, Charles, Lambertus, Adriaan en Marianna, op 3 april 1850 gekocht van C.H. Boschman. Van het emancipatieregister zijn geen scans.' }] }],
      'Gouddelver tussen twee tochten': [{ layout: 'single', items: [{ href: 'https://www.rijksmuseum.nl/nl/collectie/object/NG-2009-131-23--cda4a4d3f781a9c83d1160f5c23cda70', file: '05-goudplacer-1905-1910.jpg', width: 1000, height: 1273, displayWidth: 500, caption: 'Goudwasserij op een placer en arbeiders die een spoorweg graven, Suriname, 1905–1910. Fotograaf onbekend. Rijksmuseum, NG-2009-131-23, publiek domein.' }] }],
      'Twee keer in het hospitaal, 1921': [{ layout: 'single', items: [{ href: 'https://resolver.kb.nl/resolve?urn=ddd:011217294:mpeg21:a0047', file: '06-overlijdensbericht-1922.jpg', width: 412, height: 334, displayWidth: 412, caption: 'Rubriek Overleden, De Surinamer, 22 januari 1922: “12 Jan. … Biervliet, Michel J. 51 j.” (Delpher).' }] }],
    },
  },
};

function StoryFigure({ image, folder, hero = false }: { image: StoryImage; folder: string; hero?: boolean }) {
  const base = `/verhalen-beelden/${folder}/`;
  const picture = <Image src={`${base}${image.file}`} alt={image.caption} width={image.width} height={image.height} sizes={hero ? '(max-width: 767px) 100vw, 1000px' : '(max-width: 767px) 100vw, 664px'} />;
  return <figure className={`story-figure${hero ? ' story-figure-hero' : ''}`} style={image.displayWidth ? { maxWidth: image.displayWidth } : undefined}>
    {image.full ? <a href={`${base}${image.full}`} target="_blank" rel="noreferrer" aria-label={`${image.caption} Bekijk de volledige krantenpagina`}>{picture}</a>
      : image.href ? <a href={image.href} target="_blank" rel="noreferrer" aria-label={`${image.caption} Bekijk de bron`}>{picture}</a> : picture}
    <figcaption>{image.caption}{image.full && <> <a href={`${base}${image.full}`} target="_blank" rel="noreferrer">Bekijk de volledige krantenpagina ↗</a></>}{image.href && <> <a href={image.href} target="_blank" rel="noreferrer">Bekijk de bron ↗</a></>}</figcaption>
  </figure>;
}

function ChapterImages({ groups, folder }: { groups?: ImageGroup[]; folder: string }) {
  return groups?.map((group, index) => <div className={`story-figures story-figures-${group.layout}`} key={`${group.layout}-${index}`}>
    {group.items.map(image => <StoryFigure key={image.file} image={image} folder={folder} />)}
  </div>);
}

const stories = {
  'gekomen-gebleven': {
    category: 'Familiegeschiedenis · Rotterdam – Paramaribo · 1841–1954',
    title: <>Gekomen, <em>gebleven</em></>,
    subtitle: 'Het leven van Jacobus Carolus van Bochove',
    introduction: 'Hij werd in 1866 in Rotterdam geboren en kwam als soldaat naar Suriname. In Paramaribo trouwde hij met Susanna van Zorgen, met wie hij toen al vier kinderen had. Hij ging nooit meer terug. Een reconstructie aan de hand van akten uit Nederlandse en Surinaamse archieven.',
    sections: [
      { heading: 'Rotterdam, 9 maart 1866', text: 'Op 9 maart 1866 wordt in Rotterdam [Jacobus Carolus van Bochove](p:629316) geboren. Zijn geboortedatum en geboorteplaats staan vermeld in een register dat het Nationaal Archief in Den Haag bewaart.' },
      { heading: 'Soldaat in Paramaribo', text: 'In 1889 duikt zijn naam op in de Surinaamse burgerlijke stand. Bij de aangifte van een geboorte in Paramaribo tekent hij als getuige. Achter zijn naam staat: militair.' },
      { heading: 'De familie Van Zorgen', text: 'De vrouw met wie Jacobus zijn leven zal delen, is [Susanna Maria Francina van Zorgen](p:629315). Haar vader is kleermaker. Haar moeder, [Catharina Elisabeth Baank](p:481266), is geboren op 15 april 1841.' },
      { heading: '14 september 1889, Gravenstraat B 2', text: '[Petronella Lodevica Esther van Zorgen](p:150549) overlijdt op 14 september 1889. Als plaats van overlijden noteert de ambtenaar: [Gravenstraat B 2, het Militair Hospitaal](g:stm-1885-address-0327).' },
      { heading: 'Een huwelijk, vier kinderen', text: 'Op 25 november 1896 trouwen Jacobus en Susanna in [Paramaribo](g:stm-06330). Bij het huwelijk worden vier kinderen erkend en gewettigd als hun natuurlijke kinderen.' },
      { heading: 'Portier aan de Gravenstraat', text: 'In 1914 staat Jacobus opnieuw als getuige in een akte, dit keer bij een overlijden. Zijn beroep is veranderd: hij is portier bij het Militair Hospitaal.' },
      { heading: 'Gebleven', text: 'Volgens FamilySearch overlijdt Jacobus Carolus van Bochove in 1954, op 88-jarige leeftijd. Hij kwam als militair, trouwde met een vrouw uit Paramaribo en bleef.' },
    ],
  },
  'door-dezelfde-poort': {
    category: 'Familiegeschiedenis · Weeze – Curaçao – Paramaribo · 1682–2023',
    title: <>Door dezelfde <em>poort</em></>,
    subtitle: 'Het verhaal van Steven Walther Coutinho',
    introduction: 'In 2020 zit Steven in de wachtkamer van [’s Lands Hospitaal](g:stm-1885-address-0327). Ruim een eeuw eerder stierven daar twee van zijn familieleden en werd er een neefje geboren.',
    sections: [
      { heading: 'Een wachtkamer als beginpunt', text: 'Een bezoek aan het hospitaal wordt het beginpunt voor een familiegeschiedenis.' },
      { heading: 'De Donners', text: '' },
      { heading: 'Vader', text: '' },
      { heading: 'Door dezelfde poort', text: 'Generaties van de familie zijn op verschillende momenten met dezelfde plek verbonden.' },
    ],
  },
  'klerk-marechaussee-boer': {
    category: 'Familiegeschiedenis · Middelburg – Paramaribo · 1845–1907',
    title: <>Klerk, marechaussee, <em>boer</em></>,
    subtitle: 'Het leven van Johannes Pieter de Graaff',
    introduction: 'Hij werd in 1845 in Middelburg geboren, twee maanden na de dood van zijn vader. In Suriname was hij kantoorklerk op een plantage in Nickerie, marechaussee aan de Saramacca en daarna landbouwer in de Tweede Buitenwijk. Hij trouwde twee keer in een Nederlandse boerenfamilie en stierf in 1907 in het [Militair Hospitaal](g:stm-1885-address-0327). Zestien akten vertellen zijn verhaal.',
    sections: [
      { heading: 'Middelburg, 14 mei 1845', text: [
        '[Johannes Pieter](p:274243) was de jongste van een arbeidersgezin. Zijn vader, de dagloner Boudewijn de Graaff, overleed op 18 maart 1845, twee maanden voor zijn geboorte. Zijn moeder Jacomijntje Adriaanse uit Goes was dienstbode en later werkvrouw. Van haar kinderen, geboren tussen 1832 en 1845, stierven er meerdere jong.',
        'Jacomijntje overleed op 11 februari 1864 in het Gasthuis van Middelburg. Johannes Pieter was toen achttien. Wanneer hij naar Suriname vertrok, staat in geen enkele bron die we nu kennen.',
      ] },
      { heading: 'Kantoorklerk op plantage Waterloo', text: [
        'In 1875 duikt zijn naam voor het eerst op in Suriname. Hij is dertig jaar en kantoorklerk op [plantage Waterloo](g:stm-01345) in Nickerie. Als klerk tekende hij als getuige bij de overlijdensaangiften van arbeiders: [Beekha](p:433620), contractarbeider 1124/B uit Brits-Indië, [Joseph Clarck](p:433668) uit Barbados en [Cornelis Woisk](p:433674).',
        'Zo staat de Zeeuwse klerk in de akten naast mensen die van de andere kant van de wereld naar dezelfde plantage waren gehaald.',
      ] },
      { heading: 'Marechaussee aan de Saramacca', text: [
        'In 1880 is hij marechaussee tweede klasse op het station [Groningen](g:stm-06248) aan de Saramacca, onder brigadier [Meindert Verschuur](p:559374). Tot 1884 noemen de akten hem marechaussee, eerst in Saramacca en daarna in de Tweede Buitenwijk van Paramaribo.',
        'Groningen was ook de plek waar in 1845 boerenkolonisten uit Gelderland en Utrecht aan land waren gegaan. Een van hen was [Evert van der Klift](p:344758), zijn latere schoonvader.',
      ] },
      { heading: 'Een boeroefamilie in de Tweede Buitenwijk', text: [
        'Op 24 augustus 1881 trouwde hij in Paramaribo met de 21-jarige [Cornelia van der Klift](p:161611). Hij kon geen geboorteakte overleggen en verklaarde zijn geboorte onder ede; haar moeder, landbouwster, gaf toestemming. Cornelia’s ouders, Evert van der Klift uit Amerongen en [Jansien Perkementis](p:163846) uit Zwolle, waren boeroes: zij hadden het kolonisatieproject van 1845 overleefd en boerden aan het kanaal naar [Kwatta](g:stm-01948) en de [Wanicastraat](g:stm-street-wanicastraat).',
        'Hun zoon kreeg de namen van beide grootvaders, [Boudewijn Evert Johannes](p:112305). Hij werd geboren op 20 januari 1884 en stierf een maand later, in het familiehuis Tweede Buitenwijk 47. De vader deed zelf aangifte. In 1886 volgde een dochter, [Cornelia Maria](p:606131).',
        'Op 1 mei 1891 overleed Cornelia, dertig jaar oud, in Tweede Buitenwijk 238. Haar moeder Jansien stierf twee maanden later in hetzelfde huis.',
      ] },
      { heading: 'Weduwnaar en landbouwer', text: [
        'Op 18 mei 1893 trouwde hij opnieuw, met [Wilhelmina Velthuizen](p:274247) (46). Ze was een dochter van de boeroe Gerardus Velthuizen en Gijsbertje van den Berg; haar broer [Teunis](p:1917774), landbouwer op [De Drie Gebroeders](g:stm-01933), was getuige. Beide vrouwen van De Graaff kwamen dus uit boeroefamilies. Hij was 48, weduwnaar en landbouwer.',
        'Een half jaar later, op 29 november 1893, trouwde op [plantage Beekhuizen](g:stm-01983) in Beneden-Para de 24-jarige [Willem Gerhardus Lodewijk van Velthuizen](p:1932259). In zijn huwelijksakte staan als ouders Wilhelmina van Velthuizen en “Johannes Pieter de Graaf”, vader, in leven. Als dat klopt, kende De Graaff Wilhelmina al rond 1868, en waren Mathilda (1887) en Willem Gijsbertus (1891) zijn kleinkinderen. Het is de enige bron voor dit vaderschap.',
        'De akten laten ook zijn kring zien: steeds dezelfde buren en boeren tekenen samen als getuige, zoals [Theodorus Hugo Monsanto](p:25488) en de landbouwer [Frederic Fraser](p:120645) van de [Steenbakkersgracht](g:stm-street-steenbakkersgracht).',
      ] },
      { heading: '24 juli 1907, Gravenstraat B 2', text: [
        'Johannes Pieter de Graaff stierf op 24 juli 1907 om één uur ’s nachts “in het huis aan de [Gravenstraat](g:stm-street-gravenstraat) bekend als letter B nummer twee (Militair Hospitaal)”. Hij was 62, landbouwer, en woonde in het district Beneden-Suriname.',
        'Aangifte deed [Joseph van de Winkel](p:266112), de administrateur van het hospitaal. Familie was daar niet bij. Acht jaar later werd zijn kleindochter [Cornelia Henriette](p:751898) in hetzelfde hospitaal geboren.',
      ] },
      { heading: 'Wie er bleef', ending: true, text: [
        'In de volkstelling van 1921 woont zijn dochter Cornelia Maria aan de [Idsingastraat](g:stm-street-van-idsingastraat) met waarschijnlijk haar broer J.J. de Graaff (1882) en haar dochters Johanna Cornelia Maria (1910) en Cornelia Henriette (1915), al onder de naam Van der Erf. Hun vader, de fuselier [Gerardus Henderikus van der Erf](p:343778), had beide meisjes in 1918 samen met Cornelia Maria erkend. Cornelia Maria overleed in 1958 in Paramaribo.',
      ] },
    ],
    sources: 'Bronnen: Zeeuws Archief (geboorte 1845, overlijden vader 1845, huwelijk ouders 1831, overlijden moeder 1864), overlijdens- en geboorteakten Paramaribo (Nationaal Archief Suriname 2.10.61), huwelijksakten 1881 en 1893, erkenning 1918, volkstellingen 1921 en 1950. Redactie: Nisha Marapin en Thunnis van Oort.',
  },
  'geboren-in-het-hospitaal': {
    category: 'Familiegeschiedenis · China – Paramaribo – Commewijne · 1869–1950',
    title: <>Geboren in het <em>hospitaal</em></>,
    subtitle: 'Het gezin van Sjiew-Oe-Joen en June-Tjauw Won-Ton-Tja',
    introduction: 'In de volkstelling van 1921 staat een kind uit het gezin [Sjiew-Oe-Joen](p:712147) als patiënt in ’s Lands Hospitaal. Twee van de kinderen werden er geboren. Het verhaal van een Chinees-Surinaams gezin tussen de Jodenbreestraat, de plantages aan de Commewijne en het hospitaal aan de Gravenstraat.',
    sections: [
      { heading: 'Jodenbreestraat C 87, 25 juni 1880', text: [
        '[June-Tjauw Won-Ton-Tja](p:582445) werd geboren op 25 juni 1880 in de [Jodenbreestraat](g:stm-street-jodenbreestraat), huis C 87, als kind van [Won-Ton-Tja](p:582447), winkelier, en [Ho-Alan](p:264647).',
        'Ho-Alan was in China geboren. Zij overleed op 25 april 1906 in de Tweede Buitenwijk, nummer 90, zestig jaar oud.',
      ] },
      { heading: 'Een huwelijk aan huis, 1907', text: [
        'Sjiew-Oe-Joen en June trouwden in september 1907 in [Paramaribo](g:stm-06330). Hij was 38 jaar en winkelier, geboren in China rond 1869 als zoon van Sjiew Ngie en Tjoeng-Shee. Een geboorteakte kon hij niet overleggen; hij bevestigde zijn verklaring onder ede.',
        'June was ziek. Daarom kwam de ambtenaar naar het huis aan de [Saramaccastraat](g:stm-street-saramaccastraat), letter E nummer 21. Haar vader was erbij en gaf toestemming. Omdat de bruidegom en de vader geen Nederlands spraken, werd de akte voor hen in het Chinees vertolkt.',
      ] },
      { heading: 'Vijf kinderen', text: [
        'Met June-Tjauw Won-Ton-Tja kreeg hij vijf kinderen: [Elize Helena Rosalina Sjiew-Oe-Joen](p:712145), geboren op 21 juni 1908 in Paramaribo; [Celina Anna Marie Won-Ton-Tja](p:721832), geboren op 26 januari 1910 in het [Militair Hospitaal](g:stm-1885-address-0327); [Mathilde Harriette Won-Ton-Tja](p:733076), geboren op 18 december 1911 in Paramaribo; [Cornelis Richenel Sjiew-Oe-Joen](p:1431205), geboren op 30 augustus 1914 in [Ephrata](g:stm-01327) aan de Cottica; en [Emelie](p:786932), geboren op 7 november 1920 in Paramaribo, ook in het Militair Hospitaal.',
        'Bij beide geboorten in het hospitaal deed niet de vader aangifte, maar het hospitaal zelf: in 1910 de administrateur, in 1920 de chef, een officier van gezondheid.',
      ] },
      { heading: 'Een kind bij een ander gezin', text: [
        'Opmerkelijk is dat het paar nog een kind had dat bij de volkstelling niet bij hen inwoonde, maar bij een ander paar, als “niet verwante bestedeling”: [Francis Eleonor Sjiew-Oe-Joen](p:1451372), geboren op 10 september 1916 op [Guadeloupe](g:stm-01255) in Beneden-Commewijne.',
        'Francis is ook te vinden in de volkstelling van 1950. Zij is dan de echtgenote van Kees Dragt; het paar woont aan de Mauritsstraat 16.',
      ] },
      { heading: 'In het hospitaal, 1921', ending: true, text: [
        'In de volkstelling van 1921 woont het gezin op plantage [Johan en Margaretha](g:stm-01253) aan de Commewijne. Op de lijst van ’s Lands Hospitaal staat dan een [M. Sjieuw Oe Joen](p:1450781), geboren in 1912: vrijwel zeker de tienjarige Mathilde Harriette, die ook thuis op de lijst staat.',
      ] },
    ],
    sources: 'Bronnen: geboorteakten Paramaribo 1880, 1908, 1910, 1911 en 1920 en overlijdensakte 1906 (Nationaal Archief Suriname 2.10.61), huwelijksakte nr. 161 Paramaribo 1907, volkstelling 1921 (Nationaal Archief 2.10.19.01, inv. 54, scans 0656 en 0785), lijst van patiënten ’s Lands Hospitaal 1921, volkstelling 1950.',
  },
  'vrij-sinds-1836': {
    category: 'Familiegeschiedenis · Paramaribo · 1835–1922',
    title: <>Vrij sinds <em>1836</em></>,
    subtitle: 'Het leven van Michel Jacob Biervliet',
    introduction: '[Michel Jacob Biervliet](p:546189) stamt uit een vrije familie: zijn grootmoeder [Christiana](p:831685) werd al op 17 februari 1836 vrijgemaakt en kreeg toen de naam Biervliet, 27 jaar vóór de afschaffing van de slavernij in 1863, maar de daadwerkelijke onafhankelijkheid en het einde van gedwongen arbeid kwamen pas in 1 juli 1873. Haar kleinzoon Michel Jacob was gouddelver en stoker in Paramaribo. In de volkstelling van 1921 staat hij twee keer in het [Militair Hospitaal](g:stm-1885-address-0327), kort voor zijn dood.',
    sections: [
      { heading: 'Vrij geworden, 17 februari 1836', text: [
        'In april 1835 vroeg F. Bothe, liquidateur van de opgeheven firma Bothe en Fuchs, namens de erven van Johann Gottlieb Schubert de vrijlating aan van “de Slaven Jantje, Doris, Charles en Christiana”. De firma had Christiana kort daarvoor gekocht uit de boedel van H. Jacobs.',
        'Op 17 februari 1836 staat bij haar naam in het slavenregister: “vrij geworden en heet C Biervliet” (inv. 43, folio 5236). Haar zoon uit 1841 kreeg de naam Schubert Andreas, vrijwel zeker naar de overleden eigenaar.',
      ] },
      { heading: 'Een erf aan de Zwartenhovenbrugstraat', text: [
        'In het wijkregister van 1839 staat Christiana als “kleurling”, hervormd, aan de [Zwartenhovenbrugstraat](g:stm-street-zwartenhovenbrugstraat). Ze kreeg tussen 1837 en 1850 zeven kinderen. Bij drie van hen deed [Charles Hendrik Boschman](p:478243) de aangifte; hij werd later hun voogd. Of hij de vader was, zeggen de akten niet.',
        'In 1841 kochten Christiana en [Amelia van Leesten](p:831682), zelf vrijgelaten in 1833, voor hun minderjarige kinderen het erf Zwartenhovenbrugstraat E 218. Daar zou Christiana’s dochter Floortje later haar kinderen krijgen.',
      ] },
      { heading: 'Bezitters van mensen', text: [
        'Vrij zijn betekende in deze familie ook: eigenaar worden. In 1850 kochten de minderjarige kinderen Van Leesten en Biervliet vijf mensen van C.H. Boschman: Charles, Adriaan, Marjanna, Lambertus en Jan. Een van de kopers op papier was [H.F. Biervliet](p:485062), Michels moeder, toen zes jaar oud.',
        'Lambertus werd in 1855 verkocht en verdronk in 1859. Adriaan werd in 1857 verkocht en vluchtte in 1861. [Marianna](p:35967) en haar dochters werden op 1 juli 1863 vrij onder de achternaam Bleijenhoop, de naam van de grond van de familie aan het Pad van Wanica.',
      ] },
      { heading: 'Floortje en haar zonen', text: [
        '[Henriette Floortje Biervliet](p:485062), geboren in 1843, trouwde nooit. Ze kreeg vijf zonen in het huis aan de Zwartenhovenbrugstraat; geen enkele akte noemt een vader. De tweeling uit 1869 heette [Michel Jacob](p:541635) en Christiaan Charles. Michel Jacob stierf na een maand.',
        'Op 8 november 1870 kreeg Floortje weer een zoon, en hij kreeg dezelfde naam: Michel Jacob. Zijn oom [Willem](p:546176), twintig jaar en letterzetter, deed aangifte.',
        'Toen Floortje in 1890 stierf, plaatsten haar broers J.H. en W. Biervliet “mede voor de overige familie” een dankbetuiging voor “onze zuster Henriette Floortje” (De West-Indiër, 6 april 1890).',
      ] },
      { heading: 'Gouddelver tussen twee tochten', text: [
        'Michel Jacob woonde zijn hele leven in de oude binnenstad: de [Koningsstraat](g:stm-street-koningstraat), de [Prinsenstraat](g:stm-street-prinsenstraat), de [Pontewerfstraat](g:stm-street-pontewerfstraat), de [Weidestraat](g:stm-street-weidestraat). In de akten is hij gouddelver, in 1904 stoker en in 1917 kok. Nog in 1911 en 1917 was hij getuige bij een erkenning.',
        'Hij tekende vaak als getuige, en meestal samen met andere gouddelvers: in 1903 zetten drie gouddelvers samen hun naam onder één akte. Dat past bij mannen die tussen twee tochten naar het binnenland in de stad waren. Zijn jongere broer [Marius](p:193252) stierf in 1895 als achttienjarige zeeman in Boven-Saramacca, een goudgebied.',
      ] },
      { heading: 'Twee keer in het hospitaal, 1921', text: [
        'In de volkstelling van 1921 staat Michel drie keer. Thuis woont hij alleen, aan de [Rust en Vredestraat](g:stm-street-rust-en-vredestraat). Daarnaast staan een “M.J. Biervliet” en een “M. Biervliet, geb. 1872” op de lijst van het Militair Hospitaal.',
        'Dat hij die patiënt is, is aannemelijk maar niet zeker: het geboortejaar wijkt twee jaar af, wat in deze telling vaker gebeurt. Ruim drie maanden later, op 12 januari 1922, stierf hij in Paramaribo, 51 jaar oud. Waar precies, weten we nog niet.',
        'De familie bleef het hospitaal kennen: zijn nicht [Johanna Charlotte Wilhelmina](p:594469) kreeg er drie kinderen, en ook een [Salvador Christiaan Biervliet](p:776466) liet er tussen 1919 en 1921 drie kinderen geboren worden.',
      ] },
      { heading: 'Waarom Biervliet?', ending: true, text: [
        'Geen bron zegt waarom Christiana in 1836 de naam Biervliet kreeg. Het Zeeuws-Vlaamse stadje ligt voor de hand, maar de mensen rond haar vrijlating, Schubert, Bothe, Fuchs en Forster in Leipzig, wijzen eerder naar Duitsland. Het vrijlatingsrekest in de Gouvernementssecretarie kan het antwoord bevatten.',
      ] },
    ],
    sources: 'Bronnen: slaven- en emancipatieregisters, wijkregisters 1835 en 1839, geboorte- en overlijdensakten (Nationaal Archief Suriname 2.10.61), erkenningen 1911 en 1917, volkstelling 1921 (ids 40639, 40640, 40645), Surinaamsche Courant 1835, 1841 en 1865, De West-Indiër 1864, 1869 en 1890, De Surinamer 22-01-1922 (Delpher). Redactie: Nisha Marapin en Thunnis van Oort.',
  },
} as const;

// A section's text is one paragraph or a list of paragraphs.
function paragraphs(text: string | readonly string[]) {
  return (typeof text === 'string' ? [text] : text).filter(Boolean);
}

// Every story is known at build time, so each story page can be prerendered. The page waits for its
// params (no streaming shell), so an unknown slug answers with a real 404 status.
export const instant = false;

export function generateStaticParams() {
  return Object.keys(stories).map(slug => ({ slug }));
}


export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = stories[slug as keyof typeof stories];
  if (!story) notFound();
  const visuals = images[slug];
  const chapterNumbers: Record<string, number> = slug === 'door-dezelfde-poort' ? { 'Een wachtkamer als beginpunt': 1, 'De Donners': 4, 'Vader': 5, 'Door dezelfde poort': 7 } : {};
  return <main className="story-page">
    <div className="story-intro"><Link href="/stories" className="story-back">← Alle verhalen</Link><p className="stories-eyebrow">{story.category}</p><h1>{story.title}</h1><h2>{story.subtitle}</h2><p><StoryText text={story.introduction} /></p></div>
    <div className="story-hero"><StoryFigure image={visuals.hero} folder={visuals.folder} hero /></div>
    {story.sections.map((section, index) => (section.heading === 'Gebleven' || ('ending' in section && section.ending)) ? <section className="story-ending" key={section.heading}><ChapterImages groups={visuals.chapters[section.heading]} folder={visuals.folder} /><h2>{section.heading}</h2>{paragraphs(section.text).map(text => <p key={text}><StoryText text={text} /></p>)}</section> : <section className="story-section" key={section.heading}><div className="story-section-inner"><div><span className="story-number">{String(chapterNumbers[section.heading] ?? index + 1).padStart(2, '0')}</span><h2>{section.heading}</h2></div><div className="story-section-content">{paragraphs(section.text).map(text => <p key={text}><StoryText text={text} /></p>)}<ChapterImages groups={visuals.chapters[section.heading]} folder={visuals.folder} /></div></div></section>)}
    <div className="story-end">{'sources' in story ? <p>{story.sources}</p> : <p>Dit verhaal wordt verder aangevuld.</p>}<Link href="/stories">← Alle verhalen</Link></div>
  </main>;
}
