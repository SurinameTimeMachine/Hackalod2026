'use client';

import { OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePatientEdges, usePatientIndex, usePatients } from '../shared/hooks';
import type { DisplayReport, DisplayStamp } from '../shared/display';
import { fromNodeKey, patientKey, personKey } from '../shared/keys';
import { useSignals } from '../shared/signals';
import { ARCHIVE_OFFLINE, displayName, guessQuestion, NO_TIES, subtitle } from '../shared/strings';
import Constellation, { type ConstellationLine, type ConstellationName } from './Constellation';
import { TreeLayout, type Box, type Point, type TreeEdge } from './forceLayout';
import { FrameContext, WALL_FRAME, type Emphasis, type Frame } from './frame';
import type { GNode, NodeKey } from './graph';
import { captionSize, captionTop, LIT_SCALE, type StampState } from './Stamp';
import { comboCandidates, FONTS, INK_NAMES, TOLD_COMBO, variation } from './stampStyle';
import { useConstellation } from './useConstellation';
import { useDisplayReport } from './useDisplayReport';
import Wall from './Wall';
import { layoutWall, makeMeasure, WALL, type Bounds, type StampLayout } from './wallLayout';

// Searchlight mode (README_Searchlight.md) is only loaded when switched on.
type SearchlightModule = typeof import('./searchlight');
type Mode = 'static' | 'searchlight';

const IDLE_TIMEOUT = 60_000;
const TELLING_HOLD = 8 * 60_000; // a phone is telling about this person: dictating takes a while
const STORY_HOLD = 120_000; // after a saved story: time to walk back to the wall
// Which screen this is in the display registry; ?screen=<name> for a second wall.
const SCREEN = 'projection';
// The wall only dims behind an open tree; lit names live in the constellation.
const NONE = new Map<number, StampState>();
const NO_CAPTIONS = new Map<number, string>();
const NO_PULSE = new Set<number>();
const SUMMARY_COMBO = { font: 3, ink: 0 }; // typewriter, bone: reads as a note, not a name

// Fit the 1920×1080 wall into whatever the window is.
function FitWall() {
  const size = useThree((s) => s.size);
  const zoom = Math.min(size.width / WALL.width, size.height / WALL.height);
  return <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={1000} zoom={zoom} />;
}

// Steps the family-tree layout once per frame, before the names read it.
function Ticker({ layout }: { layout: TreeLayout }) {
  useFrame(() => layout.tick(), -1);
  return null;
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

// A lit name's text box for the layout, caption included (Courier Prime:
// ~0.6 em per character).
function boxOf(s: StampLayout, scale: number, caption?: string, headline?: string): Box {
  const lines = [...(caption?.split('\n') ?? []), ...(headline ? [headline] : [])];
  const cap = lines.length ? (Math.max(...lines.map((l) => l.length)) * captionSize(s) * 0.6 * scale) / 2 : 0;
  const half = s.size * scale * 0.6;
  const above = headline ? captionSize(s) * scale * 1.6 : 0;
  return { hw: Math.max((s.width * scale) / 2, cap) + s.size * 0.5, up: half + above, down: half + below(s, scale, caption) };
}


export default function ProjectionPage() {
  const { patients, source } = usePatients();
  const wallTies = usePatientEdges();
  const patientIndex = usePatientIndex();
  const [fontsReady, setFontsReady] = useState(false);
  const [debug, setDebug] = useState(false);
  const [lastInput, setLastInput] = useState(() => Date.now());
  // `S` or ?mode=searchlight: the phone on the beamer turns a camera over a
  // larger wall. Static is the single-beam view.
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).get('mode') === 'searchlight' ? 'searchlight' : 'static'));
  const [searchlightModule, setSearchlightModule] = useState<SearchlightModule | null>(null);
  useEffect(() => {
    if (mode === 'searchlight' && !searchlightModule) import('./searchlight').then(setSearchlightModule);
  }, [mode, searchlightModule]);
  const searchlight = useMemo(() => (searchlightModule ? new searchlightModule.Searchlight() : null), [searchlightModule]);
  const lit = mode === 'searchlight' ? searchlight : null;
  // The area the names are spread over; null while the searchlight loads.
  const bounds: Bounds | null = mode === 'static' ? WALL : (searchlight?.bounds ?? null);
  // Open trees are drawn as much larger as the names are.
  const frameScale = bounds ? Math.sqrt((bounds.width * bounds.height) / (WALL.width * WALL.height)) : 1;
  const emphasis = useRef<Emphasis>({ key: null, amount: 0 });
  // Where a new tree opens: the wall's centre, or where the beam points.
  const beamPoint = useRef<() => Point>(() => ({ x: 0, y: 0 }));
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
    if (!patients || !measure || !bounds) return [];
    return layoutWall(
      patients.map((p) => ({ id: p.patient_id, text: displayName(p) })),
      measure,
      bounds,
    );
  }, [patients, measure, bounds]);

  const byId = useMemo(() => new Map(patients?.map((p) => [p.patient_id, p]) ?? []), [patients]);
  const wallStamp = useMemo(() => new Map(stamps.map((s) => [s.id, s])), [stamps]);
  const baseSize = useMemo(() => [...stamps.map((s) => s.size)].sort((a, b) => a - b)[stamps.length >> 1] ?? 8, [stamps]);

  // A constellation-only name, styled like the wall but seeded by its own id.
  const nodeStamp = useCallback(
    (n: GNode, x: number, y: number): StampLayout => {
      const seed = n.personId ?? hash(n.key);
      const combo = n.kind === 'summary' ? SUMMARY_COMBO : n.kind === 'told' || n.kind === 'narrator' ? TOLD_COMBO : comboCandidates(seed)[0];
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
    wallTies,
  });
  // Bumped when the tree comes to rest, so the report has final positions.
  const [settled, setSettled] = useState(0);
  const [layout] = useState(() => new TreeLayout(() => setSettled((n) => n + 1)));
  const at = useCallback((key: string) => layout.pos(key), [layout]);
  const { graph, loading, offline, fresh, headline, open, openKey, showStory, click, back, reset } = constellation;

  const touch = useCallback(() => setLastInput(Date.now()), []);
  // Opening counts as input for the idle reset: the first load (or a signal
  // from a phone) can come long after the last touch.
  const openedAt = useRef(0);
  const openNow = useCallback(
    (id: number) => {
      openedAt.current = Date.now();
      open(id);
    },
    [open],
  );
  const holdUntil = useRef(0);
  useSignals({
    select: (key, name) => {
      openedAt.current = Date.now();
      holdUntil.current = Date.now() + TELLING_HOLD;
      openKey(key, name);
    },
    storySaved: (signal) => {
      openedAt.current = Date.now();
      holdUntil.current = Date.now() + STORY_HOLD;
      showStory(signal);
    },
  });

  useEffect(() => {
    if (initialPatient && stamps.length) openNow(initialPatient);
  }, [initialPatient, stamps.length, openNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      touch();
      if (e.key === 'Escape') back();
      if (e.key === 'd' || e.key === 'D') setDebug((d) => !d);
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) {
        reset();
        setMode((m) => (m === 'static' ? 'searchlight' : 'static'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, reset, touch]);

  useEffect(() => {
    if (!graph) return;
    const t = setTimeout(reset, Math.max(IDLE_TIMEOUT - (Date.now() - Math.max(lastInput, openedAt.current)), holdUntil.current - Date.now()));
    return () => clearTimeout(t);
  }, [graph, lastInput, reset]);

  const onClick = useCallback(
    (key: NodeKey) => {
      touch();
      click(key);
    },
    [click, touch],
  );

  // Everything the canvas draws for the current graph: every name in the
  // tree (patients too: they leave their dimmed wall spot and join it), the
  // lines between them, and what the layout needs to place them.
  const view = useMemo(() => {
    const names: ConstellationName[] = [];
    const lines: ConstellationLine[] = [];
    const boxes = new Map<string, Box>();
    const edges: TreeEdge[] = [];
    if (!graph) return { names, lines, boxes, edges };

    const placed = new Map<NodeKey, { stamp: StampLayout; scale: number; caption?: string }>();
    for (const n of graph.nodes.values()) {
      const state: StampState = n.key === graph.focus ? 'selected' : 'related';
      const scale = LIT_SCALE[state === 'selected' ? 'selected' : 'related'];
      const p = layout.pos(n.key) ?? { x: 0, y: 0 };
      let stamp: StampLayout;
      let caption = n.caption;
      let origin: { x: number; y: number } | undefined;
      if (n.kind === 'patient') {
        const s = wallStamp.get(n.patientId!);
        if (!s) continue;
        const patient = byId.get(n.patientId!);
        stamp = { ...s, x: p.x, y: p.y, opacity: 1 };
        origin = { x: s.x, y: s.y };
        caption =
          patient && (n.key === graph.focus || n.key === graph.root)
            ? graph.empty.has(n.key) && ![...graph.edges.values()].some((e) => e.from === n.key || e.to === n.key)
              ? `${subtitle(patient)}\n${NO_TIES}`
              : subtitle(patient)
            : undefined;
      } else stamp = nodeStamp(n, p.x, p.y);
      // What stories told about this person, under the record's own caption.
      const notes = graph.notes.get(n.key);
      if (notes) caption = [caption, ...notes].filter(Boolean).join('\n');
      const head = headline?.key === n.key ? headline.text : undefined;
      names.push({ key: n.key, stamp, state, caption, headline: head, pulse: loading.has(n.key) || fresh.has(n.key), origin });
      placed.set(n.key, { stamp, scale, caption });
      boxes.set(n.key, boxOf(stamp, scale, caption, head));
    }
    // One line per pair of names: the first tie found (live data comes before
    // the precomputed wall ties) is the one shown. Lines carry no sentence:
    // the tree's shape and each name's caption (role · record · year) already
    // say how two people are related.
    const drawn = new Set<string>();
    for (const e of graph.edges.values()) {
      const a = placed.get(e.from);
      const b = placed.get(e.to);
      const pair = [e.from, e.to].sort().join('~');
      if (!a || !b || drawn.has(pair)) continue;
      drawn.add(pair);
      lines.push({
        key: e.key,
        fromKey: e.from,
        toKey: e.to,
        from: a.stamp,
        to: b.stamp,
        fromScale: a.scale,
        toScale: b.scale,
        fromBelow: below(a.stamp, a.scale, a.caption),
        toBelow: below(b.stamp, b.scale, b.caption),
        certain: e.certain,
        reason: '',
        reference: '',
        showReference: false,
        labelAt: 0.5,
      });
      edges.push({ from: e.from, to: e.to, parent: e.parent, generations: e.generations, level: e.level });
    }
    return { names, lines, boxes, edges };
    // `settled`: re-read the positions once the tree has come to rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, loading, fresh, headline, wallStamp, byId, nodeStamp, layout, settled]);

  // A new tree opens in its own frame (where the beam is, in searchlight).
  const [frame, setFrame] = useState<Frame>(WALL_FRAME);
  const frameRoot = useRef<string | null>(null);
  useEffect(() => {
    if (!graph) {
      frameRoot.current = null;
      return;
    }
    let f = frame;
    if (graph.root !== frameRoot.current) {
      frameRoot.current = graph.root;
      f = { ...beamPoint.current(), scale: frameScale };
      setFrame(f);
    }
    layout.sync(graph.root, view.boxes, view.edges, f);
  }, [graph, layout, view, frame, frameScale]);

  // What the beam can select: names on the wall, or with a tree open the
  // names in it, at their live positions.
  const wallTargets = useMemo(
    () => stamps.map((s) => ({ key: `p:${s.id}`, em: `wall:${s.id}`, x: s.x, y: s.y, hw: s.width / 2, hh: s.size / 2, select: () => onClick(`p:${s.id}`) })),
    [stamps, onClick],
  );
  const targets = useRef(() => wallTargets);
  useEffect(() => {
    targets.current = !graph
      ? () => wallTargets
      : () =>
          view.names.map((n) => {
            const p = at(n.key) ?? n.stamp;
            const k = LIT_SCALE[n.state === 'selected' ? 'selected' : 'related'];
            return { key: n.key, em: n.key, x: p.x, y: p.y, hw: (n.stamp.width * k) / 2, hh: (n.stamp.size * k) / 2, select: () => onClick(n.key) };
          });
  }, [graph, view, wallTargets, at, onClick]);
  const beamBack = useCallback(() => {
    touch();
    back();
  }, [touch, back]);

  // The names a visitor can read right now, for the display registry: the
  // whole wall, or with a constellation open only its lit names (the dimmed
  // wall behind it is too faint to scan).
  const [screen] = useState(() => new URLSearchParams(window.location.search).get('screen') || SCREEN);
  const displayReport = useMemo((): DisplayReport | null => {
    if (!stamps.length || !bounds) return null;
    const wall = bounds;
    const entry = (key: string, s: StampLayout, state: DisplayStamp['state'], subtitle?: string): DisplayStamp => ({
      key,
      text: s.text,
      font: FONTS[s.combo.font].name,
      color: INK_NAMES[s.combo.ink],
      x: +((s.x + wall.width / 2) / wall.width).toFixed(4),
      y: +((wall.height / 2 - s.y) / wall.height).toFixed(4),
      size: +((s.size * (state === 'idle' ? 1 : LIT_SCALE[state])) / wall.height).toFixed(4),
      state,
      ...(subtitle ? { subtitle } : {}),
    });
    const sub = (id: number) => (byId.has(id) ? subtitle(byId.get(id)!) : undefined);
    if (!graph) {
      return { screen, view: 'wall', focus: null, stamps: stamps.map((s) => entry(patientKey(s.id), s, 'idle', sub(s.id))) };
    }
    const out: DisplayStamp[] = [];
    for (const n of view.names) {
      const key = fromNodeKey(n.key);
      const patient = n.key.startsWith('p:') ? Number(n.key.slice(2)) : null;
      if (key && (n.state === 'selected' || n.state === 'related')) out.push(entry(key, n.stamp, n.state, patient ? sub(patient) : n.caption));
    }
    // One question per wording: two records can read exactly alike.
    const guesses = [
      ...new Map(
        [...graph.guesses.values()].map((q) => {
          const question = guessQuestion(q.a.name, q.a.record, q.b.name, q.b.record);
          return [question, { keys: [personKey(q.a.id), personKey(q.b.id)] as [string, string], question, source: q.source }];
        }),
      ).values(),
    ];
    return { screen, view: 'constellation', focus: fromNodeKey(graph.focus), stamps: out, guesses };
  }, [screen, stamps, bounds, graph, view, byId]);
  useDisplayReport(displayReport);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {/* In searchlight a click on the background is the end of a drag. */}
      <Canvas flat dpr={[1, 2]} onPointerMissed={lit ? undefined : reset}>
        <color attach="background" args={['#000']} />
        {lit && searchlightModule ? (
          <searchlightModule.Scene sl={lit} targets={() => targets.current()} open={!!graph} onBack={beamBack} emphasisRef={emphasis} beamPointRef={beamPoint} />
        ) : (
          <FitWall />
        )}
        <Ticker layout={layout} />
        <FrameContext.Provider value={frame}>
          <Wall stamps={stamps} open={!!graph} lit={NONE} captions={NO_CAPTIONS} pulsing={NO_PULSE} emphasis={emphasis} onClick={(id) => onClick(`p:${id}`)} />
          <Constellation names={view.names} lines={view.lines} at={at} emphasis={emphasis} onClick={onClick} />
        </FrameContext.Provider>
      </Canvas>
      {lit && searchlightModule && <searchlightModule.Overlay sl={lit} debug={debug} />}
      {offline && <div className="offline">{ARCHIVE_OFFLINE}</div>}
      {debug && (
        <div className="debug">
          {`data: ${source}\nnames: ${stamps.length} @ ${baseSize.toFixed(1)} units\npatient index: ${patientIndex.size}\ngraph: ${graph ? `${graph.nodes.size} names, ${graph.edges.size} lines` : '–'}\nfocus: ${graph?.focus ?? '–'}\nloading: ${loading.size}\nreported: ${displayReport?.stamps.length ?? 0} names as "${screen}"`}
        </div>
      )}
    </main>
  );
}

