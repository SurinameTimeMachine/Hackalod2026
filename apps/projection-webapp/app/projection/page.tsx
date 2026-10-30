'use client';

import dynamic from 'next/dynamic';

const ProjectionPage = dynamic(() => import('./ProjectionPage'), {
  ssr: false,
  loading: () => <main style={{ height: '100dvh', background: '#000' }} />,
});

export default function Projection() {
  return <ProjectionPage />;
}
