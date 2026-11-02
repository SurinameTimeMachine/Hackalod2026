import type { Metadata } from "next";
import { Geist, Geist_Mono, Permanent_Marker, IM_Fell_English, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import SiteHeader from './components/SiteHeader';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const marker = Permanent_Marker({ weight: '400', subsets: ['latin'], variable: '--font-marker' });
const fell = IM_Fell_English({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-fell' });
const plexSans = IBM_Plex_Sans({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-plex-sans' });
const plexSerif = IBM_Plex_Serif({ weight: ['400', '600'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-plex-serif' });

export const metadata: Metadata = {
  title: "I was here · Suriname Time Machine",
  description: "Ontdek mensen en plaatsen in de geschiedenis van Suriname.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} ${marker.variable} ${fell.variable} ${plexSans.variable} ${plexSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SiteHeader />{children}</body>
    </html>
  );
}
