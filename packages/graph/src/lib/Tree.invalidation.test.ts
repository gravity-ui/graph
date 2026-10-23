import type { TTileRect } from "./TileIndex";
import { Tree } from "./Tree";
import type { ITree } from "./Tree";

interface IProbe extends ITree {
  name: string;
  prepare?: () => boolean;
}

interface IWork {
  children: number;
  order: number;
  parent: number;
}

class CountingTree extends Tree<IProbe> {
  constructor(
    data: IProbe,
    private readonly work: IWork
  ) {
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

  public override getChildrenArray(): Tree[] {
    this.work.children++;
    return super.getChildrenArray();
  }
}

const viewport = (maxX: number): TTileRect => ({ minX: 0, minY: 0, maxX, maxY: maxX });

function setup() {
  const state = { viewport: viewport(1000), token: 0 };
  const events: string[] = [];
  const work: IWork = { children: 0, order: 0, parent: 0 };
  const make = (name: string, x?: number): CountingTree => {
    const node = new CountingTree(
      {
        name,
        prepareUpdate: (): boolean => {
          events.push(`prepare:${name}`);
          return node.data.prepare?.() ?? true;
        },
        onViewportChange: (visible): void => {
          events.push(`visible:${name}:${visible}`);
        },
        iterate: (): boolean => {
          events.push(`iterate:${name}`);
          if (node.isVisible()) events.push(`draw:${name}`);
          return true;
        },
      },
      work
    );
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    return node;
  };
  const root = make("root");
  root.setCulling({
    tileSize: 64,
    getViewport: () => state.viewport,
    getWalkToken: () => state.token,
  });
  const add = (name: string, x: number, parent = root): CountingTree => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const walk = () => {
    events.length = 0;
    work.children = work.order = work.parent = 0;
    state.token++;
    root.traverseDown((node) => node.data.iterate());
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
      expect(initial.work.children).toBeGreaterThan(0);
      expect(initial.work.order).toBeGreaterThan(0);
      walk();
      const stable = walk();
      expect(stable.work.children).toBe(0);
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
    expect(moved.isSkippedByCulling(state.token)).toBe(true);

    root.data.prepare = (): boolean => {
      moved.setBounds(40, 40, 50, 50);
      return true;
    };
    result = walk();
    expect(result.prepared).toEqual(["root", "resident", "moved"]);
    expect(result.drawn).toEqual(["root", "resident", "moved"]);
    expect(result.events.indexOf("visible:moved:true")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:moved:true")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(moved.isSkippedByCulling(state.token)).toBe(false);

    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "resident", "moved", "distant"]);
    state.viewport = viewport(100);
    expect(walk().drawn).toEqual(["root", "resident", "moved"]);
  });

  it("uses new ancestry after a prepared child moves between warmed branches", () => {
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

    expect(walk()).toMatchObject({
      prepared: ["root", "original", "child", "leaf", "destination"],
      drawn: ["root", "original", "destination", "child", "leaf"],
      visited: ["root", "original", "destination", "child", "leaf"],
    });
    expect(walk().prepared).toEqual(["root", "original", "destination", "child", "leaf"]);
  });

  it("updates z-order alongside bounds without changing preparation order", () => {
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
    result = walk();
    expect(result.prepared).toEqual(["root", "parent", "child", "leaf", "sibling"]);
    expect(result.drawn).toEqual(["root", "parent", "leaf", "sibling"]);
    expect(leaf.isTraversalAllowed()).toBe(true);
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "parent", "child", "leaf", "sibling"]);
  });
});
