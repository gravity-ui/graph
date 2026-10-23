import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type TNodeData = ITree & { name: string };
const rect = (x: number, y = x, size = 10): TTileRect => ({ minX: x, minY: y, maxX: x + size, maxY: y + size });

function setup() {
  const prepared: string[] = [];
  const drawn: string[] = [];
  const visited: string[] = [];
  const events: string[] = [];
  const state: { viewport: TTileRect | undefined; token: number } = { viewport: rect(0, 0, 100), token: 0 };
  const make = (name: string, x?: number) => {
    const node = new Tree<TNodeData>({
      name,
      prepareUpdate: () => {
        prepared.push(name);
        events.push(`prepare:${name}`);
        return true;
      },
      onViewportChange: (visible) => {
        events.push(`visible:${name}:${visible}`);
      },
      iterate: () => {
        visited.push(name);
        if (node.isVisible()) {
          drawn.push(name);
          events.push(`draw:${name}`);
        }
        return true;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    return node;
  };
  const root = make("root");
  const configure = () =>
    root.setCulling({ tileSize: 64, getViewport: () => state.viewport, getWalkToken: () => state.token });
  configure();
  const add = (name: string, x?: number, parent = root) => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const walk = () => {
    prepared.length = drawn.length = visited.length = events.length = 0;
    state.token++;
    root.traverseDown((node) => node.data.iterate());
    return { prepared: prepared.slice(), drawn: drawn.slice(), visited: visited.slice(), events: events.slice() };
  };
  return { root, state, add, make, walk, configure };
}

describe("Tree native spatial scope", () => {
  it("prepares new offscreen nodes once without painting them", () => {
    const { add, walk } = setup();
    add("visible", 10);
    add("offscreen", 1000);
    expect(walk()).toMatchObject({
      prepared: ["root", "visible", "offscreen"],
      drawn: ["root", "visible"],
      visited: ["root", "visible", "offscreen"],
    });
    expect(walk()).toMatchObject({ prepared: ["root", "visible"], visited: ["root", "visible"] });
  });

  it("prepares pending nodes and their ancestors without walking clean siblings", () => {
    const { add, walk } = setup();
    const parent = add("parent", 1000);
    const child = add("child", 2000, parent);
    add("sibling", 3000, parent);
    walk();
    child.requestWalk();
    expect(walk()).toMatchObject({
      prepared: ["root", "parent", "child"],
      visited: ["root", "parent", "child"],
      drawn: ["root"],
    });
    expect(walk().visited).toEqual(["root"]);
  });

  it("finds children and geometry changed during preparation before any painting", () => {
    const { add, make, root, walk } = setup();
    const parent = add("parent", 1000);
    const moved = add("moved", 2000);
    walk();
    const child = make("new", 3000);
    parent.data.prepareUpdate = () => {
      parent.append(child);
      moved.setBounds(30, 30, 40, 40);
      return true;
    };
    child.data.prepareUpdate = () => {
      child.setBounds(50, 50, 60, 60);
      return true;
    };
    parent.requestWalk();
    const result = walk();
    expect(result.drawn).toEqual(["root", "new", "moved"]);
    expect(result.visited).toEqual(["root", "parent", "new", "moved"]);
    expect(result.events.indexOf("prepare:moved")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(root.children.size).toBe(2);
  });

  it("defers requests from an already prepared node to the next frame", () => {
    const { add, walk } = setup();
    const out = add("out", 1000);
    let count = 0;
    out.data.prepareUpdate = () => {
      count++;
      if (count === 1) out.requestWalk();
      return true;
    };
    walk();
    expect(count).toBe(1);
    walk();
    expect(count).toBe(2);
    walk();
    expect(count).toBe(2);
  });

  it("publishes both viewport transitions before the root draws without iterating a clean exit", () => {
    const { state, add, walk } = setup();
    add("left", 10);
    add("right", 300);
    walk();
    state.viewport = rect(250, 250, 100);
    const result = walk();
    expect(result.visited).toEqual(["root", "right"]);
    expect(result.events.indexOf("visible:left:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:right:true")).toBeLessThan(result.events.indexOf("draw:root"));
  });

  it("uses current exact bounds even for nodes just outside the viewport", () => {
    const { add, walk } = setup();
    const edge = add("edge", 100);
    const out = add("out", 100.01);
    expect(walk().drawn).toEqual(["root", "edge"]);
    expect(out.isVisible()).toBe(false);
    edge.setBounds(1000, 1000, 1010, 1010);
    out.setBounds(30, 30, 40, 40);
    expect(walk().drawn).toEqual(["root", "out"]);
  });

  it("reads live visibility in update hooks without publishing intermediate transitions", () => {
    const { state, add, walk } = setup();
    const node = add("node", 300);
    walk();
    const visibility: boolean[] = [];
    node.data.prepareUpdate = () => {
      visibility.push(node.isVisible());
      node.setBounds(2000, 2000, 2010, 2010);
      visibility.push(node.isVisible());
      node.setBounds(300, 300, 310, 310);
      return true;
    };
    state.viewport = rect(250, 250, 100);

    const result = walk();
    expect(visibility).toEqual([true, false]);
    expect(result.events.filter((event) => event.startsWith("visible:node:"))).toEqual(["visible:node:true"]);
    expect(result.events.indexOf("visible:node:true")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.drawn).toEqual(["root", "node"]);
  });

  it("resumes live visibility reads after a paint callback throws", () => {
    const { state, add, walk } = setup();
    const node = add("node", 10);
    node.data.iterate = () => {
      throw new Error("paint failed");
    };
    expect(walk).toThrow("paint failed");

    state.viewport = rect(250, 250, 100);
    expect(node.isVisible()).toBe(false);
    node.setBounds(300, 300, 310, 310);
    expect(node.isVisible()).toBe(true);
  });

  it("prepares and paints everything when the viewport is disabled", () => {
    const { state, add, walk } = setup();
    const parent = add("parent", 1000);
    add("child", 2000, parent);
    walk();
    state.viewport = undefined;
    expect(walk()).toMatchObject({ prepared: ["root", "parent", "child"], drawn: ["root", "parent", "child"] });
    expect(parent.isSkippedByCulling(state.token)).toBe(false);
  });

  it("disables traversal filtering without allowing offscreen paint", () => {
    const { root, add, walk } = setup();
    const out = add("out", 1000);
    root.setCulling({ tileSize: 64, getViewport: () => rect(0, 0, 100), isEnabled: () => false });
    walk();
    expect(walk()).toMatchObject({ prepared: ["root", "out"], visited: ["root", "out"], drawn: ["root"] });
    expect(out.isVisible()).toBe(false);
  });

  it("never prepares descendants behind a suppressed ancestor", () => {
    const { add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    add("leaf", 30, child);
    parent.data.prepareUpdate = () => false;
    const result = walk();
    expect(result.prepared).toEqual(["root"]);
    expect(result.visited).toEqual(["root", "parent"]);
  });

  it("keeps a suppressed descendant invisible to update hooks after a full-viewport traversal", () => {
    const { root, add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    parent.data.prepareUpdate = () => false;
    walk();
    const observed: boolean[] = [];
    root.data.prepareUpdate = () => {
      observed.push(child.isVisible());
      return true;
    };
    walk();
    expect(observed).toEqual([false]);
  });

  it("keeps a configured root when attached below an unscoped tree", () => {
    const { root, add, walk } = setup();
    add("out", 1000);
    const outer = new Tree({ iterate: () => true });
    outer.append(root);
    expect(walk()).toMatchObject({ prepared: ["root", "out"], visited: ["root", "out"], drawn: ["root"] });
  });

  it("keeps local z-index ordering after updates without scanning clean siblings each frame", () => {
    const { root, add, walk } = setup();
    const a = add("a", 10);
    const b = add("b", 1000);
    const c = add("c", 20);
    a.updateZIndex(5);
    expect(walk().drawn).toEqual(["root", "c", "a"]);
    b.updateZIndex(10);
    expect(walk().drawn).toEqual(["root", "c", "a"]);
    expect([c.renderOrder, a.renderOrder, b.renderOrder]).toEqual([0, 1, 2]);
    const siblings = jest.spyOn(root.children, Symbol.iterator);
    expect(walk().drawn).toEqual(["root", "c", "a"]);
    expect(siblings).not.toHaveBeenCalled();
  });

  it("uses the tile query when large offscreen items are a minority", () => {
    const { root, add, walk } = setup();
    for (let i = 0; i < 1000; i++) {
      const x = 1000 + i * 1024;
      const size = i < 400 ? 512 : 10;
      add(`out${i}`).setBounds(x, 1000, x + size, 1000 + size);
    }
    walk();
    const scope = root["culling"];
    if (!scope) throw new Error("Missing root scope");
    const query = jest.spyOn(scope.index, "query");
    const linearScan = jest.spyOn(scope.nodes, Symbol.iterator);

    expect(walk().drawn).toEqual(["root"]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(linearScan).not.toHaveBeenCalled();
  });

  it("preserves full traversal order for sparse and dense randomized visibility selections", () => {
    const { root, state, add, walk, configure } = setup();
    let seed = 3;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const positions = new Map<string, [number, number]>();
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(random() * 1000);
      const y = Math.floor(random() * 1000);
      const name = `n${i}`;
      positions.set(name, [x, y]);
      const node = add(name);
      node.setBounds(x, y, x + 10, y + 10);
      node.updateZIndex(1 + Math.floor(random() * 3));
    }
    root.setCulling(undefined);
    const fullOrder = walk().drawn;
    configure();
    const scope = root["culling"];
    if (!scope) throw new Error("Missing root scope");
    const query = jest.spyOn(scope.index, "query");
    const linearScan = jest.spyOn(scope.nodes, Symbol.iterator);

    for (const [viewport, usesQuery] of [
      [rect(100, 100, 100), true],
      [rect(0, 0, 950), false],
    ] as const) {
      state.viewport = viewport;
      query.mockClear();
      linearScan.mockClear();
      const visible = new Set(
        Array.from(positions.entries())
          .filter(
            ([, [x, y]]) =>
              x <= viewport.maxX && x + 10 >= viewport.minX && y <= viewport.maxY && y + 10 >= viewport.minY
          )
          .map(([name]) => name)
      );
      expect(walk().drawn).toEqual(fullOrder.filter((name) => name === "root" || visible.has(name)));
      expect(query).toHaveBeenCalledTimes(usesQuery ? 1 : 0);
      expect(linearScan).toHaveBeenCalledTimes(usesQuery ? 0 : 1);
    }
  });

  it("keeps retained descendants indexed and clean during reconciliation", () => {
    const { root, add, walk } = setup();
    const container = add("container");
    add("out", 1000, container);
    walk();
    const index = root["culling"]?.index;
    if (!index) throw new Error("Missing root scope");
    const updates = jest.spyOn(index, "set");
    root.data.prepareUpdate = () => {
      root.setChildren([container]);
      return true;
    };
    expect(walk()).toMatchObject({ prepared: ["container"], visited: ["root", "container"] });
    expect(updates).not.toHaveBeenCalled();
    expect(index.size).toBe(2);
  });

  it("unregisters descendants even when nested children were temporarily cleared", () => {
    const { root, add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    add("leaf", 30, child);
    walk();
    child.clearChildren();
    parent.clearChildren();
    root.remove(parent);
    expect(root["culling"]?.index.size).toBe(0);
    expect(walk().visited).toEqual(["root"]);
  });

  it("releases removed subtrees from the index and every retained work set", () => {
    const { root, add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 1000, parent);
    walk();
    add("fresh", 2000, child);
    child.requestWalk();
    root.clearChildren();
    root.remove(parent);
    const scope = root["culling"];
    if (!scope) throw new Error("Missing root scope");
    expect(scope.index.size).toBe(0);
    expect(scope["pending"].size).toBe(0);
    expect(scope["fresh"].size).toBe(0);
    expect(scope["active"].size).toBe(0);
    expect(walk().visited).toEqual(["root"]);
    root.append(parent);
    expect(walk().visited).toEqual(["root", "parent", "child", "fresh"]);
    expect(scope.index.size).toBe(3);
  });

  it("detaches the old scope when culling is removed", () => {
    const { root, add, walk, configure } = setup();
    const node = add("out", 1000);
    walk();
    const scope = root["culling"];
    if (!scope) throw new Error("Missing root scope");
    root.setCulling(undefined);
    expect(scope.index.size).toBe(0);
    expect(node.isVisible()).toBe(true);
    configure();
    expect(walk().drawn).toEqual(["root"]);
  });
});
