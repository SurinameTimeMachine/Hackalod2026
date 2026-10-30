'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHeader() {
  const pathname = usePathname();
  return <header className="site-header">
    <Link href="/" className="site-brand"><span className="site-wordmark">I was here</span><span className="site-brand-subtitle">Suriname Time Machine</span></Link>
    <nav className="site-nav" aria-label="Main navigation">
      <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>Map</Link>
      <Link href="/stories" aria-current={pathname === '/stories' ? 'page' : undefined}>Stories</Link>
    </nav>
  </header>;
}
