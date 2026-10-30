'use client';

import dynamic from 'next/dynamic';

const Landscape = dynamic(() => import('./components/Landscape'), {
  ssr: false,
  loading: () => (
    <main
      style={{
        height: 'calc(100dvh - var(--site-header-height))',
        background: '#101f20',
        color: '#eee8d9',
        padding: 24,
      }}
    >
      Loading landscape…
    </main>
  ),
});

export default function Home() {
  return <Landscape />;
}
