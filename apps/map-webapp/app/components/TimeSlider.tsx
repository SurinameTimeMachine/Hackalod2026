'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export type YearRange = [number, number] | null;
type Bounds = { min: number; max: number };
// These are navigation windows from the design, not claims that a historical
// process necessarily began or ended at the edge of the displayed window.
const periods = [
  { label: 'Slavery', from: 1765, to: 1863, kind: 'forced', row: 0 },
  { label: 'State supervision', from: 1863, to: 1873, kind: 'forced', row: 0 },
  { label: 'Transatlantic slave trade', from: 1765, to: 1808, kind: 'forced', row: 1 },
  { label: 'British Indian contract labour', from: 1873, to: 1916, kind: 'contract', row: 1 },
  { label: 'Chinese contract labour', from: 1853, to: 1874, kind: 'contract', row: 2 },
  { label: 'Javanese contract labour', from: 1890, to: 1939, kind: 'contract', row: 2 },
  { label: 'Migration to the Netherlands', from: 1965, to: 1980, kind: 'migration', row: 0 },
  { label: 'After the visa requirement', from: 1980, to: 2026, kind: 'migration', row: 1 },
] as const;

export default function TimeSlider({ onApply, onCancel }: { onApply: (range: YearRange) => Promise<boolean>; onCancel: () => void }) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/people-years', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => {
        const range = { min: Math.min(data.min, 1765), max: Math.max(data.max, 2026) };
        setBounds(range); setFrom(range.min); setTo(range.max); setError('');
      })
      .catch(() => { if (!controller.signal.aborted) setError('Years unavailable.'); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); request.current++; }, []);

  function choose(start: number, end: number) {
    if (!bounds) return;
    setFrom(start); setTo(end); setError('');
    onCancel();
    if (timer.current) clearTimeout(timer.current);
    const current = ++request.current;
    setBusy(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      const ok = await onApply(start === bounds.min && end === bounds.max ? null : [start, end]);
      if (current !== request.current) return;
      setBusy(false);
      if (!ok) setError('Could not load these years. Try adjusting the range.');
    }, 400);
  }

  return <section className="time-slider" aria-label="Time range">
    {!bounds ? <div>{error || 'Loading years…'} {error && <button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>Retry</button>}</div> : <>
      <div className="time-heading"><strong>Time</strong><span>{from} – {to}</span>{busy && <small role="status">Updating…</small>}</div>
      <div className="timeline-scroll">
        <div className="timeline-axis">
          <div className="dual-range" style={{
            '--range-from': `${((from - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
            '--range-to': `${((to - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
          } as CSSProperties}>
            <div className="dual-range-track" aria-hidden="true"><div className="dual-range-selected" /></div>
            <input aria-label="Start year" style={{ zIndex: from === to ? 2 : 1 }} type="range" min={bounds.min} max={bounds.max} value={from} onChange={e => choose(Math.min(Number(e.target.value), to), to)} />
            <input aria-label="End year" type="range" min={bounds.min} max={bounds.max} value={to} onChange={e => choose(from, Math.max(Number(e.target.value), from))} />
          </div>
          <div className="timeline-events" aria-label="Select a historical period">
            {periods.map(period => <button type="button" key={period.label} className={`timeline-period ${period.kind}`}
              aria-label={`${period.label}, ${period.from} to ${period.to}`} aria-pressed={from === period.from && to === period.to}
              title={`${period.label}: ${period.from}–${period.to}`}
              style={{ left: `${(period.from - bounds.min) / (bounds.max - bounds.min) * 100}%`, width: `${(period.to - period.from) / (bounds.max - bounds.min) * 100}%`, top: `calc(${period.row} * var(--period-row))` }}
              onClick={() => choose(period.from, period.to)}>{period.label}</button>)}
          </div>
          <div className="timeline-ticks" aria-hidden="true">{[1800, 1850, 1900, 1950, 2000].filter(year => year >= bounds.min && year <= bounds.max).map(year => <span key={year} style={{ left: `${(year - bounds.min) / (bounds.max - bounds.min) * 100}%` }}>{year}</span>)}</div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </>}
  </section>;
}
