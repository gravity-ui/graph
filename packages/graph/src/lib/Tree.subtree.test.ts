import { Tree } from "./Tree";

function setup() {
  let token = 0;
  const root = new Tree({ iterate: () => true });
  root.setCulling({
    tileSize: 64,
    getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    getWalkToken: () => token,
    fullWalkShare: Infinity,
  });
  const add = (parent: Tree, x: number) => {
    const node = new Tree({ iterate: () => true });
    node.setBounds(x, x, x + 10, x + 10);
    parent.append(node);
    return node;
  };
  const walk = (blocked?: Tree) => {
    token++;
    const visited: Tree[] = [];
    root.traverseDown((node) => {
      if (node !== root) visited.push(node);
      return node !== blocked;
    });
    return visited;
  };
  const settle = (blocked?: Tree) => {
    walk(blocked);
    walk(blocked);
    return walk(blocked);
  };
  return { root, add, walk, settle, token: () => token };
}

describe("Culling component subtrees", () => {
  it("follows descendant bounds while preserving the parent's own bounds", () => {
    const { root, add, settle } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 20);
    expect(settle()).toEqual([parent, child, leaf]);

    leaf.setBounds(3000, 3000, 3010, 3010);
    expect(settle()).toEqual([]);
    parent.setBounds(30, 30, 40, 40);
    expect(settle()).toEqual([parent, child, leaf]);
  });

  it("shrinks subtree bounds after removal and child reconciliation", () => {
    const { root, add, settle } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 20);
    expect(settle()).toEqual([parent, child]);

    parent.remove(child);
    expect(settle()).toEqual([]);
    parent.append(child);
    expect(settle()).toEqual([parent, child]);
    parent.clearChildren();
    expect(settle()).toEqual([]);
  });

  it("keeps a branch walkable until every descendant reports bounds", () => {
    const { root, add, settle } = setup();
    const parent = add(root, 1000);
    const child = new Tree({ iterate: () => true });
    parent.append(child);
    expect(settle()).toEqual([parent, child]);

    child.setBounds(2000, 2000, 2010, 2010);
    expect(settle()).toEqual([]);
  });

  it.each([NaN, Infinity, 3000])("keeps invalid own bounds unbounded (minX: %s)", (minX) => {
    const { root, add, settle } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 1000);
    parent.setBounds(minX, 1000, 2000, 2000);
    expect(settle()).toEqual([parent, child]);

    parent.setBounds(1000, 1000, 2000, 2000);
    expect(settle()).toEqual([]);
  });

  it("recognizes skipped descendants without admitting removed nodes", () => {
    const { root, add, settle, token } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 3000);
    expect(settle()).toEqual([]);
    expect(leaf.isSkippedByCulling(token())).toBe(true);
    expect(leaf.isSkippedByCulling(token() - 1)).toBe(false);

    parent.remove(child);
    expect(leaf.isSkippedByCulling(token())).toBe(false);
  });

  it("preserves intentional child suppression before and after the parent is culled", () => {
    const { root, add, walk, settle, token } = setup();
    const parent = add(root, 1000);
    const child = add(parent, 2000);
    const leaf = add(child, 3000);
    walk();
    parent.requestWalk();
    walk(child);
    expect(leaf.isSkippedByCulling(token())).toBe(false);
    settle(child);
    expect(parent.isSkippedByCulling(token())).toBe(true);
    expect(child.isSkippedByCulling(token())).toBe(true);
    expect(leaf.isSkippedByCulling(token())).toBe(false);

    child.requestWalk();
    walk();
    settle();
    expect(leaf.isSkippedByCulling(token())).toBe(true);
  });
});
