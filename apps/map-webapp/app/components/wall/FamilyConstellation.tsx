import { useMemo } from 'react';
import type { Graph } from '../family-graph/projection/useConstellation';
import Constellation, { type ConstellationLine } from './Constellation';
import Stamp from './Stamp';
import { captionSize, captionTop } from './Stamp';
import type { StampLayout } from './wallLayout';

export default function FamilyConstellation({ graph, anchor, rootCaption, onSelect }: { graph: Graph; anchor: StampLayout; rootCaption: string; onSelect: (key: string) => void }) {
  const layout = useMemo(() => {
    const others = [...graph.nodes.values()].filter(node => node.key !== graph.root);
    const positions = new Map<string, StampLayout>([[graph.root, anchor]]);
    others.forEach((node, i) => {
      const angle = 2 * Math.PI * i / Math.max(others.length, 1) - Math.PI / 2;
      const radius = Math.max(200, anchor.width * 2.5, others.length * 28);
      positions.set(node.key, { ...anchor, id: -(i + 1), text: node.name, x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius * .65, rotation: 0, width: Math.max(anchor.size * 2, node.name.length * anchor.size * .6), opacity: 1 });
    });
    const lines: ConstellationLine[] = [...graph.edges.values()].flatMap(edge => {
      const from = positions.get(edge.from), to = positions.get(edge.to);
      if (!from || !to || from === to) return [];
      const below = (stamp: StampLayout, key: string) => {
        const caption = key === graph.root ? rootCaption : graph.nodes.get(key)?.caption;
        return caption ? (key === graph.root ? 2 : 1.6) * (-captionTop(stamp) + captionSize(stamp) * 1.25 * caption.split('\n').length) : 0;
      };
      return [{ key: edge.key, from, to, fromScale: edge.from === graph.root ? 2 : 1.6, toScale: edge.to === graph.root ? 2 : 1.6, fromBelow: below(from, edge.from), toBelow: below(to, edge.to), certain: edge.certain, reason: '', reference: '' }];
    });
    return { positions, lines };
  }, [graph, anchor, rootCaption]);
  return <><Constellation lines={layout.lines} />{[...graph.nodes.values()].filter(node => node.key !== graph.root).map(node => {
    const stamp = layout.positions.get(node.key)!;
    return <Stamp key={node.key} stamp={stamp} state="related" caption={node.caption} onSelect={() => onSelect(node.key)} />;
  })}</>;
}
