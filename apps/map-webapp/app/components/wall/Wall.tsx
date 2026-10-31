import { useMemo } from 'react';
import type { PatientEdge, Tie } from '../shared/api';
import Constellation, { type ConstellationLine } from './Constellation';
import Stamp, { captionSize, captionTop, LIT_SCALE, type StampState } from './Stamp';
import type { StampLayout } from './wallLayout';

type Props = {
  stamps: StampLayout[];
  edges: PatientEdge[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  // Wording comes from the caller, so other presentations can reuse the wall.
  describeSelected: (id: number, hasTies: boolean) => string;
  describeTie: (ties: Tie[], a: number, b: number) => { certain: boolean; reason: string; reference: string };
};

// The wall of names. Data comes in as props; selecting a name lights up the
// names it has a known tie with and draws the constellation between them.
export default function Wall({ stamps, edges, selectedId, onSelect, describeSelected, describeTie }: Props) {
  const byId = useMemo(() => new Map(stamps.map((s) => [s.id, s])), [stamps]);

  const related = useMemo(() => {
    const ids = new Set<number>();
    if (selectedId == null) return ids;
    for (const e of edges) {
      if (e.a === selectedId) ids.add(e.b);
      else if (e.b === selectedId) ids.add(e.a);
    }
    return ids;
  }, [edges, selectedId]);

  // Every tie between two lit names, drawn from the selected side outwards.
  const lines = useMemo(() => {
    if (selectedId == null) return [];
    const lit = new Set([selectedId, ...related]);
    const scale = (id: number) => (id === selectedId ? LIT_SCALE.selected : LIT_SCALE.related);
    const sel = byId.get(selectedId);
    const captionLines = describeSelected(selectedId, true).split('\n').length;
    const below = sel ? LIT_SCALE.selected * (-captionTop(sel) + captionSize(sel) * 1.25 * captionLines) : 0;
    const out: ConstellationLine[] = [];
    for (const e of edges) {
      if (!lit.has(e.a) || !lit.has(e.b)) continue;
      const [fromId, toId] = e.b === selectedId ? [e.b, e.a] : [e.a, e.b];
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (!from || !to) continue;
      out.push({
        key: `${selectedId}:${e.a}-${e.b}`,
        from,
        to,
        fromScale: scale(fromId),
        toScale: scale(toId),
        fromBelow: fromId === selectedId ? below : 0,
        ...describeTie(e.ties, e.a, e.b),
      });
    }
    return out;
  }, [edges, selectedId, related, byId, describeTie, describeSelected]);

  return (
    <>
      {stamps.map((s) => {
        let state: StampState = 'idle';
        let caption: string | undefined;
        if (selectedId != null) {
          if (s.id === selectedId) {
            state = 'selected';
            caption = describeSelected(s.id, related.size > 0);
          } else if (related.has(s.id)) state = 'related';
          else state = 'dimmed';
        }
        const stamp = state === 'selected' ? { ...s, text: s.text.replace(/ · was hier \d+$/, '') } : s;
        return <Stamp key={s.id} stamp={stamp} state={state} caption={caption} onSelect={onSelect} />;
      })}
      <Constellation lines={lines} />
    </>
  );
}
