import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';

type StoryImage = { file: string; width: number; height: number; caption: string; full?: string; displayWidth?: number };
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
};

function StoryFigure({ image, folder, hero = false }: { image: StoryImage; folder: string; hero?: boolean }) {
  const base = `/verhalen-beelden/${folder}/`;
  const picture = <Image src={`${base}${image.file}`} alt={image.caption} width={image.width} height={image.height} sizes={hero ? '(max-width: 767px) 100vw, 1000px' : '(max-width: 767px) 100vw, 664px'} />;
  return <figure className={`story-figure${hero ? ' story-figure-hero' : ''}`} style={image.displayWidth ? { maxWidth: image.displayWidth } : undefined}>
    {image.full ? <a href={`${base}${image.full}`} target="_blank" rel="noreferrer" aria-label={`${image.caption} Bekijk de volledige krantenpagina`}>{picture}</a> : picture}
    <figcaption>{image.caption}{image.full && <> <a href={`${base}${image.full}`} target="_blank" rel="noreferrer">Bekijk de volledige krantenpagina ↗</a></>}</figcaption>
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
      { heading: 'Rotterdam, 9 maart 1866', text: 'Op 9 maart 1866 wordt in Rotterdam Jacobus Carolus van Bochove geboren. Zijn geboortedatum en geboorteplaats staan vermeld in een register dat het Nationaal Archief in Den Haag bewaart.' },
      { heading: 'Soldaat in Paramaribo', text: 'In 1889 duikt zijn naam op in de Surinaamse burgerlijke stand. Bij de aangifte van een geboorte in Paramaribo tekent hij als getuige. Achter zijn naam staat: militair.' },
      { heading: 'De familie Van Zorgen', text: 'De vrouw met wie Jacobus zijn leven zal delen, is Susanna Maria Francina van Zorgen. Haar vader is kleermaker. Haar moeder, Catharina Elisabeth Baank, is geboren op 15 april 1841.' },
      { heading: '14 september 1889, Gravenstraat B 2', text: 'Petronella Lodevica Esther van Zorgen overlijdt op 14 september 1889. Als plaats van overlijden noteert de ambtenaar: Gravenstraat B 2, het Militair Hospitaal.' },
      { heading: 'Een huwelijk, vier kinderen', text: 'Op 25 november 1896 trouwen Jacobus en Susanna in Paramaribo. Bij het huwelijk worden vier kinderen erkend en gewettigd als hun natuurlijke kinderen.' },
      { heading: 'Portier aan de Gravenstraat', text: 'In 1914 staat Jacobus opnieuw als getuige in een akte, dit keer bij een overlijden. Zijn beroep is veranderd: hij is portier bij het Militair Hospitaal.' },
      { heading: 'Gebleven', text: 'Volgens FamilySearch overlijdt Jacobus Carolus van Bochove in 1954, op 88-jarige leeftijd. Hij kwam als militair, trouwde met een vrouw uit Paramaribo en bleef.' },
    ],
  },
  'door-dezelfde-poort': {
    category: 'Familiegeschiedenis · Weeze – Curaçao – Paramaribo · 1682–2023',
    title: <>Door dezelfde <em>poort</em></>,
    subtitle: 'Het verhaal van Steven Walther Coutinho',
    introduction: 'In 2020 zit Steven in de wachtkamer van ’s Lands Hospitaal. Ruim een eeuw eerder stierven daar twee van zijn familieleden en werd er een neefje geboren.',
    sections: [
      { heading: 'Een wachtkamer als beginpunt', text: 'Een bezoek aan het hospitaal wordt het beginpunt voor een familiegeschiedenis.' },
      { heading: 'De Donners', text: '' },
      { heading: 'Vader', text: '' },
      { heading: 'Door dezelfde poort', text: 'Generaties van de familie zijn op verschillende momenten met dezelfde plek verbonden.' },
    ],
  },
} as const;

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = stories[slug as keyof typeof stories];
  if (!story) notFound();
  const visuals = images[slug];
  const chapterNumbers: Record<string, number> = slug === 'door-dezelfde-poort' ? { 'Een wachtkamer als beginpunt': 1, 'De Donners': 4, 'Vader': 5, 'Door dezelfde poort': 7 } : {};
  return <main className="story-page">
    <div className="story-intro"><Link href="/stories" className="story-back">← Alle verhalen</Link><p className="stories-eyebrow">{story.category}</p><h1>{story.title}</h1><h2>{story.subtitle}</h2><p>{story.introduction}</p></div>
    <div className="story-hero"><StoryFigure image={visuals.hero} folder={visuals.folder} hero /></div>
    {story.sections.map((section, index) => section.heading === 'Gebleven' ? <section className="story-ending" key={section.heading}><ChapterImages groups={visuals.chapters[section.heading]} folder={visuals.folder} /><h2>{section.heading}</h2><p>{section.text}</p></section> : <section className="story-section" key={section.heading}><div className="story-section-inner"><div><span className="story-number">{String(chapterNumbers[section.heading] ?? index + 1).padStart(2, '0')}</span><h2>{section.heading}</h2></div><div className="story-section-content">{section.text && <p>{section.text}</p>}<ChapterImages groups={visuals.chapters[section.heading]} folder={visuals.folder} /></div></div></section>)}
    <div className="story-end"><p>Dit verhaal wordt verder aangevuld.</p><Link href="/stories">← Alle verhalen</Link></div>
  </main>;
}
