import type { Tree } from "../Tree";

/** Eligible nodes of one scope in local paint order; listed nodes carry the order's stamp. */
export type TPaintOrder = { revision: number; stamp: number; nodes: Tree[] };

/**
 * Lists the owner and every node reached through nodes that walk their children, in local z-order. A node is eligible
 * exactly when it is listed: publication tells eligibility by `orderStamp === stamp`.
 */
export function buildPaintOrder(owner: Tree, stamp: number, revision: number): TPaintOrder {
  const scope = owner.scope;
  const nodes: Tree[] = [];
  const collect = (node: Tree): void => {
    node.orderStamp = stamp;
    nodes.push(node);
    if (!node.childrenWalkAllowed || !node.children.size) return;
    const children = node.getOrderedChildren();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.parent !== node || child.scope !== scope) continue;
      if (child.childrenWalkAllowed && child.children.size) {
        collect(child);
      } else {
        // Most nodes are leaves: list them without another call.
        child.orderStamp = stamp;
        nodes.push(child);
      }
    }
  };
  collect(owner);
  return { revision, stamp, nodes };
}
