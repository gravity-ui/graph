import { ITree, Tree } from "./Tree";

function setup() {
  let token = 0;
  const root = new Tree({ iterate: () => true });
  root.setCulling({
    tileSize: 64,
    getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    getWalkToken: () => token,
  });
  const add = (parent: Tree, x?: number) => {
    const node = new Tree<ITree>({ prepareUpdate: () => true, iterate: () => true });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    parent.append(node);
    return node;
  };
  const walk = () => {
    token++;
    const visited: Tree[] = [];
    root.traverseDown((node) => {
      if (node !== root) visited.push(node);
      return node.data.iterate();
    });
    return visited;
  };
  return { root, add, walk, token: () => token };
}

describe("Tree descendant visibility", () => {
  it("reaches a visible leaf through finite offscreen ancestors without visiting them or enlarging their bounds", () => {
    const { root, add, walk } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 20);
    walk();
    expect(walk()).toEqual([leaf]);
    expect([parent.isVisible(), child.isVisible(), leaf.isVisible()]).toEqual([false, false, true]);
    expect([parent.boundsMinX, parent.boundsMaxX]).toEqual([1000, 1010]);
    expect(root["culling"]?.index.size).toBe(3);
    expect(parent["culling"]).toBeUndefined();
    leaf.setBounds(3000, 3000, 3010, 3010);
    expect(walk()).toEqual([]);
    parent.setBounds(30, 30, 40, 40);
    expect(walk()).toEqual([parent]);
  });

  it.each([undefined, NaN, Infinity])(
    "walks unknown bounds conservatively without admitting offscreen children (%s)",
    (bound) => {
      const { root, add, walk } = setup();
      const parent = add(root, bound);
      add(parent, 2000);
      walk();
      expect(walk()).toEqual([parent]);
      expect(parent.isVisible()).toBe(true);
    }
  );

  it("preserves point-query eligibility for untouched branches but rejects removed descendants", () => {
    const { root, add, walk, token } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 3000);
    walk();
    expect(walk()).toEqual([]);
    expect(leaf.isSkippedByCulling(token())).toBe(true);
    expect(leaf.isSkippedByCulling(token() - 1)).toBe(false);
    parent.remove(child);
    expect(leaf.isSkippedByCulling(token())).toBe(false);
  });

  it("rejects intentionally suppressed descendants even after their ancestors are culled", () => {
    const { root, add, walk, token } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 3000);
    walk();
    child.data.prepareUpdate = () => false;
    child.requestWalk();
    walk();
    walk();
    expect(parent.isSkippedByCulling(token())).toBe(true);
    expect(child.isSkippedByCulling(token())).toBe(true);
    expect(leaf.isSkippedByCulling(token())).toBe(false);
    child.data.prepareUpdate = () => true;
    child.requestWalk();
    walk();
    walk();
    expect(leaf.isSkippedByCulling(token())).toBe(true);
  });

  it("reconciles reordered children without leaving stale entries", () => {
    const { root, add, walk } = setup();
    const a = add(root, 10);
    const b = add(root, 20);
    const leaf = add(b, 30);
    walk();
    root.clearChildren();
    root.append(b);
    root.append(a);
    expect(walk()).toEqual([b, leaf, a]);
    root.setChildren([a]);
    expect(walk()).toEqual([a]);
    expect(root["culling"]?.index.size).toBe(1);
  });
});
