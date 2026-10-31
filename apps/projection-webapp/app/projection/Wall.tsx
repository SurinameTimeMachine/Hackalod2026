import Stamp, { type StampState } from './Stamp';
import type { StampLayout } from './wallLayout';

type Props = {
  stamps: StampLayout[];
  open: boolean; // a constellation is open: unlit names dim
  lit: Map<number, StampState>; // patient_id -> selected | related
  captions: Map<number, string>;
  pulsing: Set<number>;
  onClick: (patientId: number) => void;
};

// The wall of names. Data comes in as props so other locations can reuse it.
export default function Wall({ stamps, open, lit, captions, pulsing, onClick }: Props) {
  return (
    <>
      {stamps.map((s) => (
        <Stamp
          key={s.id}
          stamp={s}
          state={lit.get(s.id) ?? (open ? 'dimmed' : 'idle')}
          caption={captions.get(s.id)}
          pulse={pulsing.has(s.id)}
          onClick={() => onClick(s.id)}
        />
      ))}
    </>
  );
}
