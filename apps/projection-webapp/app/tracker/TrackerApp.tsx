'use client';

// The phone taped to the beamer: streams its orientation to POST /pose so the
// projection can turn its virtual camera with the beamer. Raw angles only, no
// three.js, no archive data. iOS needs HTTPS and a tap to allow motion.
import { useEffect, useRef, useState } from 'react';
import type { PosePost, PoseStatus } from '../shared/pose';

const MIN_GAP = 15; // ms between poses: ~60 per second
// More unanswered posts than this: drop the pose. HTTP/2 carries them side
// by side, so with enough in flight the rate does not depend on the round trip.
const MAX_IN_FLIGHT = 8;
const STATUS_EVERY = 250; // ms

type Stats = { rate: number; rtt: number | null; status: PoseStatus | null; online: boolean; angles: [number, number, number] | null };

type DeviceOrientationStatic = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
type WakeLock = { release(): Promise<void> };

export default function TrackerApp() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ rate: 0, rtt: null, status: null, online: false, angles: null });
  const [id] = useState(() => crypto.randomUUID());
  const live = useRef({ sent: 0, inFlight: 0, last: 0, seq: 0, rtt: null as number | null, status: null as PoseStatus | null, fails: 0, angles: null as Stats['angles'] });
  const wake = useRef<WakeLock | null>(null);

  const post = (body: PosePost) => {
    const l = live.current;
    const t0 = performance.now();
    l.inFlight++;
    return fetch('/pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        l.status = (await r.json()) as PoseStatus;
        const rtt = performance.now() - t0;
        l.rtt = l.rtt === null ? rtt : l.rtt * 0.9 + rtt * 0.1;
        l.fails = 0;
      })
      .catch(() => {
        l.fails++;
      })
      .finally(() => l.inFlight--);
  };

  const lockScreen = () => {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } };
    nav.wakeLock
      ?.request('screen')
      .then((w) => (wake.current = w))
      .catch(() => {});
  };

  const start = async () => {
    setError(null);
    const DOE = window.DeviceOrientationEvent as DeviceOrientationStatic | undefined;
    if (!DOE) return setError('No motion sensors in this browser');
    if (!window.isSecureContext) return setError('Needs HTTPS (open the tunnel URL)');
    if (typeof DOE.requestPermission === 'function') {
      const answer = await DOE.requestPermission().catch(() => 'denied');
      if (answer !== 'granted') return setError('Motion access denied');
    }
    lockScreen();
    setRunning(true);
  };

  // Stream while running. Fetch keeps the connection alive by itself, so a
  // dropped network just shows up as failed posts until it is back.
  useEffect(() => {
    if (!running) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      const l = live.current;
      l.angles = [e.alpha, e.beta, e.gamma];
      const now = performance.now();
      if (now - l.last < MIN_GAP || l.inFlight >= MAX_IN_FLIGHT) return;
      l.last = now;
      l.sent++;
      post({ type: 'pose', id, alpha: e.alpha, beta: e.beta, gamma: e.gamma, t: Date.now(), seq: ++l.seq });
    };
    window.addEventListener('deviceorientation', onOrientation);
    const onVisible = () => {
      if (document.visibilityState === 'visible') lockScreen();
    };
    document.addEventListener('visibilitychange', onVisible);
    let lastSent = 0;
    let lastAt = performance.now();
    const timer = setInterval(() => {
      const l = live.current;
      const now = performance.now();
      const rate = ((l.sent - lastSent) * 1000) / (now - lastAt);
      [lastSent, lastAt] = [l.sent, now];
      setStats({ rate, rtt: l.rtt, status: l.status, online: l.fails < 5 && l.status !== null, angles: l.angles });
    }, STATUS_EVERY);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
      wake.current?.release().catch(() => {});
    };
  }, [running, id]);

  const calibrate = () => post({ type: 'pose-zero', id });

  const { status } = stats;
  // One-way delay to the wall: half the phone's round trip plus half the
  // projection's.
  const latency = stats.rtt !== null ? stats.rtt / 2 + (status?.roundTrip ?? 0) / 2 : null;
  const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '–' : `${Math.round(v)}${unit}`);

  return (
    <main className="tracker">
      <h1>Searchlight tracker</h1>
      {!running ? (
        <button className="big" onClick={start}>
          Start
        </button>
      ) : (
        <button className="big" onClick={calibrate}>
          Calibrate
        </button>
      )}
      {running && <p className="hint">Point the beamer straight at the wall, then tap Calibrate.</p>}
      {error && <p className="error">{error}</p>}
      <dl>
        <dt>Connected</dt>
        <dd className={stats.online ? 'ok' : 'bad'}>{running ? (stats.online ? 'yes' : 'no') : '–'}</dd>
        <dt>Projections</dt>
        <dd className={status ? (status.projections ? 'ok' : 'bad') : ''}>{status ? status.projections : '–'}</dd>
        <dt>Active tracker</dt>
        <dd className={status?.relayed === false ? 'bad' : ''}>{status ? (status.relayed ? 'this phone' : 'another phone') : '–'}</dd>
        <dt>Send rate</dt>
        <dd>{running ? `${Math.round(stats.rate)} Hz` : '–'}</dd>
        <dt>Latency</dt>
        <dd>{fmt(latency, ' ms')}</dd>
        <dt>α β γ</dt>
        <dd className="mono">{stats.angles ? stats.angles.map((a) => a.toFixed(1)).join('  ') : '–'}</dd>
      </dl>
      <p className="hint">Rotation lock on, auto-lock off, charger in, keep this page in front.</p>
    </main>
  );
}
