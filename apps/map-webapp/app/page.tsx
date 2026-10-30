'use client';

import dynamic from 'next/dynamic';

const Landscape = dynamic(() => import('./components/Landscape'), {
  ssr: false,
  loading: () => (
    <main
      style={{
        height: '100dvh',
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
