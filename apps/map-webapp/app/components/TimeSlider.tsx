'use client';

import { useEffect, useState, type CSSProperties } from 'react';

export type YearRange = [number, number] | null;
type Bounds = { min: number; max: number };
export default function TimeSlider({ onApply }: { onApply: (range: YearRange) => Promise<boolean> }) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [applied, setApplied] = useState<YearRange>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/people-years', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { setBounds(data); setFrom(data.min); setTo(data.max); setError(''); })
      .catch(() => { if (!controller.signal.aborted) setError('Years unavailable.'); });
    return () => controller.abort();
  }, [retry]);


  async function apply() {
    if (!bounds) return;
    const next: YearRange = from === bounds.min && to === bounds.max ? null : [from, to];
    setBusy(true); setError('');
    const ok = await onApply(next);
    if (ok) setApplied(next); else setError('Could not load these years. Try again.');
    setBusy(false);
  }
  const reset = () => { if (!bounds) return; setFrom(bounds.min); setTo(bounds.max); };
  return <section className="time-slider" aria-label="Time range">
    {!bounds ? <div>{error || 'Loading years…'} {error && <button type="button" onClick={() => { setError(''); setRetry(n => n + 1); }}>Retry</button>}</div> : <>
      <div className="time-heading"><strong>Time</strong><span>{from} – {to}</span><button type="button" onClick={reset} disabled={busy}>Full range</button></div>
      <div className="time-range-row">
        <div className="dual-range" style={{
          '--range-from': `${((from - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
          '--range-to': `${((to - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
        } as CSSProperties}>
          <div className="dual-range-track" aria-hidden="true"><div className="dual-range-selected" /></div>
          <input aria-label="Start year" style={{ zIndex: from === to ? 2 : 1 }} type="range" min={bounds.min} max={bounds.max} value={from} disabled={busy} onChange={e => setFrom(Math.min(Number(e.target.value), to))} />
          <input aria-label="End year" type="range" min={bounds.min} max={bounds.max} value={to} disabled={busy} onChange={e => setTo(Math.max(Number(e.target.value), from))} />
        </div>
        <button type="button" onClick={() => void apply()} disabled={busy}>{busy ? 'Loading…' : 'Apply'}</button>
      </div>
      {applied && <p>Dated records · {applied[0]} – {applied[1]}</p>}
      {error && <p role="alert">{error}</p>}
    </>}
  </section>;
}
