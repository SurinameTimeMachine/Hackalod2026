'use client';

// Tell the story. Top half: the transcript, with what was recognised
// underlined in its colour. Bottom half: where each part lands in the
// contributions dataset, with archive matches to confirm or correct.
// Nothing is saved yet; that is the consent + /contribute step.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candidate, ExtractResult, PersonContext, ResolvedSuggestion } from '../shared/story';
import { APP_NAME, BADGE, CATEGORY, DICT, FIELD, RELATION, TYPE } from './strings';
import { Mic } from './icons';
import { MAX_SECONDS, useRecorder } from './useRecorder';

type Phase = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'done' | 'typing';
type Review = { status: 'open' | 'ok' | 'removed'; choice: string | null }; // choice: option id, or null = as told

const BARS = 22;
const LEGEND = ['per', 'pla', 'dat', 'rol', 'rel'] as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Where each suggestion's words sit in the transcript (first free occurrence,
// preferably inside its quote). Overlaps are dropped.
function spans(text: string, list: ResolvedSuggestion[]) {
  const lower = text.toLowerCase();
  const out: { start: number; end: number; id: string }[] = [];
  for (const s of list) {
    const m = s.mention.trim().toLowerCase();
    if (!m) continue;
    const q = lower.indexOf(s.quote.trim().toLowerCase().slice(0, 40));
    const candidates = [q >= 0 ? lower.indexOf(m, q) : -1, lower.indexOf(m)];
    for (let from = 0, i; (i = lower.indexOf(m, from)) >= 0; from = i + 1) candidates.push(i);
    const start = candidates.find((i) => i >= 0 && !out.some((o) => i < o.end && i + m.length > o.start));
    if (start !== undefined) out.push({ start, end: start + m.length, id: s.id });
  }
  return out.sort((a, b) => a.start - b.start);
}

function describe(s: ResolvedSuggestion, subject: string, chosenLabel: string | null) {
  if (!s.kind) {
    const about = !s.about || s.about === 'subject' ? subject : s.about === 'narrator' ? DICT.narrator : s.about;
    return [TYPE[s.type] ?? s.type, `over ${about}`, chosenLabel, DICT.notStored].filter(Boolean).join(' · ');
  }
  if (s.kind === 'relation') {
    const who = chosenLabel ?? s.name_raw ?? s.mention;
    return `${who} · ${RELATION[s.relation_type ?? 'other'] ?? RELATION.other} ${subject}`;
  }
  if (s.kind === 'fact') return `${FIELD[s.field ?? ''] ?? s.field ?? 'feit'}: ${s.value ?? s.mention}`;
  if (s.kind === 'place') return [s.value, chosenLabel ?? s.place_raw].filter(Boolean).join(' · ');
  return [s.year, s.value].filter(Boolean).join(' · ');
}

// The contributions row this suggestion would become (columns that are set).
function columns(s: ResolvedSuggestion, personKey: string, r: Review) {
  if (!s.kind) return [];
  const isPlace = !!(s.place_raw || s.field === 'address_text');
  const pick = r.choice;
  const row: [string, string | number | null][] = [
    ['person_key', personKey],
    ['kind', s.kind],
    ['relation_type', s.relation_type],
    ['related_key', s.kind === 'relation' ? (pick && !isPlace ? pick : 'name:…') : null],
    ['name_raw', s.name_raw],
    ['field', s.field],
    ['value', s.value],
    ['place_raw', s.place_raw],
    ['place_norm', isPlace && pick ? pick.replace(/^place:/, '') : null],
    ['year', s.year],
  ];
  return row.filter(([, v]) => v !== null && v !== '');
}

function badge(s: ResolvedSuggestion, r: Review): [string, string] {
  if (!s.kind) return ['b-wait', BADGE.only];
  if (r.status === 'removed') return ['b-wait', DICT.removed];
  if (s.possibly_living) return ['b-warn', 'mogelijk levend'];
  if (r.status === 'ok') return ['b-you', DICT.confirmed];
  if (r.choice) return ['b-link', BADGE.linked];
  if (s.options.length) return ['b-wait', BADGE.choose];
  return ['b-new', BADGE.new];
}

export default function Dictate({ person, context, onBack }: { person: Candidate; context: PersonContext | null; onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<ExtractResult | null>(null);
  const [review, setReview] = useState<Record<string, Review>>({});
  const [revealed, setRevealed] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'found' | 'data'>('found');
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState<'transcribe' | 'extract' | null>(null);
  const lastAudio = useRef<Blob | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const process = useCallback(
    async (text: string) => {
      setTranscript(text);
      setPhase('extracting');
      setFailed(null);
      setData(null);
      setSel(null);
      try {
        const res = await fetch('/story/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: person.key, transcript: text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const out: ExtractResult = await res.json();
        setReview(Object.fromEntries(out.suggestions.map((s) => [s.id, { status: s.kind && s.possibly_living ? 'removed' : 'open', choice: s.linked }])));
        setRevealed(0);
        setData(out);
        setPhase('done');
      } catch {
        setPhase('done');
        setFailed('extract');
      }
    },
    [person.key],
  );

  const onAudio = useCallback(
    async (audio: Blob) => {
      setPhase('transcribing');
      setFailed(null);
      lastAudio.current = audio;
      const form = new FormData();
      form.append('audio', audio, 'story');
      form.append('key', person.key);
      try {
        const res = await fetch('/story/transcribe', { method: 'POST', body: form });
        if (!res.ok) throw new Error(String(res.status));
        const { transcript: text } = await res.json();
        if (!text) throw new Error('empty');
        process(text);
      } catch {
        setPhase('idle');
        setFailed('transcribe');
      }
    },
    [person.key, process],
  );

  const rec = useRecorder(onAudio);

  // Recognised words light up one after another.
  useEffect(() => {
    if (!data || revealed >= data.suggestions.length) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), revealed ? 280 : 400);
    return () => clearTimeout(t);
  }, [data, revealed]);

  const reset = () => {
    setPhase('idle');
    setTranscript('');
    setTyped('');
    setData(null);
    setSel(null);
    setTab('found');
    setFailed(null);
  };

  // Correct the transcript by typing, then recognise again.
  const edit = () => {
    setTyped(transcript);
    setSel(null);
    setPhase('typing');
  };
  const retry = () => (failed === 'transcribe' && lastAudio.current ? onAudio(lastAudio.current) : process(transcript));

  const toggleRecord = async () => {
    if (rec.recording) return rec.stop();
    reset();
    try {
      await rec.start();
      setPhase('recording');
    } catch {
      say(DICT.micDenied);
      setPhase('typing');
    }
  };

  const list = useMemo(() => data?.suggestions ?? [], [data]);
  const order = useMemo(() => new Map(list.map((s, i) => [s.id, i])), [list]);
  const marks = useMemo(() => spans(transcript, list), [transcript, list]);
  const shown = list.filter((s) => (order.get(s.id) ?? 0) < revealed);
  const kept = shown.filter((s) => s.kind && review[s.id]?.status !== 'removed');
  const labelOf = (s: ResolvedSuggestion) => {
    const c = review[s.id]?.choice;
    return c ? (s.options.find((o) => o.id === c)?.label ?? s.linkedLabel) : null;
  };
  const update = (id: string, r: Partial<Review>) => setReview((all) => ({ ...all, [id]: { ...all[id], ...r } }));

  // --- Transcript (top half) ------------------------------------------------
  let body: React.ReactNode;
  if (phase === 'typing') {
    body = <textarea autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={DICT.typePlaceholder} maxLength={5000} />;
  } else if (!transcript) {
    body = <span className="t-empty">{phase === 'transcribing' ? DICT.transcribing : DICT.empty}</span>;
  } else {
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const m of marks) {
      const s = list[order.get(m.id)!];
      if (m.start > at) parts.push(transcript.slice(at, m.start));
      const lit = (order.get(s.id) ?? 0) < revealed;
      const r = review[s.id];
      const cls = ['ent', `k-${s.category}`, lit && (!s.kind || r?.choice || r?.status === 'ok' || !s.options.length) ? 'linked' : '', r?.status === 'removed' ? 'gone' : '', sel === s.id ? 'sel' : '']
        .filter(Boolean)
        .join(' ');
      parts.push(
        <button type="button" key={m.id} className={cls} onClick={() => lit && setSel(s.id)}>
          {transcript.slice(m.start, m.end)}
        </button>,
      );
      at = m.end;
    }
    parts.push(transcript.slice(at));
    body = parts;
  }

  // --- Dataset (bottom half) ------------------------------------------------
  let panel: React.ReactNode;
  const selected = sel ? list.find((s) => s.id === sel) : null;
  if (selected) {
    const r = review[selected.id];
    const [b, bl] = badge(selected, r);
    const isPerson = selected.type === 'person';
    panel = (
      <div className="det">
        <span className="ty">
          <span className={`dot c-${selected.category}`} />
          {TYPE[selected.type] ?? CATEGORY[selected.category]} · <span className={`badge ${b}`}>{bl}</span>
        </span>
        <span className="nm">{selected.mention}</span>
        <span className="quote">“{selected.quote}”</span>
        <div className="cols">
          {columns(selected, person.key, r).map(([k, v]) => (
            <code key={k}>
              {k}=<b>{String(v)}</b>
            </code>
          ))}
        </div>
        {!selected.kind && <span className="foot-note">{DICT.notStoredNote}</span>}
        {selected.kind && selected.possibly_living && <span className="foot-note">{DICT.living}</span>}
        {(selected.options.length > 0 || selected.linked) && (
          <div className="opts">
            <span className="ttl">{selected.kind ? DICT.choose : 'In het archief'}</span>
            {selected.linked && !selected.options.some((o) => o.id === selected.linked) && (
              <button type="button" className={`opt${r.choice === selected.linked ? ' on' : ''}`} onClick={() => update(selected.id, { choice: selected.linked })}>
                <span>
                  {selected.linkedLabel}
                  <small>{selected.linked}</small>
                </span>
              </button>
            )}
            {selected.options.map((o) => (
              <button type="button" key={o.id} className={`opt${r.choice === o.id ? ' on' : ''}`} onClick={() => update(selected.id, { choice: o.id })}>
                <span>
                  {o.label}
                  <small>{o.detail}</small>
                </span>
              </button>
            ))}
            <button type="button" className={`opt${!r.choice ? ' on' : ''}`} onClick={() => update(selected.id, { choice: null })}>
              <span>
                {DICT.keepRaw}
                <small>{isPerson ? (selected.name_raw ?? selected.mention) : (selected.place_raw ?? selected.mention)}</small>
              </span>
            </button>
          </div>
        )}
        {selected.kind && <div className="acts">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              update(selected.id, { status: 'ok' });
              setSel(null);
            }}
          >
            {DICT.ok}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              update(selected.id, { status: r.status === 'removed' ? 'open' : 'removed' });
              setSel(null);
            }}
          >
            {r.status === 'removed' ? 'Terugzetten' : DICT.remove}
          </button>
        </div>}
        <button type="button" className="textbtn" onClick={() => setSel(null)} style={{ textAlign: 'left', padding: '8px 0', fontSize: 13 }}>
          {DICT.back}
        </button>
      </div>
    );
  } else if (tab === 'found') {
    panel = shown.length ? (
      shown.map((s) => {
        const r = review[s.id];
        const [b, bl] = badge(s, r);
        return (
          <button type="button" key={s.id} className={`row${r.status === 'removed' ? ' gone' : ''}`} onClick={() => setSel(s.id)}>
            <span className={`dot c-${s.category}`} />
            <span className="tx">
              <span className="tt">{s.mention}</span>
              <span className="ll">{describe(s, person.text, labelOf(s))}</span>
            </span>
            <span className={`badge ${b}`}>{bl}</span>
          </button>
        );
      })
    ) : (
      <div className="empty">
        {failed ? DICT.failed : phase === 'extracting' ? DICT.extracting : data ? 'Niets herkend in dit verhaal.' : DICT.foundEmpty}
        {failed && (
          <div>
            <button type="button" className="textbtn" onClick={retry}>
              {DICT.retry}
            </button>
          </div>
        )}
      </div>
    );
  } else {
    panel = data ? (
      <>
        <div className="row" style={{ cursor: 'default' }}>
          <span className="dot c-oth" />
          <span className="tx">
            <span className="tt">verhaal</span>
            <span className="cols">
              <code>
                kind=<b>story</b>
              </code>
              <code>
                person_key=<b>{person.key}</b>
              </code>
              <code>
                value=<b>“{transcript.slice(0, 48)}…”</b>
              </code>
            </span>
          </span>
        </div>
        {kept.map((s) => (
          <button type="button" key={s.id} className="row" onClick={() => setSel(s.id)}>
            <span className={`dot c-${s.category}`} />
            <span className="tx">
              <span className="tt">{s.mention}</span>
              <span className="cols">
                {columns(s, person.key, review[s.id])
                  .filter(([k]) => k !== 'person_key')
                  .map(([k, v]) => (
                    <code key={k}>
                      {k}=<b>{String(v)}</b>
                    </code>
                  ))}
              </span>
            </span>
          </button>
        ))}
        <span className="foot-note">{DICT.dataNote}</span>
      </>
    ) : (
      <div className="empty">{DICT.dataEmpty}</div>
    );
  }

  const busy = phase === 'transcribing' || phase === 'extracting';
  const status =
    phase === 'typing' && transcript
      ? DICT.editHint
      : phase === 'recording'
      ? DICT.listening
      : phase === 'transcribing'
        ? DICT.transcribing
        : phase === 'extracting'
          ? DICT.extracting
          : phase === 'done' && data
            ? DICT.done(list.length)
            : DICT.idle;

  return (
    <section className="screen s-dict" key="dict">
      <div className="d-head">
        <span className="r">
          <button type="button" className="backbtn" onClick={onBack} aria-label="Terug">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <span className="logo">{APP_NAME}</span>
        </span>
        <span className="sub">
          {DICT.storyFor} <strong>{context?.name ?? person.text}</strong>
          {person.subtitle ? ` · ${person.subtitle}` : ''}
        </span>
      </div>

      <div className="transcript">
        <div className="t-head">
          <span className="t-label">{DICT.label}</span>
          {transcript && phase === 'done' && (
            <button type="button" className="textbtn" style={{ padding: 0, fontSize: 12.5 }} onClick={edit}>
              {DICT.edit}
            </button>
          )}
          <span className={`t-clock${rec.recording ? ' on' : ''}`}>
            {rec.recording ? `● ${clock(rec.seconds)} / ${clock(MAX_SECONDS)}` : rec.seconds ? clock(rec.seconds) : ''}
          </span>
        </div>
        <div className="t-text">{body}</div>
      </div>

      <div className="legend" aria-label="Legenda">
        {LEGEND.map((k) => (
          <span key={k}>
            <span className={`dot c-${k}`} />
            {CATEGORY[k]}
          </span>
        ))}
      </div>

      <div className="panel">
        <div className="tabs">
          <button type="button" className={`tab${tab === 'found' && !sel ? ' act' : ''}`} onClick={() => (setTab('found'), setSel(null))}>
            {DICT.tabFound} ({shown.length})
          </button>
          <button type="button" className={`tab${tab === 'data' && !sel ? ' act' : ''}`} onClick={() => (setTab('data'), setSel(null))}>
            {DICT.tabData} ({data ? kept.length + 1 : 0})
          </button>
        </div>
        <div className="panel-body">{panel}</div>
      </div>

      <div className="recbar">
        {phase === 'typing' ? (
          <button type="button" className="btn primary" disabled={typed.trim().length < 10} onClick={() => process(typed.trim())}>
            {transcript ? DICT.reprocess : DICT.typeGo}
          </button>
        ) : (
          <button
            type="button"
            className={`recbtn${rec.recording ? ' on' : ''}`}
            onClick={toggleRecord}
            disabled={busy}
            aria-label={rec.recording ? 'Opname stoppen' : 'Opname starten'}
          >
            {rec.recording ? (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="4" y="4" width="12" height="12" rx="2" fill="#fff" />
              </svg>
            ) : (
              <Mic />
            )}
          </button>
        )}
        <div className="recinfo">
          <div className={`wave${rec.recording ? '' : busy ? ' busy' : ' still'}`}>
            {Array.from({ length: BARS }, (_, i) => (
              <span
                key={i}
                style={
                  rec.recording
                    ? { transform: `scaleY(${0.15 + rec.level * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + rec.seconds)))})` }
                    : busy
                      ? { animationDelay: `${(i * 97) % 900}ms` }
                      : undefined
                }
              />
            ))}
          </div>
          <span className="recstatus">{status}</span>
        </div>
        <div className="recside">
          {phase !== 'typing' && !rec.recording && !busy && (
            <button type="button" className="textbtn" onClick={() => (reset(), setPhase('typing'))}>
              {DICT.typeInstead}
            </button>
          )}
          {phase === 'typing' && transcript ? (
            <button type="button" className="textbtn" onClick={() => setPhase('done')}>
              {DICT.cancel}
            </button>
          ) : (
            (transcript || phase === 'typing') &&
            !busy && (
              <button type="button" className="textbtn" onClick={reset}>
                {DICT.again}
              </button>
            )
          )}
        </div>
      </div>
      <div className={`toast${toast ? ' show' : ''}`} role="status">
        {toast}
      </div>
    </section>
  );
}
