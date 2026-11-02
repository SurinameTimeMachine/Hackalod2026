import type { FamilyTree, TreeNode } from './familyLayout';
import FamilyTreeView from './FamilyTreeView';
import type { StampLayout } from './wallLayout';

// The family tree over a calm paper sheet, so the wall of names does not compete with it.
export default function FamilyConstellation({ tree, anchor, onSelect, onClose }: { tree: FamilyTree; anchor: StampLayout; onSelect: (node: TreeNode) => void; onClose: () => void }) {
  return <>
    <mesh position={[anchor.x, anchor.y, 2]} onClick={event => { event.stopPropagation(); onClose(); }}>
      <planeGeometry args={[9000, 6000]} />
      <meshBasicMaterial color="#f6efdc" transparent opacity={0.97} depthWrite={false} />
    </mesh>
    <FamilyTreeView tree={tree} anchor={anchor} onSelect={onSelect} />
  </>;
}
