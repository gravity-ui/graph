import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type TNodeData = ITree & { name: string };

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

function setup({ fullWalkShare = Infinity }: { fullWalkShare?: number } = {}) {
  const walked: string[] = [];
  const state: { viewport: TTileRect | undefined; token: number } = { viewport: rect(0, 0, 100, 100), token: 0 };
  const data = (name: string): TNodeData => ({
    name,
    iterate: () => {
      walked.push(name);
      return true;
    },
  });
  const root = new Tree<TNodeData>(data("root"));
  root.setCulling({
    tileSize: 64,
    getViewport: () => state.viewport,
    getWalkToken: () => state.token,
    fullWalkShare,
  });

  const add = (name: string, x: number, y: number, zIndex = 1, size = 10): Tree<TNodeData> => {
    const node = new Tree<TNodeData>(data(name));
    node.zIndex = zIndex;
    node.setBounds(x, y, x + size, y + size);
    root.append(node);
    return node;
  };

  const walk = (): string[] => {
    state.token += 1;
    walked.length = 0;
    root.traverseDown((node) => node.data.iterate());
    return walked.filter((name) => name !== "root");
  };

  /** New children are walked twice (first iterate, then to notice they are out of view). */
  const settle = (): string[] => {
    walk();
    walk();
    return walk();
  };

  const fullOrder = (): string[] => {
    const viewport = state.viewport;
    state.viewport = undefined;
    const order = walk();
    state.viewport = viewport;
    // The full walk made every child "active"; walk once more so they settle again.
    walk();
    return order;
  };

  return { root, state, add, walk, settle, fullOrder };
}

describe("Tree visibility culling", () => {
  it("walks only children in view, in the order of a full walk", () => {
    const { add, settle, fullOrder } = setup();
    add("a", 10, 10, 2);
    add("b", 500, 500, 1);
    add("c", 20, 20, 1);
    add("d", 30, 30, 3);
    add("e", 90, 90, 1);
    add("f", -500, 40, 2);

    expect(settle()).toEqual(["c", "e", "a", "d"]);
    expect(fullOrder()).toEqual(["b", "c", "e", "a", "f", "d"]);
  });

  it("walks every new child, then once more, then only those in view", () => {
    const { add, walk } = setup();
    add("in", 10, 10);
    add("out", 1000, 1000);

    expect(walk()).toEqual(["in", "out"]);
    expect(walk()).toEqual(["in", "out"]);
    expect(walk()).toEqual(["in"]);
  });

  it("keeps renderOrder of every child equal to its position in a full walk", () => {
    const { root, add, settle } = setup();
    const nodes = [add("a", 10, 10), add("b", 1000, 1000), add("c", 20, 20), add("d", 2000, 2000)];
    settle();

    // Raise an out-of-view child: it moves to the end of the draw order.
    nodes[1].updateZIndex(5);
    settle();

    const expected = ["a", "c", "d", "b"];
    for (const node of nodes) {
      expect(node.renderOrder).toBe(expected.indexOf(node.data.name));
    }
    expect(root.children.size).toBe(4);
  });

  it("walks an out-of-view child that requested an update once", () => {
    const { add, settle, walk } = setup();
    add("in", 10, 10);
    const out = add("out", 1000, 1000);
    settle();

    out.requestWalk();
    expect(walk()).toEqual(["in", "out"]);
    expect(walk()).toEqual(["in"]);
  });

  it("walks the branch of a descendant that requested an update", () => {
    const { add, settle, walk } = setup();
    const out = add("out", 1000, 1000);
    const leaf = new Tree<TNodeData>({ name: "leaf", iterate: () => true });
    out.append(leaf);
    settle();

    leaf.requestWalk();
    expect(walk()).toEqual(["out"]);
    expect(walk()).toEqual([]);
  });

  it("walks a child once more after it leaves the view", () => {
    const { state, add, settle, walk } = setup();
    add("a", 10, 10);
    add("b", 300, 300);
    expect(settle()).toEqual(["a"]);

    state.viewport = rect(250, 250, 350, 350);
    expect(walk()).toEqual(["a", "b"]);
    expect(walk()).toEqual(["b"]);
  });

  it("follows bounds changes", () => {
    const { add, settle, walk } = setup();
    const node = add("a", 1000, 1000);
    expect(settle()).toEqual([]);

    node.setBounds(50, 50, 60, 60);
    expect(walk()).toEqual(["a"]);

    node.setBounds(5000, 5000, 5010, 5010);
    // Once more to notice it left the view.
    expect(walk()).toEqual(["a"]);
    expect(walk()).toEqual([]);
  });

  it("walks children without known bounds every time", () => {
    const { root, settle } = setup();
    const node = new Tree<TNodeData>({ name: "unknown", iterate: () => true });
    root.append(node);
    expect(settle()).toEqual([]);
    expect(root.children.has(node)).toBe(true);
  });

  it("does not walk removed children", () => {
    const { root, add, settle, walk } = setup();
    add("in", 10, 10);
    const out = add("out", 1000, 1000);
    settle();

    out.requestWalk();
    root.remove(out);
    expect(walk()).toEqual(["in"]);
  });

  it("walks every child without a viewport or when the viewport covers all of them", () => {
    const { state, add, settle, walk } = setup();
    add("a", 10, 10);
    add("b", 1000, 1000);
    settle();

    state.viewport = undefined;
    expect(walk()).toEqual(["a", "b"]);

    state.viewport = rect(-10, -10, 2000, 2000);
    expect(walk()).toEqual(["a", "b"]);
  });

  it("walks every child when most of them are near the viewport", () => {
    const { add, settle } = setup({ fullWalkShare: 0.5 });
    add("a", 10, 10);
    add("b", 20, 20);
    add("c", 1000, 1000);
    // Two of three children are candidates: walking all of them is cheaper than culling.
    expect(settle()).toEqual(["a", "b", "c"]);

    add("d", 2000, 2000);
    add("e", 3000, 3000);
    expect(settle()).toEqual(["a", "b"]);
  });

  it("marks out-of-view children as skipped for the traversal that skipped them", () => {
    const { root, state, add, settle } = setup();
    const inView = add("in", 10, 10);
    const out = add("out", 1000, 1000);
    settle();

    expect(out.isSkippedByCulling(state.token)).toBe(true);
    expect(out.isSkippedByCulling(state.token - 1)).toBe(false);
    // Also true for walked children: the parent walked its children in this traversal.
    expect(inView.isSkippedByCulling(state.token)).toBe(true);

    root.remove(out);
    expect(out.isSkippedByCulling(state.token)).toBe(false);
  });

  it("orders large and small selections like a full walk", () => {
    const { state, add, settle, fullOrder } = setup();
    let seed = 3;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const positions = new Map<string, [number, number]>();
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(random() * 1000);
      const y = Math.floor(random() * 1000);
      positions.set(`n${i}`, [x, y]);
      add(`n${i}`, x, y, 1 + Math.floor(random() * 3));
    }

    // Small viewport takes the sort path, a large one takes the filter path.
    for (const viewport of [rect(100, 100, 200, 200), rect(0, 0, 900, 950)]) {
      state.viewport = viewport;
      const culled = settle();
      const visible = new Set(
        Array.from(positions.entries())
          .filter(
            ([, [x, y]]) =>
              x <= viewport.maxX && x + 10 >= viewport.minX && y <= viewport.maxY && y + 10 >= viewport.minY
          )
          .map(([name]) => name)
      );
      expect(culled).toEqual(fullOrder().filter((name) => visible.has(name)));
      expect(culled.length).toBe(visible.size);
    }
  });
});
