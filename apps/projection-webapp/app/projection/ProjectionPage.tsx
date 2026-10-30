'use client';

import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePatientEdges, usePatientIndex, usePatients } from '../shared/hooks';
import type { DisplayReport, DisplayStamp } from '../shared/display';
import { fromNodeKey, patientKey } from '../shared/keys';
import { useSignals } from '../shared/signals';
import { ARCHIVE_OFFLINE, displayName, NO_TIES, subtitle } from '../shared/strings';
import Constellation, { type ConstellationLine, type ConstellationName } from './Constellation';
import type { GNode, NodeKey } from './graph';
import { captionSize, captionTop, LIT_SCALE, type StampState } from './Stamp';
import { comboCandidates, FONTS, INK_NAMES, variation } from './stampStyle';
import { useConstellation } from './useConstellation';
import { useDisplayReport } from './useDisplayReport';
import Wall from './Wall';
import { layoutWall, makeMeasure, WALL, type StampLayout } from './wallLayout';

const IDLE_TIMEOUT = 60_000;
// Which screen this is in the display registry; ?screen=<name> for a second wall.
const SCREEN = 'projection';
const SUMMARY_COMBO = { font: 3, ink: 0 }; // typewriter, bone: reads as a note, not a name

// Fit the 1920×1080 wall into whatever the window is.
function FitWall() {
  const size = useThree((s) => s.size);
  const zoom = Math.min(size.width / WALL.width, size.height / WALL.height);
  return <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={zoom} />;
}

async function loadFonts() {
  await Promise.all(
    FONTS.map(async (f) => {
      const face = new FontFace(f.name, `url(${f.url})`);
      document.fonts.add(await face.load());
    }),
  );
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Extra room under a lit name for its caption, so lines stop above it.
const below = (s: StampLayout, scale: number, caption?: string) =>
  caption ? scale * (-captionTop(s) + captionSize(s) * 1.25 * caption.split('\n').length) : 0;

export default function ProjectionPage() {
  const { patients, source } = usePatients();
  const wallTies = usePatientEdges();
  const patientIndex = usePatientIndex();
  const [fontsReady, setFontsReady] = useState(false);
  const [debug, setDebug] = useState(false);
  const [lastInput, setLastInput] = useState(() => Date.now());
  // ?patient=<id> opens the wall with that constellation (demo story).
  const [initialPatient] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('patient'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  useEffect(() => {
    loadFonts().finally(() => setFontsReady(true));
  }, []);

  const measure = useMemo(() => (fontsReady ? makeMeasure() : null), [fontsReady]);

  const stamps: StampLayout[] = useMemo(() => {
    if (!patients || !measure) return [];
    return layoutWall(
      patients.map((p) => ({ id: p.patient_id, text: displayName(p) })),
      measure,
    );
  }, [patients, measure]);

  const byId = useMemo(() => new Map(patients?.map((p) => [p.patient_id, p]) ?? []), [patients]);
  const wallStamp = useMemo(() => new Map(stamps.map((s) => [s.id, s])), [stamps]);
  const baseSize = useMemo(() => [...stamps.map((s) => s.size)].sort((a, b) => a - b)[stamps.length >> 1] ?? 8, [stamps]);

  // A constellation-only name, styled like the wall but seeded by its own id.
  const nodeStamp = useCallback(
    (n: GNode, x: number, y: number): StampLayout => {
      const seed = n.personId ?? hash(n.key);
      const combo = n.kind === 'summary' ? SUMMARY_COMBO : comboCandidates(seed)[0];
      const v = variation(seed);
      return {
        id: seed,
        text: n.name,
        x,
        y,
        size: baseSize,
        width: (measure?.(n.name, combo.font) ?? n.name.length * 0.55) * baseSize,
        rotation: v.rotation,
        opacity: 1,
        combo,
      };
    },
    [baseSize, measure],
  );

  const patientName = useCallback((id: number) => (byId.has(id) ? displayName(byId.get(id)!) : `#${id}`), [byId]);
  const constellation = useConstellation({
    patientOf: (id) => patientIndex.get(id),
    patientName,
    wallPos: (id) => wallStamp.get(id),
    radius: (n) => {
      const w = n.kind === 'patient' ? (wallStamp.get(n.patientId!)?.width ?? 0) : nodeStamp(n, 0, 0).width;
      return (w * LIT_SCALE.related) / 2 * 0.7 + baseSize * 3;
    },
    wallTies,
  });
  const { graph, loading, offline, open, click, back, reset } = constellation;

  const touch = useCallback(() => setLastInput(Date.now()), []);
  useSignals(open);

  useEffect(() => {
    if (initialPatient && stamps.length) open(initialPatient);
  }, [initialPatient, stamps.length, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      touch();
      if (e.key === 'Escape') back();
      if (e.key === 'd' || e.key === 'D') setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, touch]);

  useEffect(() => {
    if (!graph) return;
    const t = setTimeout(reset, IDLE_TIMEOUT - (Date.now() - lastInput));
    return () => clearTimeout(t);
  }, [graph, lastInput, reset]);

  const onClick = useCallback(
    (key: NodeKey) => {
      touch();
      click(key);
    },
    [click, touch],
  );

  // Everything the canvas draws for the current graph.
  const view = useMemo(() => {
    const lit = new Map<number, StampState>();
    const captions = new Map<number, string>();
    const pulsing = new Set<number>();
    const names: ConstellationName[] = [];
    const lines: ConstellationLine[] = [];
    if (!graph) return { lit, captions, pulsing, names, lines };

    const placed = new Map<NodeKey, { stamp: StampLayout; scale: number; caption?: string }>();
    for (const n of graph.nodes.values()) {
      const state: StampState = n.key === graph.focus ? 'selected' : 'related';
      const scale = LIT_SCALE[state === 'selected' ? 'selected' : 'related'];
      if (n.kind === 'patient') {
        const s = wallStamp.get(n.patientId!);
        if (!s) continue;
        const p = byId.get(n.patientId!);
        const caption =
          p && (n.key === graph.focus || n.key === graph.root)
            ? graph.empty.has(n.key) && ![...graph.edges.values()].some((e) => e.from === n.key || e.to === n.key)
              ? `${subtitle(p)}\n${NO_TIES}`
              : subtitle(p)
            : undefined;
        lit.set(n.patientId!, state);
        if (caption) captions.set(n.patientId!, caption);
        if (loading.has(n.key)) pulsing.add(n.patientId!);
        placed.set(n.key, { stamp: s, scale, caption });
      } else {
        const p = graph.pos.get(n.key);
        if (!p) continue;
        const stamp = nodeStamp(n, p.x, p.y);
        names.push({ key: n.key, stamp, state, caption: n.caption, pulse: loading.has(n.key), origin: graph.origin.get(n.key) });
        placed.set(n.key, { stamp, scale, caption: n.caption });
      }
    }
    // One line per pair of names: the first tie found (live data comes before
    // the precomputed wall ties) is the one shown.
    const drawn = new Set<string>();
    // Many lines from one name crowd its centre: labels then move out towards
    // the far name, and only the sentence is shown, not the record reference.
    const focusLines = [...graph.edges.values()].filter((e) => e.from === graph.focus || e.to === graph.focus).length;
    const crowded = focusLines > 6;
    for (const e of graph.edges.values()) {
      const a = placed.get(e.from);
      const b = placed.get(e.to);
      const pair = [e.from, e.to].sort().join('~');
      if (!a || !b || drawn.has(pair)) continue;
      drawn.add(pair);
      lines.push({
        key: e.key,
        from: a.stamp,
        to: b.stamp,
        fromScale: a.scale,
        toScale: b.scale,
        fromBelow: below(a.stamp, a.scale, a.caption),
        toBelow: below(b.stamp, b.scale, b.caption),
        certain: e.certain,
        reason: e.reason,
        reference: e.reference,
        showReference: !crowded && (e.from === graph.focus || e.to === graph.focus),
        labelAt: e.from === graph.focus ? 0.68 : e.to === graph.focus ? 0.32 : 0.5,
      });
    }
    return { lit, captions, pulsing, names, lines };
  }, [graph, loading, wallStamp, byId, nodeStamp]);

  // The names a visitor can read right now, for the display registry: the
  // whole wall, or with a constellation open only its lit names (the dimmed
  // wall behind it is too faint to scan).
  const [screen] = useState(() => new URLSearchParams(window.location.search).get('screen') || SCREEN);
  const displayReport = useMemo((): DisplayReport | null => {
    if (!stamps.length) return null;
    const entry = (key: string, s: StampLayout, state: DisplayStamp['state'], subtitle?: string): DisplayStamp => ({
      key,
      text: s.text,
      font: FONTS[s.combo.font].name,
      color: INK_NAMES[s.combo.ink],
      x: +((s.x + WALL.width / 2) / WALL.width).toFixed(4),
      y: +((WALL.height / 2 - s.y) / WALL.height).toFixed(4),
      size: +((s.size * (state === 'idle' ? 1 : LIT_SCALE[state])) / WALL.height).toFixed(4),
      state,
      ...(subtitle ? { subtitle } : {}),
    });
    const sub = (id: number) => (byId.has(id) ? subtitle(byId.get(id)!) : undefined);
    if (!graph) {
      return { screen, view: 'wall', focus: null, stamps: stamps.map((s) => entry(patientKey(s.id), s, 'idle', sub(s.id))) };
    }
    const out: DisplayStamp[] = [];
    for (const s of stamps) {
      const state = view.lit.get(s.id);
      if (state === 'selected' || state === 'related') out.push(entry(patientKey(s.id), s, state, sub(s.id)));
    }
    for (const n of view.names) {
      const key = fromNodeKey(n.key);
      if (key && (n.state === 'selected' || n.state === 'related')) out.push(entry(key, n.stamp, n.state, n.caption));
    }
    return { screen, view: 'constellation', focus: fromNodeKey(graph.focus), stamps: out };
  }, [screen, stamps, graph, view, byId]);
  useDisplayReport(displayReport);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <Canvas flat dpr={[1, 2]} onPointerMissed={reset}>
        <color attach="background" args={['#000']} />
        <FitWall />
        <Wall
          stamps={stamps}
          open={!!graph}
          lit={view.lit}
          captions={view.captions}
          pulsing={view.pulsing}
          onClick={(id) => onClick(`p:${id}`)}
        />
        <Constellation names={view.names} lines={view.lines} onClick={onClick} />
      </Canvas>
      {offline && <div className="offline">{ARCHIVE_OFFLINE}</div>}
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${baseSize.toFixed(1)} units\npatient index: ${patientIndex.size}\ngraph: ${graph ? `${graph.nodes.size} names, ${graph.edges.size} lines` : '–'}\nfocus: ${graph?.focus ?? '–'}\nloading: ${loading.size}\nreported: ${displayReport?.stamps.length ?? 0} names as "${screen}"`}
        </div>
      )}
    </main>
  );
}

