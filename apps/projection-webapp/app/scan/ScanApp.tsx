'use client';

// The phone flow: home → scan (photo or typed) → found (is this the person?)
// → dictate (tell the story; transcript on top, dataset below).
import { useCallback, useEffect, useRef, useState } from 'react';
import { INK_NAMES, INKS } from '../projection/stampStyle';
import type { DisplayStamp } from '../shared/display';
import type { Candidate, PersonContext, ScanResult } from '../shared/story';
import Dictate from './Dictate';
import { downscale } from './downscale';
import { Back, Mic } from './icons';
import { APP_NAME, FOUND, HOME, SCAN } from './strings';

type Screen = 'home' | 'scan' | 'found' | 'dict';
type Phase = 'reading' | 'found' | 'none' | 'error' | 'typing';

// Shown on the home wall when no screen has reported names yet.
const FALLBACK_NAMES = ['Wijngaarde', 'Doerga', 'Kartosen', 'Tjon A Fong', 'Pinas', 'Ramdin', 'Sumter', 'Kanhai', 'Fernandes', 'Boekstaaf', 'Lie A Foe', 'Mohamed', 'Jagessar', 'Vreden', 'Linger', 'Panka', 'Monsels', 'Pengel', 'Esajas', 'Chin A Sen', 'Emanuels', 'Nerkust', 'Haverkamp', 'Dikland', 'Brunings', 'Kalloe', 'Simons', 'Ferrier'];

export const inkOf = (name?: string) => INKS[Math.max(0, INK_NAMES.indexOf(name ?? ''))];

export default function ScanApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [names, setNames] = useState<string[]>(FALLBACK_NAMES);
  const [photo, setPhoto] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('reading');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [ctx, setCtx] = useState<PersonContext | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The home wall shows what the projection shows right now.
  useEffect(() => {
    fetch('/display?stamps=1')
      .then((r) => r.json() as Promise<DisplayStamp[]>)
      .then((s) => s.length && setNames([...new Set(s.map((x) => x.text))].slice(0, 70)))
      .catch(() => {});
  }, []);

  const choose = useCallback((c: Candidate) => {
    setChosen(c);
    setCtx(null);
    setShowOthers(false);
    setScreen('found');
    fetch(`/story/context?key=${encodeURIComponent(c.key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setCtx)
      .catch(() => {});
  }, []);

  const send = useCallback(
    async (form: FormData) => {
      setPhase('reading');
      setResult(null);
      try {
        const res = await fetch('/story/scan', { method: 'POST', body: form });
        if (!res.ok) throw new Error(String(res.status));
        const r: ScanResult = await res.json();
        setResult(r);
        if (!r.candidates.length) return setPhase('none');
        setPhase('found');
        setTimeout(() => choose(r.candidates[0]), 1100);
      } catch {
        setPhase('error');
      }
    },
    [choose],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setScreen('scan');
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    const form = new FormData();
    try {
      form.append('image', await downscale(file), 'scan.jpg');
    } catch {
      form.append('image', file);
    }
    send(form);
  };

  const onType = (text: string) => {
    const form = new FormData();
    form.append('text', text);
    send(form);
  };

  const takePhoto = () => {
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.click();
  };

  return (
    <div className="stage">
      <main className="phone">
        <input ref={fileInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />

        {screen === 'home' && (
          <section className="screen s-home" key="home">
            <div className="wall" aria-hidden="true">
              <div className="names">
                {names.concat(names.slice(0, 20)).map((n, i) => (
                  <span key={i}>{n}</span>
                ))}
              </div>
              <div className="scrawl">
                {APP_NAME}
                <small>{HOME.place}</small>
              </div>
            </div>
            <div className="home-body">
              <h2>{HOME.title}</h2>
              <p className="lede">{HOME.lede}</p>
              <button type="button" className="bigbtn dark" onClick={takePhoto}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                  <path d="M7 12h10" />
                </svg>
                {HOME.scan}
              </button>
              <button
                type="button"
                className="textbtn"
                onClick={() => {
                  setPhoto(null);
                  setResult(null);
                  setPhase('typing');
                  setScreen('scan');
                }}
              >
                {HOME.type}
              </button>
              <p className="hint">{HOME.hint}</p>
            </div>
          </section>
        )}

        {screen === 'scan' && <ScanScreen photo={photo} phase={phase} result={result} onClose={() => setScreen('home')} onShutter={takePhoto} onType={onType} onTypeMode={() => setPhase('typing')} />}

        {screen === 'found' && chosen && (
          <section className="screen s-found" key={`found-${chosen.key}`}>
            <div className="bar-top">
              <Back onClick={() => setScreen('home')} />
              <span className="logo">{APP_NAME}</span>
            </div>
            <div className="found-body">
              <div className="namecard">
                <span className="eyebrow">
                  <span className="ok">
                    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M1.5 5.2l2.2 2.2L8.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </span>
                  {result?.source === 'search' ? FOUND.fromSearch : FOUND.recognised}
                </span>
                {chosen.font ? (
                  <div className="plate" style={{ fontFamily: chosen.font, color: inkOf(chosen.color) }}>
                    {chosen.text}
                  </div>
                ) : (
                  <h2>{chosen.text}</h2>
                )}
                {chosen.subtitle && <p className="subtitle">{chosen.subtitle}</p>}
                <dl className="facts">
                  {ctx ? (
                    ctx.facts.map((f) => (
                      <div key={f.label}>
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))
                  ) : (
                    <div>
                      <dd className="loading">{FOUND.loading}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="ask">
                <h3>{FOUND.ask}</h3>
                <p>{FOUND.askBody}</p>
                <div className="prompts">
                  {FOUND.prompts.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
              </div>
              {showOthers && (
                <div className="others">
                  {result?.candidates
                    .filter((c) => c.key !== chosen.key)
                    .map((c) => (
                      <button type="button" key={c.key} onClick={() => choose(c)}>
                        {c.text}
                        {c.subtitle && <small>{c.subtitle}</small>}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="found-foot">
              <button type="button" className="bigbtn red" onClick={() => setScreen('dict')}>
                <Mic />
                {FOUND.start}
              </button>
              {(result?.candidates.length ?? 0) > 1 && !showOthers ? (
                <button type="button" className="textbtn" onClick={() => setShowOthers(true)}>
                  {FOUND.others}
                </button>
              ) : (
                <button type="button" className="textbtn" onClick={takePhoto}>
                  {FOUND.rescan}
                </button>
              )}
            </div>
          </section>
        )}

        {screen === 'dict' && chosen && <Dictate person={chosen} context={ctx} onBack={() => setScreen('found')} />}
      </main>
    </div>
  );
}

function ScanScreen(props: {
  photo: string | null;
  phase: Phase;
  result: ScanResult | null;
  onClose: () => void;
  onShutter: () => void;
  onType: (text: string) => void;
  onTypeMode: () => void;
}) {
  const { photo, phase, result } = props;
  const [text, setText] = useState('');
  const msg = { reading: SCAN.reading, found: SCAN.found, none: SCAN.none, error: SCAN.failed, typing: '' }[phase];
  return (
    <section className="screen s-scan" key="scan">
      <div className="scan-top">
        <button type="button" className="iconbtn" onClick={props.onClose} aria-label="Sluiten">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <span>{SCAN.title}</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="viewfinder">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" />}
        <div className="corners">
          <i />
          <i />
          <i />
          <i />
        </div>
        {phase === 'reading' && photo && <div className="scanline" />}
        {phase === 'found' && result && (
          <div className="chip">
            <span className="dot c-per" />
            {result.candidates[0]?.text ?? result.read_text}
          </div>
        )}
      </div>
      <div className="scan-bottom">
        {phase === 'typing' ? (
          <form
            className="typebox"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim().length >= 2) props.onType(text.trim());
            }}
          >
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={SCAN.typePlaceholder} enterKeyHint="search" />
            <button type="submit">{SCAN.typeGo}</button>
          </form>
        ) : (
          <>
            <p>{msg}</p>
            <button type="button" className="shutter" onClick={props.onShutter} aria-label="Foto maken">
              <span />
            </button>
            {(phase === 'none' || phase === 'error') && (
              <button type="button" className="textbtn" onClick={props.onTypeMode}>
                {HOME.type}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
