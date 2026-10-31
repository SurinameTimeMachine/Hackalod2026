import Link from 'next/link';
import Image from 'next/image';

const stories = [
  { slug: 'gekomen-gebleven', image: '/verhalen-beelden/01-gekomen-gebleven/01-familieportret-paramaribo.jpg', alt: 'Familieportret in Paramaribo, datum onbekend', eyebrow: 'Familiegeschiedenis · Rotterdam – Paramaribo · 1841–1954', title: <>Gekomen, <em>gebleven</em></>, subtitle: 'Het leven van Jacobus Carolus van Bochove', description: 'Hij werd in 1866 in Rotterdam geboren en kwam als soldaat naar Suriname. Hij trouwde met Susanna van Zorgen, werd portier bij het Militair Hospitaal en ging nooit meer terug.', tags: ['Portier', 'Militair', '1866–1954'] },
  { slug: 'door-dezelfde-poort', image: '/verhalen-beelden/02-door-dezelfde-poort/01-groepsfoto-vervuurt-donner.jpg', alt: 'Familie Vervuurt en Donner, circa 1915–1917', eyebrow: 'Familiegeschiedenis · Weeze – Curaçao – Paramaribo · 1682–2023', title: <>Door dezelfde <em>poort</em></>, subtitle: 'Het verhaal van Steven Walther Coutinho', description: 'In 2020 zit Steven in de wachtkamer van ’s Lands Hospitaal. Ruim een eeuw eerder stierven daar twee van zijn familieleden en werd er een neefje geboren.', tags: ['Vervuurt · Donner', 'Coutinho', '1907 · 1912 · 1914'] },
  { slug: 'vrij-sinds-1836', image: '/verhalen-beelden/03-vrij-sinds-1836/01-zwartenhovenbrugstraat-1955.jpg', alt: 'De Zwartenhovenbrugstraat in Paramaribo, 1955', eyebrow: 'Familiegeschiedenis · Paramaribo · 1835–1922', title: <>Vrij sinds <em>1836</em></>, subtitle: 'Het leven van Michel Jacob Biervliet', description: 'Zijn grootmoeder Christiana werd in 1836 vrijgemaakt en heette voortaan Biervliet. Haar kleinzoon was gouddelver in Paramaribo en staat in 1921 twee keer in het Militair Hospitaal.', tags: ['Gouddelver', 'Vrijlating 1836', '1870–1922'] },
];

const imageSizes: Record<string, [number, number]> = { 'gekomen-gebleven': [1362, 530], 'door-dezelfde-poort': [604, 408], 'vrij-sinds-1836': [1280, 730] };

export default function StoriesPage() {
  return <main className="stories-page"><div className="stories-inner">
    <p className="stories-eyebrow">Verhalen · ’s Lands Hospitaal</p>
    <h1>Wie ging hier door de poort?</h1>
    <p className="stories-intro">Achter elk lichtje op de kaart zit een mens. Soms weten we alleen een naam en een jaartal. Soms reconstrueren familie en onderzoekers een leven aan de hand van akten, kranten en foto’s.</p>
    <div className="stories-count"><strong>{stories.length}</strong> verhalen</div>
    <div className="stories-grid">{stories.map(story => <article className="story-card" key={story.slug}>
      <Link href={`/stories/${story.slug}`} className="story-card-art" aria-label={`Lees ${story.subtitle}`}><Image src={story.image} alt={story.alt} width={imageSizes[story.slug]?.[0] ?? 604} height={imageSizes[story.slug]?.[1] ?? 408} sizes="(max-width: 767px) 100vw, 532px" /></Link>
      <div className="story-card-body"><p className="stories-eyebrow">{story.eyebrow}</p><h2>{story.title}</h2><h3>{story.subtitle}</h3><p>{story.description}</p>
        <div className="story-tags">{story.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <Link href={`/stories/${story.slug}`} className="story-read">Lees het verhaal <span aria-hidden="true">→</span></Link>
      </div>
    </article>)}</div>
  </div></main>;
}
