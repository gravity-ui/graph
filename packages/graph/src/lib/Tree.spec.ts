import { ITree, Tree } from "./Tree";

describe("Tree", () => {
  const createChildData = () =>
    ({
      iterate: jest.fn(),
    }) as ITree;
  test("Creation of a Tree object", () => {
    const tree = new Tree(createChildData());
    expect(tree).toBeInstanceOf(Tree);
  });

  test("Adding and removing child elements", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    expect(parent.children.has(child1)).toBe(true);
    expect(parent.children.has(child2)).toBe(true);

    parent.remove(child1);
    parent.remove(child2);

    expect(parent.children.size).toBe(0);
  });

  test("Changing the rendering order", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    child1.renderOrder = 1;
    child2.renderOrder = 2;

    expect(child1.renderOrder).toBe(1);
    expect(child2.renderOrder).toBe(2);
  });

  test("Changing the z-index", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    parent.append(child1);
    parent.append(child2);

    child1.zIndex = 1;
    child2.zIndex = 2;

    expect(child1.zIndex).toBe(1);
    expect(child2.zIndex).toBe(2);
  });

  test("A child whose z-index changes is walked once, in its new group", () => {
    const parent = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());
    parent.append(child1);
    parent.append(child2);

    const walk = () => {
      const visited: Tree[] = [];
      parent.traverseDown((node) => {
        if (node !== parent) visited.push(node);
        return true;
      });
      return visited;
    };

    child1.updateZIndex(5);
    expect(walk()).toEqual([child2, child1]);
    expect(child1.renderOrder).toBe(1);

    child1.updateZIndex(1);
    expect(walk()).toEqual([child2, child1]);

    parent.remove(child2);
    expect(walk()).toEqual([child1]);
  });

  test("Traversing the tree", () => {
    const root = new Tree(createChildData());
    const child1 = new Tree(createChildData());
    const child2 = new Tree(createChildData());

    root.append(child1);
    root.append(child2);

    let count = 0;

    root.traverseDown((node) => {
      count++;
      expect(node).toBeInstanceOf(Tree);
      return true;
    });

    expect(count).toBe(3); // Including the root
  });
});

test("a scoped legacy iterator can resume child traversal after returning false", () => {
  let allow = false;
  let calls = 0;
  const root = new Tree({ iterate: () => allow });
  root.setCulling({ tileSize: 64, getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }) });
  root.append(
    new Tree({
      iterate: () => {
        calls++;
        return true;
      },
    })
  );
  root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
  expect(calls).toBe(0);
  allow = true;
  root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
  expect(calls).toBe(1);
});

describe("setChildren", () => {
  const leaf = (zIndex = 1): Tree => {
    const node = new Tree({ iterate: () => true });
    node.zIndex = zIndex;
    return node;
  };
  const order = (parent: Tree): Tree[] => parent.getOrderedChildren();

  function scoped(): { root: Tree; revision: () => number } {
    const root = new Tree({ iterate: () => true });
    root.setCulling({ tileSize: 64, getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }) });
    return { root, revision: () => root.scope?.structureRevision ?? -1 };
  }

  it("keeps the scope structure when a component reconciles the same children", () => {
    const { root, revision } = scoped();
    const children = [leaf(), leaf(2), leaf()];
    root.setChildren(children);
    const before = revision();
    root.setChildren([...children]);
    expect(revision()).toBe(before);
    expect(order(root)).toEqual([children[0], children[2], children[1]]);
  });

  it("rebuilds the order when the same children arrive in another order", () => {
    const { root, revision } = scoped();
    const [a, b, c] = [leaf(), leaf(), leaf()];
    root.setChildren([a, b, c]);
    const before = revision();
    root.setChildren([c, a, b]);
    expect(revision()).toBeGreaterThan(before);
    expect(order(root)).toEqual([c, a, b]);
  });

  it("restores the list order within a z-index after a child moved between z-indexes", () => {
    const { root } = scoped();
    const [a, b, c] = [leaf(), leaf(), leaf()];
    root.setChildren([a, b, c]);
    b.updateZIndex(2);
    b.updateZIndex(1);
    // The group now lists b last; reconciling the original list puts it back between a and c.
    expect(order(root)).toEqual([a, c, b]);
    root.setChildren([a, b, c]);
    expect(order(root)).toEqual([a, b, c]);
  });
});
