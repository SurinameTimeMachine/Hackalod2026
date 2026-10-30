import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif, Permanent_Marker } from 'next/font/google';
import './scan.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans' });
const serif = IBM_Plex_Serif({ subsets: ['latin'], weight: ['400', '500'], style: ['normal', 'italic'], variable: '--font-plex-serif' });
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-marker' });

export const metadata: Metadata = { title: 'I was here' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f4ef' };

// The phone app. Nothing here imports the projection's three.js code.
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <div className={`iwh ${sans.variable} ${serif.variable} ${marker.variable}`}>{children}</div>;
}
