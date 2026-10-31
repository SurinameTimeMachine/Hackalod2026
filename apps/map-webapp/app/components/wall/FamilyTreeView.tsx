import { Line, Text } from '@react-three/drei';
import { useMemo, useState } from 'react';
import { CubicBezierCurve3, QuadraticBezierCurve3, Vector3 } from 'three';
import { CAPTION_FONT } from './stampStyle';
import { CAPTION_SIZE, DOT, NAME_SIZE, type FamilyTree, type TreeEdge, type TreeNode } from './familyLayout';

const NAME_FONT = '/fonts/im-fell-english.woff';
const INK = '#3d352a';
const THREAD = '#82601c';
const LINK = '#2b6f77';
const PAPER = '#f6efdc';

const COLORS: Record<TreeNode['kind'], string> = {
  patient: '#c98a0b',
  person: '#51483a',
  summary: '#926000',
  told: '#52623b',
  narrator: '#52623b',
  connection: LINK,
};

function curve(edge: TreeEdge, a: TreeNode, b: TreeNode) {
  if (edge.kind === 'parent') {
    const start = new Vector3(a.x, a.y - a.bottom - 4, 0), end = new Vector3(b.x, b.y + DOT + 3, 0);
    const mid = (start.y + end.y) / 2;
    return new CubicBezierCurve3(start, new Vector3(start.x, mid, 0), new Vector3(end.x, mid, 0), end).getPoints(36);
  }
  const start = new Vector3(a.x, a.y, 0), end = new Vector3(b.x, b.y, 0);
  const dx = end.x - start.x, dy = end.y - start.y, dist = Math.hypot(dx, dy) || 1;
  if (edge.kind === 'level') {
    return [start, end];
  }
  // Connections bow sideways so they stay clear of the family lines.
  const bow = Math.min(dist * 0.28, 240) * (dx >= 0 ? 1 : -1);
  return new QuadraticBezierCurve3(start, new Vector3((start.x + end.x) / 2 - (dy / dist) * bow, (start.y + end.y) / 2 + (dx / dist) * bow, 0), end).getPoints(36);
}

function Edge({ edge, points, state }: { edge: TreeEdge; points: Vector3[]; state: 'normal' | 'lit' | 'dim' }) {
  const link = edge.kind === 'link';
  const dashed = link || !edge.certain;
  return <Line
    points={points}
    color={link ? LINK : THREAD}
    lineWidth={state === 'lit' ? 3 : link ? 1.2 : 1.8}
    transparent
    opacity={state === 'lit' ? 1 : state === 'dim' ? 0.12 : link ? 0.55 : edge.certain ? 0.85 : 0.6}
    dashed={dashed}
    dashSize={dashed ? 7 : undefined}
    gapSize={dashed ? 6 : undefined}
  />;
}

function Person({ node, dim, lit, onHover, onSelect }: { node: TreeNode; dim: boolean; lit: boolean; onHover: (key: string | null) => void; onSelect: (node: TreeNode) => void }) {
  const hollow = node.kind === 'summary';
  const radius = node.root ? DOT * 1.6 : DOT;
  const opacity = dim ? 0.3 : 1;
  const enter = () => { document.body.style.cursor = 'pointer'; onHover(node.key); };
  const leave = () => { document.body.style.cursor = ''; onHover(null); };
  return <group position={[node.x, node.y, 3]}>
    <mesh
      onClick={event => { event.stopPropagation(); onSelect(node); }}
      onPointerOver={enter}
      onPointerOut={leave}
    >
      <circleGeometry args={[radius + (lit ? 3 : 0), 28]} />
      <meshBasicMaterial color={hollow ? PAPER : COLORS[node.kind]} transparent opacity={opacity} />
    </mesh>
    {(hollow || node.root || lit) && <mesh position={[0, 0, -0.01]}>
      <ringGeometry args={[radius + 1, radius + 4, 28]} />
      <meshBasicMaterial color={hollow ? COLORS.summary : COLORS[node.kind]} transparent opacity={opacity * 0.8} />
    </mesh>}
    <Text
      font={NAME_FONT}
      fontSize={node.root ? NAME_SIZE * 1.25 : NAME_SIZE}
      color={INK}
      fillOpacity={opacity}
      anchorX="center"
      anchorY="top"
      textAlign="center"
      maxWidth={200}
      lineHeight={1.1}
      position={[0, -(radius + 7), 0]}
      outlineWidth="6%"
      outlineColor={PAPER}
      outlineOpacity={opacity}
      onClick={event => { event.stopPropagation(); onSelect(node); }}
      onPointerOver={enter}
      onPointerOut={leave}
    >
      {node.name}
    </Text>
    {node.caption && <Text
      font={CAPTION_FONT}
      fontSize={CAPTION_SIZE}
      color={THREAD}
      fillOpacity={opacity}
      anchorX="center"
      anchorY="top"
      textAlign="center"
      maxWidth={200}
      lineHeight={1.3}
      position={[0, -(node.bottom - CAPTION_SIZE * 1.3 * Math.max(1, Math.ceil((node.caption.length * CAPTION_SIZE * 0.6) / 200))), 0]}
    >
      {node.caption}
    </Text>}
  </group>;
}

// A family tree: generations in rows, family as warm curved lines, people who
// probably knew each other as teal dashed arcs. Hover a name to read why.
export default function FamilyTreeView({ tree, anchor, onSelect }: { tree: FamilyTree; anchor: { x: number; y: number }; onSelect: (node: TreeNode) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const paths = useMemo(() => tree.edges.flatMap(edge => {
    const a = tree.nodes.get(edge.from), b = tree.nodes.get(edge.to);
    return a && b ? [{ edge, points: curve(edge, a, b), a, b }] : [];
  }), [tree]);
  const touching = (edge: TreeEdge) => hovered !== null && (edge.from === hovered || edge.to === hovered);
  const litNodes = new Set<string>();
  if (hovered) { litNodes.add(hovered); for (const { edge } of paths) if (touching(edge)) { litNodes.add(edge.from); litNodes.add(edge.to); } }
  return <group position={[anchor.x, anchor.y, 0]}>
    {paths.map(({ edge, points }) => <group key={edge.key} position={[0, 0, 2.5]}>
      <Edge edge={edge} points={points} state={hovered === null ? 'normal' : touching(edge) ? 'lit' : 'dim'} />
    </group>)}
    {tree.edges.filter(touching).map(edge => {
      const a = tree.nodes.get(edge.from), b = tree.nodes.get(edge.to);
      const text = [edge.reason, edge.reference].filter(Boolean).join('\n');
      if (!a || !b || !text) return null;
      return <Text
        key={`label:${edge.key}`}
        font={CAPTION_FONT}
        fontSize={13}
        color={edge.kind === 'link' ? LINK : THREAD}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        maxWidth={260}
        lineHeight={1.3}
        position={[(a.x + b.x) / 2, (a.y + b.y) / 2, 6]}
        outlineWidth="14%"
        outlineColor={PAPER}
      >
        {text}
      </Text>;
    })}
    {[...tree.nodes.values()].map(node => <Person key={node.key} node={node} dim={hovered !== null && !litNodes.has(node.key)} lit={hovered === node.key} onHover={setHovered} onSelect={onSelect} />)}
  </group>;
}
