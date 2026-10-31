import type { Metadata, Viewport } from 'next';
import TrackerApp from './TrackerApp';
import './tracker.css';

export const metadata: Metadata = { title: 'Searchlight tracker' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#000' };

// The phone on the beamer. Nothing here imports the projection's three.js code.
export default function Tracker() {
  return <TrackerApp />;
}
