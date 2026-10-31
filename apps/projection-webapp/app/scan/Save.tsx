'use client';

// "Vertel over jezelf": who told the story, consent, then POST /contribute.
// The narrator becomes a person in the dataset, related to the subject.
import { useCallback, useState } from 'react';
import type { Candidate, ContributeRequest, StoryEntity } from '../shared/story';
import { Mic } from './icons';
import { KIN, NARRATOR_CHIP_FOR, NARRATOR_RELATIONS, SAVE } from './strings';
import { useRecorder } from './useRecorder';

type Props = {
  person: Candidate;
  transcript: string;
  summary: string;
  entities: StoryEntity[];
  onBack: () => void;
  onSaved: (narrator: string) => void;
};

export default function Save({ person, transcript, summary, entities, onBack, onSaved }: Props) {
  // What the story already says: "mijn grootmoeder Johanna" (the person) and
  // "mijn grootvader Ramlal" (other family of the narrator).
  const told = entities.find((e) => e.is_subject)?.narrator_relation;
  const family = entities.filter((e) => e.type === 'person' && e.narrator_relation && !e.is_subject);
  const [keep, setKeep] = useState<Set<string>>(() => new Set(family.map((e) => e.id)));
  const [tried, setTried] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<number | null>(told ? (NARRATOR_CHIP_FOR[told] ?? null) : null);
  const [about, setAbout] = useState('');
  const [publish, setPublish] = useState(false);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState<'transcribing' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Speaking about yourself fills the text field.
  const onAudio = useCallback(
    async (audio: Blob) => {
      setBusy('transcribing');
      const form = new FormData();
      form.append('audio', audio, 'about');
      form.append('key', person.key);
      try {
        const res = await fetch('/story/transcribe', { method: 'POST', body: form });
        const { transcript: text } = await res.json();
        if (text) setAbout((a) => (a ? `${a} ${text}` : text));
      } catch {
        setError(SAVE.failed);
      }
      setBusy(null);
    },
    [person.key],
  );
  const rec = useRecorder(onAudio);

  const rows = entities.filter((e) => e.row).length;
  const missingName = !name.trim();
  const missingConsent = !publish || !ai;

  // Always tappable: say what is missing instead of doing nothing.
  const submit = async () => {
    if (busy || rec.recording) return;
    if (missingName || missingConsent) return setTried(true);
    setBusy('saving');
    setError(null);
    const rel = relation === null ? null : NARRATOR_RELATIONS[relation];
    const body: ContributeRequest = {
      key: person.key,
      subject_name: person.text,
      transcript,
      summary,
      entities: entities.map((e) => (e.narrator_relation && !e.is_subject && !keep.has(e.id) ? { ...e, narrator_relation: null } : e)),
      narrator: { name: name.trim(), relation: rel?.value ?? null, relation_label: rel?.label ?? null, about: about.trim() || null },
      consent: { publish, ai },
    };
    try {
      const res = await fetch('/contribute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      onSaved(name.trim());
    } catch {
      setError(SAVE.failed);
      setBusy(null);
    }
  };

  return (
    <section className="screen s-found s-save" key="save">
      <div className="found-body">
        <div className="ask" style={{ paddingTop: 18 }}>
          <h3>{SAVE.title}</h3>
          <p>{SAVE.lede(person.text)}</p>
        </div>
        <label className={`field${tried && missingName ? ' missing' : ''}`}>
          <span>{SAVE.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        </label>
        <div className="field">
          <span>{SAVE.who(person.text)}</span>
          <div className="chips">
            {NARRATOR_RELATIONS.map((r, i) => (
              <button type="button" key={r.label} className={`qchip${relation === i ? ' on' : ''}`} onClick={() => setRelation(relation === i ? null : i)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {family.length > 0 && (
          <div className="field">
            <span>{SAVE.fromStory}</span>
            {family.map((e) => (
              <label className="check" key={e.id}>
                <input
                  type="checkbox"
                  checked={keep.has(e.id)}
                  onChange={() =>
                    setKeep((k) => {
                      const n = new Set(k);
                      if (n.has(e.id)) n.delete(e.id);
                      else n.add(e.id);
                      return n;
                    })
                  }
                />
                <span>
                  {e.link_label ?? e.mention} · je {KIN[e.narrator_relation!] ?? e.narrator_relation}
                </span>
              </label>
            ))}
          </div>
        )}
        <label className="field">
          <span>{SAVE.about}</span>
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder={SAVE.aboutPlaceholder} maxLength={2000} rows={3} />
        </label>
        <button type="button" className="btn speak" onClick={() => (rec.recording ? rec.stop() : rec.start().catch(() => setError(SAVE.failed)))} disabled={busy === 'transcribing'}>
          {rec.recording ? `● ${SAVE.stop}` : busy === 'transcribing' ? SAVE.transcribing : (
            <>
              <span className="mic">
                <Mic />
              </span>
              {SAVE.speak}
            </>
          )}
        </button>
        <label className={`check${tried && !publish ? ' missing' : ''}`}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span>{SAVE.publish}</span>
        </label>
        <label className={`check${tried && !ai ? ' missing' : ''}`}>
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          <span>{SAVE.ai}</span>
        </label>
        <p className="foot-note">{SAVE.summary(rows, entities.length)}</p>
        {tried && (missingName || missingConsent) && (
          <p className="foot-note" style={{ color: 'var(--rec)' }}>{missingName ? SAVE.missingName : SAVE.missingConsent}</p>
        )}
        {error && <p className="foot-note" style={{ color: 'var(--rec)' }}>{error}</p>}
      </div>
      <div className="found-foot">
        <button type="button" className="bigbtn dark" onClick={submit}>
          {busy === 'saving' ? SAVE.saving : SAVE.button}
        </button>
        <button type="button" className="textbtn" onClick={onBack}>
          {SAVE.back}
        </button>
      </div>
    </section>
  );
}
