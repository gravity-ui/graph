import type { TTileRect } from "./TileIndex";
import { Tree } from "./Tree";
import type { ITree } from "./Tree";

interface IProbe extends ITree {
  name: string;
  prepare?: () => boolean;
}

interface IWork {
  order: number;
  parent: number;
}

class CountingTree extends Tree<IProbe> {
  constructor(data: IProbe, work: IWork) {
    super(data);
    const getOrderedChildren = this.zIndexChildrenCache.get;
    this.zIndexChildrenCache.get = (): Tree[] => {
      work.order++;
      return getOrderedChildren();
    };
    let parent: Tree | undefined;
    Object.defineProperty(this, "parent", {
      configurable: true,
      get: (): Tree | undefined => {
        work.parent++;
        return parent;
      },
      set: (value: Tree | undefined): void => {
        parent = value;
      },
    });
  }
}

const viewport = (maxX: number): TTileRect => ({ minX: 0, minY: 0, maxX, maxY: maxX });

function setup() {
  const state = { viewport: viewport(1000) };
  const events: string[] = [];
  const work: IWork = { order: 0, parent: 0 };
  const nodes: CountingTree[] = [];
  const published = new Map<CountingTree, boolean>();
  // The root paints first: it records visibility transitions published for this frame.
  const recordPublished = (): void => {
    for (const node of nodes) {
      const visible = node.isVisible();
      const previous = published.get(node);
      if (previous !== undefined && previous !== visible) events.push(`visible:${node.data.name}:${visible}`);
      published.set(node, visible);
    }
  };
  const make = (name: string, x?: number): CountingTree => {
    const node = new CountingTree(
      {
        name,
        prepareUpdate: (): boolean => {
          events.push(`prepare:${name}`);
          return node.data.prepare?.() ?? true;
        },
        iterate: (prepared): boolean => {
          // A node the tree did not prepare applies its own pending work first.
          const allowed = prepared ? true : node.data.prepareUpdate?.() ?? true;
          events.push(`iterate:${name}`);
          if (name === "root") recordPublished();
          if (node.isVisible()) events.push(`draw:${name}`);
          return allowed;
        },
      },
      work
    );
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    if (name !== "root") nodes.push(node);
    return node;
  };
  const root = make("root");
  root.setCulling({
    tileSize: 64,
    getViewport: () => state.viewport,
  });
  const add = (name: string, x: number, parent = root): CountingTree => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const walk = () => {
    events.length = 0;
    work.order = work.parent = 0;
    root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
    const names = (prefix: string): string[] =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return {
      prepared: names("prepare:"),
      visited: names("iterate:"),
      drawn: names("draw:"),
      events: events.slice(),
      work: { ...work },
    };
  };
  return { root, state, add, walk };
}

describe("Tree geometry and structure invalidation", () => {
  it("reuses unchanged ancestry for a dense partial viewport without preparing clean offscreen nodes", () => {
    const { state, add, walk } = setup();
    const names = Array.from({ length: 25 }, (_, i) => `node${i}`);
    names.forEach((name, i) => add(name, 10 + i * 20));
    walk();
    state.viewport = viewport(465);
    walk();
    walk();

    state.viewport = viewport(466);
    const result = walk();
    expect(result.prepared).toEqual(["root", ...names.slice(0, 23)]);
    expect(result.drawn).toEqual(result.prepared);
    expect(result.work.order).toBe(0);
    expect(result.work.parent).toBeLessThanOrEqual(4);
  });

  it("checks each unchanged dense node's bounds only once before publishing visibility", () => {
    const { state, add, walk } = setup();
    const nodes = Array.from({ length: 25 }, (_, i) => add(`node${i}`, 10 + i * 20));
    walk();
    state.viewport = viewport(465);
    walk();
    walk();
    const reads = { minX: 0 };
    for (const node of nodes) {
      const minX = node.boundsMinX;
      Object.defineProperty(node, "boundsMinX", {
        configurable: true,
        get: () => {
          reads.minX++;
          return minX;
        },
      });
    }

    state.viewport = viewport(466);
    const result = walk();
    expect(result.drawn).toHaveLength(24);
    // One exact bounds check reads minX for the unknown-bounds gate and the left edge.
    expect(reads.minX).toBeLessThanOrEqual(nodes.length * 2);
  });

  it("does not rewrite unchanged visible membership or recheck published eligibility during paint", () => {
    const { state, add, walk } = setup();
    const nodes = Array.from({ length: 25 }, (_, i) => add(`node${i}`, 10 + i * 20));
    walk();
    state.viewport = viewport(465);
    walk();
    walk();
    const work = { writes: 0, paintChecks: 0 };
    for (const node of nodes) {
      let published = node.published;
      Object.defineProperty(node, "published", {
        configurable: true,
        get: (): boolean => published,
        set: (value: boolean): void => {
          work.writes++;
          published = value;
        },
      });
      const isEligible = node.isEligible.bind(node);
      node.isEligible = (currentScope) => {
        if (currentScope.painting) work.paintChecks++;
        return isEligible(currentScope);
      };
    }

    const result = walk();
    expect(result.drawn).toHaveLength(24);
    expect(work).toEqual({ writes: 0, paintChecks: 0 });
  });

  it("does not republish unchanged visibility when a dense viewport moves within the same selection", () => {
    const { state, add, walk } = setup();
    const nodes = Array.from({ length: 25 }, (_, i) => add(`node${i}`, 10 + i * 20));
    walk();
    state.viewport = viewport(465);
    walk();
    const work = { eligibility: 0, publication: 0 };
    for (const node of nodes) {
      const isEligible = node.isEligible.bind(node);
      node.isEligible = (scope) => {
        work.eligibility++;
        return isEligible(scope);
      };
      let visible = node.published;
      Object.defineProperty(node, "published", {
        configurable: true,
        get: (): boolean => visible,
        set: (value: boolean): void => {
          work.publication++;
          visible = value;
        },
      });
    }

    state.viewport = viewport(466);
    const result = walk();
    expect(result.prepared).toEqual(["root", ...nodes.slice(0, 23).map((node) => node.data.name)]);
    expect(result.drawn).toEqual(result.prepared);
    expect(result.events.filter((event) => event.startsWith("visible:"))).toEqual([]);
    expect(work).toEqual({ eligibility: 0, publication: 0 });
  });

  it.each(["before", "during"])(
    "does not enumerate unchanged hierarchy or ancestry when bounds move %s preparation",
    (timing) => {
      const { add, walk } = setup();
      const parent = add("parent", 10);
      const child = add("child", 20, parent);
      const leaf = add("leaf", 30, child);
      const sibling = add("sibling", 40);
      const nodes = [parent, child, leaf, sibling];
      const initial = walk();
      // The first traversal enumerates the hierarchy once to build the paint order.
      expect(initial.work.order).toBeGreaterThan(0);
      walk();
      const stable = walk();
      expect(stable.work.order).toBe(0);

      for (const [index, node] of nodes.entries()) {
        const move = (): boolean => {
          const x = 100 + index * 20;
          node.setBounds(x, x, x + 10, x + 10);
          return true;
        };
        if (timing === "before") move();
        else node.data.prepare = move;
      }

      const moved = walk();
      expect(moved.prepared).toEqual(["root", "parent", "child", "leaf", "sibling"]);
      expect(moved.drawn).toEqual(["root", "parent", "child", "leaf", "sibling"]);
      expect(moved.work).toEqual(stable.work);
    }
  );

  it("publishes geometry exits and entrants before painting across full and sparse viewports", () => {
    const { root, state, add, walk } = setup();
    add("resident", 10);
    const moved = add("moved", 30);
    add("distant", 500);
    walk();
    walk();

    state.viewport = viewport(100);
    moved.setBounds(300, 300, 310, 310);
    let result = walk();
    expect(result.drawn).toEqual(["root", "resident"]);
    expect(result.events.indexOf("visible:moved:false")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:moved:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.visited).not.toContain("moved");

    root.data.prepare = (): boolean => {
      moved.setBounds(40, 40, 50, 50);
      return true;
    };
    result = walk();
    expect(result.prepared).toEqual(["root", "resident", "moved"]);
    expect(result.drawn).toEqual(["root", "resident", "moved"]);
    expect(result.events.indexOf("visible:moved:true")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:moved:true")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.visited).toContain("moved");

    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "resident", "moved", "distant"]);
    state.viewport = viewport(100);
    expect(walk().drawn).toEqual(["root", "resident", "moved"]);
  });

  it("uses new ancestry after a requested preparation moves a child between warmed branches", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    add("leaf", 30, child);
    const destination = add("destination", 40);
    walk();
    walk();
    destination.data.prepare = (): boolean => {
      destination.append(child);
      child.setBounds(60, 60, 70, 70);
      destination.data.prepare = undefined;
      return true;
    };
    destination.requestWalk();

    // Reparenting registers the moved subtree again, so it prepares before painting.
    expect(walk()).toMatchObject({
      prepared: ["root", "destination", "child", "leaf", "original"],
      drawn: ["root", "original", "destination", "child", "leaf"],
      visited: ["root", "original", "destination", "child", "leaf"],
    });
    expect(walk().prepared).toEqual(["root", "original", "destination", "child", "leaf"]);
  });

  it("uses new ancestry after a prepared child moves between warmed branches", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const leaf = add("leaf", 30, child);
    const destination = add("destination", 40);
    walk();
    walk();
    destination.data.prepare = (): boolean => {
      destination.append(child);
      child.setBounds(60, 60, 70, 70);
      destination.data.prepare = undefined;
      return true;
    };
    leaf.requestWalk();
    destination.requestWalk();

    // The moved subtree already prepared in this frame: it paints under its new parent without preparing again.
    expect(walk()).toMatchObject({
      prepared: ["root", "original", "child", "leaf", "destination"],
      drawn: ["root", "original", "destination", "child", "leaf"],
      visited: ["root", "original", "destination", "child", "leaf"],
    });
    expect(walk().prepared).toEqual(["root", "original", "destination", "child", "leaf"]);
  });

  it("updates z-order alongside bounds from a requested preparation", () => {
    const { state, add, walk } = setup();
    const first = add("first", 10);
    add("child", 20, first);
    const second = add("second", 30);
    walk();
    walk();
    second.data.prepare = (): boolean => {
      first.updateZIndex(5);
      first.setBounds(60, 60, 70, 70);
      return true;
    };
    second.requestWalk();

    expect(walk()).toMatchObject({
      prepared: ["root", "second", "first", "child"],
      drawn: ["root", "second", "first", "child"],
    });
    state.viewport = viewport(50);
    expect(walk().drawn).toEqual(["root", "second", "child"]);
    second.updateZIndex(10);
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "first", "child", "second"]);
  });

  it("updates z-order alongside bounds without changing preparation order", () => {
    const { state, add, walk } = setup();
    const first = add("first", 10);
    const child = add("child", 20, first);
    const second = add("second", 30);
    walk();
    walk();
    second.data.prepare = (): boolean => {
      first.updateZIndex(5);
      first.setBounds(60, 60, 70, 70);
      return true;
    };
    child.requestWalk();
    second.requestWalk();

    // Nodes prepared before the z-index change keep their order; painting uses the new z-order.
    expect(walk()).toMatchObject({
      prepared: ["root", "first", "child", "second"],
      drawn: ["root", "second", "first", "child"],
    });
    state.viewport = viewport(50);
    expect(walk().drawn).toEqual(["root", "second", "child"]);
    second.updateZIndex(10);
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "first", "child", "second"]);
  });

  it("invalidates descendant eligibility when suppression changes alongside bounds", () => {
    const { state, add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    add("sibling", 40);
    walk();
    walk();
    parent.data.prepare = (): boolean => {
      child.setBounds(50, 50, 60, 60);
      return false;
    };
    parent.requestWalk();

    let result = walk();
    expect(result.prepared).toEqual(["root", "parent", "sibling"]);
    expect(result.drawn).toEqual(["root", "parent", "sibling"]);
    expect([child.isVisible(), leaf.isVisible()]).toEqual([false, false]);
    expect(result.events.indexOf("visible:child:false")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:child:false")).toBeLessThan(result.events.indexOf("draw:root"));

    state.viewport = viewport(100);
    parent.data.prepare = (): boolean => {
      child.setBounds(300, 300, 310, 310);
      return true;
    };
    parent.requestWalk();
    result = walk();
    // The clean offscreen child passes its visible leaf through without preparing.
    expect(result.prepared).toEqual(["root", "parent", "leaf", "sibling"]);
    expect(result.drawn).toEqual(["root", "parent", "leaf", "sibling"]);
    expect(leaf.isTraversalAllowed()).toBe(true);
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "parent", "child", "leaf", "sibling"]);
  });
});
