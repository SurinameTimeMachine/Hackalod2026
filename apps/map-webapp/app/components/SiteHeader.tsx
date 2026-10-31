'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

function ActiveNavigation() {
  const pathname = usePathname();
  return <Navigation pathname={pathname} />;
}

function Navigation({ pathname }: { pathname?: string }) {
  return <nav className="site-nav" aria-label="Hoofdnavigatie">
      <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>Kaart</Link>
      <Link href="/stories" aria-current={pathname?.startsWith('/stories') ? 'page' : undefined}>Verhalen</Link>
    </nav>;
}

export default function SiteHeader() {
  return <header className="site-header">
    <Link href="/" className="site-brand"><span className="site-wordmark">I was here</span><span className="site-brand-subtitle">Suriname Time Machine</span></Link>
    <Suspense fallback={<Navigation />}><ActiveNavigation /></Suspense>
  </header>;
}
