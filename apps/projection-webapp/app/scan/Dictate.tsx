'use client';

// Tell the story. Top half: the transcript, with what was recognised
// underlined in its colour. Bottom half: where each part lands in the
// contributions dataset, with archive matches to confirm or correct.
// Nothing is saved yet; that is the consent + /contribute step.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candidate, ExtractResult, MatchOption, PersonContext, ResolvedSuggestion, StoryEntity } from '../shared/story';
import { APP_NAME, ASK, BADGE, CATEGORY, DICT, FIELD, FOUND, KIN, PARENT_OF, RELATION, SAVE, TYPE } from './strings';
import { Mic } from './icons';
import { answer, nextQuestion, startAsk, type Ask, type Question } from './questions';
import Save from './Save';
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

function describe(s: ResolvedSuggestion, subject: string, chosenLabel: string | null, ties: string[]) {
  if (s.is_subject) return `${DICT.self} · ${chosenLabel ?? subject}`;
  if (s.type === 'person' && ties.length) return [chosenLabel, ...ties].filter(Boolean).join(' · ');
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

function badge(s: ResolvedSuggestion, r: Review, tied = false): [string, string] {
  if (s.is_subject) return ['b-link', BADGE.self];
  if (r.status === 'removed') return ['b-wait', DICT.removed];
  if (!s.kind && !tied) return ['b-wait', BADGE.only];
  if (s.possibly_living) return ['b-warn', 'mogelijk levend'];
  if (r.status === 'ok') return ['b-you', DICT.confirmed];
  if (r.choice) return ['b-link', BADGE.linked];
  if (s.options.length) return ['b-wait', BADGE.choose];
  return ['b-new', BADGE.new];
}

const SUBJECT = 'subject'; // id of the "is this the right person?" question

// One follow-up question with its answers.
function QuestionCard({ q, left, onAnswer }: { q: Question; left: number; onAnswer: (value: string) => void }) {
  return (
    <div className="qcard">
      <span className="qtext">{q.text}</span>
      {q.option && (
        <div className="opt on" style={{ cursor: 'default' }}>
          <span>
            {q.option.label}
            <small>{q.option.detail}</small>
          </span>
        </div>
      )}
      {q.kind === 'list' ? (
        <div className="opts">
          {q.chips.map((c) =>
            c.detail ? (
              <button type="button" key={c.value} className="opt" onClick={() => onAnswer(c.value)}>
                <span>
                  {c.label}
                  <small>{c.detail}</small>
                </span>
              </button>
            ) : (
              <button type="button" key={c.value} className={`qchip${c.value === 'skip' ? ' skip' : ''}`} onClick={() => onAnswer(c.value)}>
                {c.label}
              </button>
            ),
          )}
        </div>
      ) : (
        <div className="chips">
          {q.chips.map((c) => (
            <button type="button" key={c.value} className={`qchip${c.value === 'skip' ? ' skip' : ''}`} onClick={() => onAnswer(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {q.kind !== 'confirm' && <span className="qcount">{ASK.remaining(left)}</span>}
    </div>
  );
}

type Props = {
  person: Candidate;
  context: PersonContext | null;
  onBack: () => void;
  onSubject: (c: Candidate) => void;
  onSaved: (narrator: string) => void;
};

export default function Dictate({ person, context, onBack, onSubject, onSaved }: Props) {
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
  const [asks, setAsks] = useState<Record<string, Ask>>({});
  const [walking, setWalking] = useState(false);
  const [relRemoved, setRelRemoved] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const panelBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelBody.current?.scrollTo({ top: 0 });
  }, [sel, tab]);

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
          body: JSON.stringify({ key: person.key, name: person.text, certain: !!person.certain, transcript: text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const out: ExtractResult = await res.json();
        setReview(Object.fromEntries(out.suggestions.map((s) => [s.id, { status: 'open', choice: s.linked }])));
        // A question for every named person with archive candidates, and one
        // for the person themselves when the story does not fit the record.
        const next: Record<string, Ask> = {};
        if (out.subject.status === 'check') next[SUBJECT] = startAsk(out.subject.options);
        for (const s of out.suggestions) if (s.type === 'person' && !s.is_subject && !s.related_key && s.options.length) next[s.id] = startAsk(s.options);
        setAsks(next);
        setWalking(false);
        setRelRemoved(new Set());
        setRevealed(0);
        setData(out);
        setPhase('done');
      } catch {
        setPhase('done');
        setFailed('extract');
      }
    },
    [person.key, person.text, person.certain],
  );

  const onAudio = useCallback(
    async (audio: Blob) => {
      setPhase('transcribing');
      setFailed(null);
      lastAudio.current = audio;
      const form = new FormData();
      form.append('audio', audio, 'story');
      form.append('key', person.key);
      form.append('name', person.text);
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
    [person.key, person.text, process],
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

  // --- Relations between the story's people -------------------------------------
  // A tie is gone when it was removed itself, or when one of its people was.
  const relations = data?.relations ?? [];
  const endGone = (end: string) => end !== 'subject' && end !== 'narrator' && review[end]?.status === 'removed';
  const liveRelations = relations.filter((r) => !relRemoved.has(r.id) && !endGone(r.from) && !endGone(r.to));
  const endName = (end: string) => {
    if (end === 'subject') return person.text;
    if (end === 'narrator') return DICT.you;
    const e = list.find((x) => x.id === end);
    return e ? (labelOf(e) ?? e.name_raw ?? e.mention) : '?';
  };
  // "kind van G.W.", "ouder van Maria": what `id` is of each person it is tied to.
  const tiesOf = (id: string) =>
    liveRelations.flatMap((r) => {
      if (r.to === id) return [`${KIN[r.type] ?? r.type} van ${endName(r.from)}`];
      if (r.from === id) return [`${KIN[PARENT_OF[r.type] ?? r.type] ?? r.type} van ${endName(r.to)}`];
      return [];
    });
  const toggleRelation = (id: string) => {
    const removed = relRemoved.has(id);
    setRelRemoved((all) => {
      const next = new Set(all);
      if (removed) next.delete(id);
      else next.add(id);
      return next;
    });
    say(removed ? DICT.restored : DICT.removedTie);
  };
  const labelOf = (s: ResolvedSuggestion) => {
    const c = review[s.id]?.choice;
    return c ? (s.options.find((o) => o.id === c)?.label ?? s.linkedLabel) : null;
  };
  const isOpenAsk = (id: string) => !!asks[id] && !asks[id].done;
  const update = (id: string, r: Partial<Review>) => setReview((all) => ({ ...all, [id]: { ...all[id], ...r } }));
  // Picking an archive match (or "as told") is the confirmation itself: say
  // what happened and go back to the list, where the row shows it.
  const pick = (id: string, choice: string | null, label: string) => {
    update(id, { choice, status: 'ok' });
    setSel(null);
    say(choice ? ASK.linkedTo(label) : ASK.keptAsTold);
  };
  // Removing works for everything recognised, placed in the dataset or not.
  const toggleRemove = (id: string) => {
    const removed = review[id]?.status === 'removed';
    update(id, { status: removed ? 'open' : 'removed' });
    if (!removed && isOpenAsk(id)) setAsks((all) => ({ ...all, [id]: { ...all[id], done: true, result: null } }));
    setSel(null);
    say(removed ? DICT.restored : DICT.removedToast);
  };

  // --- Follow-up questions ----------------------------------------------------
  const optionsOf = (id: string): MatchOption[] => (id === SUBJECT ? (data?.subject.options ?? []) : (list.find((s) => s.id === id)?.options ?? []));
  const nameOf = (id: string) => {
    const s = list.find((x) => x.id === id);
    return id === SUBJECT ? person.text : (s?.name_raw ?? s?.mention ?? '');
  };
  const isOpen = (id: string) => isOpenAsk(id) && review[id]?.status !== 'removed';
  const openIds = [SUBJECT, ...shown.map((s) => s.id)].filter(isOpen);

  const onAnswer = (id: string, q: Question, value: string) => {
    const opts = optionsOf(id);
    const next = answer(q, value, opts, asks[id]);
    setAsks((all) => ({ ...all, [id]: next }));
    if (!next.done) return;
    const picked = next.result ? opts.find((o) => o.id === next.result) : null;
    if (id === SUBJECT) {
      // The story moves to the record that fits, or to the name as told.
      if (picked) onSubject({ key: picked.id, text: picked.label, subtitle: picked.detail, certain: true });
      else if (value === 'no' && !person.key.startsWith('name:'))
        onSubject({ key: `name:${crypto.randomUUID()}`, text: person.text, subtitle: FOUND.provisional, certain: false });
    } else {
      update(id, picked ? { choice: picked.id, status: 'ok' } : { choice: null });
    }
    if (walking) {
      const rest = openIds.filter((x) => x !== id);
      setSel(rest[0] ?? null);
      if (!rest.length) {
        setWalking(false);
        say(ASK.thanks);
      }
    }
  };

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
      const cls = ['ent', `k-${s.category}`, lit && (!s.kind || r?.choice || r?.status === 'ok' || !s.options.length) ? 'linked' : '', r?.status === 'removed' ? 'gone' : '', lit && isOpen(s.id) ? 'ask' : '', sel === s.id ? 'sel' : '']
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
  const subject = data?.subject;
  const question = (id: string) => (isOpen(id) ? nextQuestion(nameOf(id), optionsOf(id), asks[id]) : null);
  const card = (id: string) => {
    const q = question(id);
    return q && <QuestionCard q={q} left={asks[id].remaining.length} onAnswer={(v) => onAnswer(id, q, v)} />;
  };
  const backLink = (
    <button type="button" className="textbtn" onClick={() => (setSel(null), setWalking(false))} style={{ textAlign: 'left', padding: '8px 0', fontSize: 13 }}>
      {DICT.back}
    </button>
  );
  if (sel === SUBJECT && subject) {
    const a = asks[SUBJECT];
    const picked = a?.result ? subject.options.find((o) => o.id === a.result) : null;
    panel = (
      <div className="det">
        <span className="ty">
          <span className="dot c-per" />
          {ASK.who}
        </span>
        <span className="nm">{person.text}</span>
        {subject.reason && <span className="foot-note">{subject.reason}</span>}
        {card(SUBJECT) ??
          (picked ? <span className="foot-note">{ASK.linkedTo(`${picked.label} (${picked.detail})`)}</span> : <span className="foot-note">{subject.status === 'none' ? ASK.subjectNone : ASK.keptAsTold}</span>)}
        {backLink}
      </div>
    );
  } else if (selected) {
    const r = review[selected.id];
    const [b, bl] = isOpen(selected.id) ? ['b-ask', '?'] : badge(selected, r);
    const isPerson = selected.type === 'person';
    panel = (
      <div className="det">
        <span className="ty">
          <span className={`dot c-${selected.category}`} />
          {TYPE[selected.type] ?? CATEGORY[selected.category]} · <span className={`badge ${b}`}>{bl}</span>
        </span>
        <span className="nm">{selected.mention}</span>
        <span className="quote">“{selected.quote}”</span>
        {card(selected.id)}
        <div className="cols">
          {columns(selected, person.key, r).map(([k, v]) => (
            <code key={k}>
              {k}=<b>{String(v)}</b>
            </code>
          ))}
        </div>
        {!selected.kind && !selected.is_subject && <span className="foot-note">{DICT.notStoredNote}</span>}
        {selected.kind && selected.possibly_living && <span className="foot-note">{DICT.living}</span>}
        {!isOpen(selected.id) && (selected.options.length > 0 || selected.linked) && (
          <div className="opts">
            <span className="ttl">{selected.kind ? DICT.choose : 'In het archief'}</span>
            {selected.linked && !selected.options.some((o) => o.id === selected.linked) && (
              <button type="button" className={`opt${r.choice === selected.linked ? ' on' : ''}`} onClick={() => pick(selected.id, selected.linked, selected.linkedLabel ?? '')}>
                <span>
                  {selected.linkedLabel}
                  <small>{selected.linked}</small>
                </span>
              </button>
            )}
            {selected.options.map((o) => (
              <button type="button" key={o.id} className={`opt${r.choice === o.id ? ' on' : ''}`} onClick={() => pick(selected.id, o.id, o.label)}>
                <span>
                  {o.label}
                  <small>{o.detail}</small>
                </span>
              </button>
            ))}
            <button type="button" className={`opt${!r.choice ? ' on' : ''}`} onClick={() => pick(selected.id, null, '')}>
              <span>
                {DICT.keepRaw}
                <small>{isPerson ? (selected.name_raw ?? selected.mention) : (selected.place_raw ?? selected.mention)}</small>
              </span>
            </button>
          </div>
        )}
        <div className="acts">
          {selected.kind && !isOpen(selected.id) && r.status !== 'removed' && (
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
          )}
          <button type="button" className="btn" onClick={() => toggleRemove(selected.id)}>
            {r.status === 'removed' ? DICT.restore : DICT.remove}
          </button>
        </div>
        {backLink}
      </div>
    );
  } else if (tab === 'found') {
    const subjectRow = subject && subject.status !== 'ok' && (
      <button type="button" key={SUBJECT} className="row subject" onClick={() => setSel(SUBJECT)}>
        <span className="dot c-per" />
        <span className="tx">
          <span className="tt">{person.text}</span>
          <span className="ll">
            {asks[SUBJECT]?.result
              ? ASK.linkedTo(subject.options.find((o) => o.id === asks[SUBJECT].result)?.label ?? '')
              : subject.status === 'check'
                ? ASK.subjectCheck(subject.options.length)
                : ASK.subjectNone}
          </span>
        </span>
        <span className={`badge ${isOpen(SUBJECT) ? 'b-ask' : asks[SUBJECT]?.result ? 'b-link' : 'b-new'}`}>
          {isOpen(SUBJECT) ? '?' : asks[SUBJECT]?.result ? BADGE.linked : BADGE.new}
        </span>
      </button>
    );
    const banner = openIds.length > 0 && (
      <div className="askbar" key="askbar">
        <span>{ASK.banner(openIds.length)}</span>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setWalking(true);
            setSel(openIds[0]);
          }}
        >
          {ASK.go}
        </button>
      </div>
    );
    panel = shown.length ? (
      [banner, subjectRow, ...shown.map((s) => {
        const r = review[s.id];
        const [b, bl] = isOpen(s.id) ? ['b-ask', '?'] : badge(s, r, tiesOf(s.id).length > 0);
        const left = isOpen(s.id) ? ` · ${ASK.remaining(asks[s.id].remaining.length)}` : '';
        return (
          <button type="button" key={s.id} className={`row${r.status === 'removed' ? ' gone' : ''}`} onClick={() => setSel(s.id)}>
            <span className={`dot c-${s.category}`} />
            <span className="tx">
              <span className="tt">{s.mention}</span>
              <span className="ll">{describe(s, person.text, labelOf(s), tiesOf(s.id)) + left}</span>
            </span>
            <span className={`badge ${b}`}>{bl}</span>
          </button>
        );
      })]
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
        {relations
          .filter((r) => !endGone(r.from) && !endGone(r.to))
          .map((r) => (
            <button type="button" key={r.id} className={`row${relRemoved.has(r.id) ? ' gone' : ''}`} onClick={() => toggleRelation(r.id)}>
              <span className="dot c-rel" />
              <span className="tx">
                <span className="tt">
                  {endName(r.to)} · {KIN[r.type] ?? r.type} van {endName(r.from)}
                </span>
                <span className="cols">
                  <code>
                    kind=<b>relation</b>
                  </code>
                  <code>
                    relation_type=<b>{r.type}</b>
                  </code>
                </span>
              </span>
              <span className={`badge ${relRemoved.has(r.id) ? 'b-wait' : 'b-new'}`}>{relRemoved.has(r.id) ? DICT.removed : BADGE.new}</span>
            </button>
          ))}
        <span className="foot-note">{DICT.dataNote}</span>
      </>
    ) : (
      <div className="empty">{DICT.dataEmpty}</div>
    );
  }

  const busy = phase === 'transcribing' || phase === 'extracting';

  // The story as it will be saved: every recognised entity that was not
  // removed, with its place in the text, its archive link and its row.
  const storyEntities = (): StoryEntity[] =>
    list
      .filter((s) => review[s.id]?.status !== 'removed')
      .map((s) => {
        const m = marks.find((x) => x.id === s.id);
        const r = review[s.id];
        const choice = r?.choice ?? null;
        const isPlace = s.type === 'place' || !!s.place_raw || s.field === 'address_text';
        return {
          id: s.id,
          start: m?.start ?? -1,
          end: m?.end ?? -1,
          mention: s.mention,
          type: s.type,
          category: s.category,
          about: s.about,
          is_subject: s.is_subject,
          confirmed: r?.status === 'ok',
          link: s.is_subject ? (person.key.startsWith('name:') ? null : person.key) : choice,
          link_label: s.is_subject ? person.text : labelOf(s),
          quote: s.quote,
          narrator_relation: s.type === 'person' ? s.narrator_relation : null,
          row: s.kind
            ? {
                kind: s.kind,
                relation_type: s.relation_type,
                related_key: s.kind === 'relation' && choice && !choice.startsWith('place:') ? choice : null,
                name_raw: s.name_raw,
                field: s.field,
                value: s.value,
                place_raw: s.place_raw,
                place_norm: isPlace && choice?.startsWith('place:') ? choice.slice(6) : null,
                year: s.year,
              }
            : null,
        };
      });

  if (saving && data)
    return (
      <Save
        person={person}
        transcript={transcript}
        summary={data.summary}
        entities={storyEntities()}
        relations={liveRelations}
        onBack={() => setSaving(false)}
        onSaved={onSaved}
      />
    );
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
            {DICT.tabData} ({data ? kept.length + liveRelations.length + 1 : 0})
          </button>
        </div>
        <div className="panel-body" ref={panelBody}>
          {panel}
        </div>
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
          {data && phase === 'done' && !rec.recording && (
            <button type="button" className="btn primary" style={{ height: 38 }} onClick={() => setSaving(true)}>
              {SAVE.button}
            </button>
          )}
          {phase !== 'typing' && !rec.recording && !busy && !data && (
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
