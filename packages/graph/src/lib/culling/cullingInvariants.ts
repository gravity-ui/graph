import type { Tree } from "../Tree";

import type { TreeCulling } from "./TreeCulling";
import { intersects } from "./VisibilityPublication";

let verifying = false;

/** Whether verifyCulling() is running. Work-counting test probes skip what it reads: the check is not culling work. */
export function isVerifyingCulling(): boolean {
  return verifying;
}

/**
 * Whether every ancestor up to the owner contains the node and walks its children; recomputed from the hierarchy,
 * independently of the paint order.
 */
function isWalked(node: Tree, owner: Tree): boolean {
  for (let current = node; current !== owner; ) {
    const parent = current.parent;
    if (!parent || !parent.children.has(current) || !parent.childrenWalkAllowed) return false;
    current = parent;
  }
  return true;
}

/**
 * Recomputes invariants 1–3 of TreeCulling after a walk and throws on a mismatch. Nodes whose membership, structure or
 * bounds changed while painting are published from the next frame and are skipped.
 */
export function verifyCulling(scope: TreeCulling): void {
  verifying = true;
  try {
    const errors: string[] = [];
    const listed = scope.publication.visibleNodes;
    listed.forEach((node, slot) => {
      if (node.visibleSlot !== slot || !node.published) errors.push(`visible list slot ${slot}`);
    });
    const published = scope.nodes.filter((node) => node.published).length;
    if (published !== listed.length) errors.push(`${published} published nodes, ${listed.length} listed`);
    if (scope.visibilityRevision === scope.structureRevision) {
      const viewport = scope.frameViewport;
      scope.nodes.forEach((node, slot) => {
        if (node.freshSlot >= 0 || node.boundsSlot >= 0) return;
        const expected = isWalked(node, scope.owner) && intersects(node, viewport);
        if (node.published !== expected) {
          errors.push(`node at slot ${slot} published ${node.published}, expected ${expected}`);
        }
      });
    }
    if (errors.length) throw new Error(`TreeCulling invariants: ${errors.slice(0, 5).join("; ")}`);
  } finally {
    verifying = false;
  }
}
