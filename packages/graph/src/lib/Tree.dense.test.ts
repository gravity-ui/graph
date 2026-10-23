import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & { name: string; prepare?: () => boolean; paint?: () => boolean };
const viewport = (maxX: number): TTileRect => ({ minX: 0, minY: 0, maxX, maxY: maxX });

function setup() {
  const state = { viewport: viewport(1000), enabled: true, token: 0 };
  const events: string[] = [];
  const batch = new Set<string>();
  const make = (name: string, x?: number) => {
    const node: Tree<Probe> = new Tree<Probe>({
      name,
      prepareUpdate: () => {
        events.push(`prepare:${name}`);
        return node.data.prepare?.() ?? true;
      },
      onViewportChange: (visible) => {
        events.push(`visible:${name}:${visible}`);
        if (visible) batch.add(name);
        else batch.delete(name);
      },
      iterate: (): boolean => {
        events.push(`iterate:${name}`);
        if (name === "root") events.push(`batch:${Array.from(batch).sort().join(",")}`);
        if (node.isVisible()) events.push(`draw:${name}`);
        return node.data.paint?.() ?? true;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    if (name !== "root") batch.add(name);
    return node;
  };
  const root = make("root");
  root.setCulling({
    tileSize: 64,
    getViewport: () => state.viewport,
    isEnabled: () => state.enabled,
    getWalkToken: () => state.token,
  });
  const add = (name: string, x?: number, parent = root) => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const walk = () => {
    events.length = 0;
    state.token++;
    root.traverseDown((node) => node.data.iterate());
    const names = (prefix: string) =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), visited: names("iterate:"), events: events.slice() };
  };
  return { root, state, add, make, walk };
}

describe("Tree full-viewport traversal", () => {
  it.each(["deep", "wide"])("keeps ancestor checks linear when every node in a %s tree is visible", (shape) => {
    const { root, add, walk } = setup();
    const nodes = [root];
    for (let i = 0; i < 64; i++) nodes.push(add(`node${i}`, 10, shape === "deep" ? nodes[nodes.length - 1] : root));
    walk();
    const reads = { parent: 0 };
    for (const node of nodes) {
      let parent = node.parent;
      Object.defineProperty(node, "parent", {
        configurable: true,
        get: () => {
          reads.parent++;
          return parent;
        },
        set: (value: Tree | undefined) => {
          parent = value;
        },
      });
    }

    const result = walk();
    expect(result.drawn).toHaveLength(nodes.length);
    expect(reads.parent).toBeLessThanOrEqual(nodes.length * 12);
  });

  it("updates the shared batch visibility before painting across full, sparse and disabled culling", () => {
    const { root, state, add, walk } = setup();
    add("left", 10);
    const right = add("right", 300);
    const leaf = add("leaf", 600, right);
    const scope = root["culling"];
    expect(walk().drawn).toEqual(["root", "left", "right", "leaf"]);

    state.viewport = viewport(100);
    let result = walk();
    expect(result.prepared).toEqual(["root", "left"]);
    expect(result.drawn).toEqual(["root", "left"]);
    expect(result.events).toContain("batch:left");
    expect(result.events.indexOf("visible:right:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:leaf:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(leaf.isSkippedByCulling(state.token)).toBe(true);

    state.viewport = viewport(1000);
    result = walk();
    expect(result.drawn).toEqual(["root", "left", "right", "leaf"]);
    expect(result.events).toContain("batch:leaf,left,right");
    expect(result.events.indexOf("visible:leaf:true")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(leaf.isSkippedByCulling(state.token)).toBe(false);

    state.viewport = viewport(100);
    state.enabled = false;
    result = walk();
    expect(result.prepared).toEqual(["root", "left", "right", "leaf"]);
    expect(result.drawn).toEqual(["root", "left"]);
    expect(result.events).toContain("batch:left");
    expect(leaf.isSkippedByCulling(state.token)).toBe(false);

    state.enabled = true;
    expect(walk().visited).toEqual(["root", "left"]);
    expect(root["culling"]).toBe(scope);
    expect(scope?.index.size).toBe(3);
  });

  it("uses final geometry and child order when preparation changes a fully visible tree", () => {
    const { root, add, make, walk } = setup();
    const early = add("early", 10);
    add("visibleChild", 20, early);
    const parent = add("parent", 30);
    const removed = add("removed", 50, parent);
    const tail = add("tail", 70);
    walk();
    const replacement = make("replacement", 90);
    parent.data.prepare = () => {
      parent.setChildren([replacement]);
      early.setBounds(2000, 2000, 2010, 2010);
      tail.updateZIndex(0);
      return true;
    };

    const result = walk();
    expect(result.drawn).toEqual(["root", "tail", "visibleChild", "parent", "replacement"]);
    expect(result.prepared.filter((name) => name === "early")).toHaveLength(1);
    expect(result.visited).not.toContain("removed");
    expect(result.events.indexOf("prepare:replacement")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:early:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(removed.parent).toBeUndefined();
    expect(root["culling"]?.index.size).toBe(5);
  });

  it("prepares and completes a node once when a later preparation reparents it in the same scope", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const destination = add("destination", 30);
    walk();
    destination.data.prepare = () => {
      destination.append(child);
      return true;
    };

    const result = walk();
    expect(result.prepared).toEqual(["root", "original", "child", "destination"]);
    expect(result.visited).toEqual(["root", "original", "destination", "child"]);
    expect(result.drawn).toEqual(["root", "original", "destination", "child"]);
    expect(child.parent).toBe(destination);
  });

  it("does not prepare a child moved under a suppressed parent from a captured sibling list", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const mover = add("mover", 20, original);
    const moved = add("moved", 30, original);
    const destination = add("destination", 40);
    walk();
    mover.data.prepare = () => {
      destination.append(moved);
      return true;
    };
    destination.data.prepare = () => false;

    const result = walk();
    expect(result.prepared).toEqual(["root", "original", "mover", "destination"]);
    expect(result.visited).toEqual(["root", "original", "mover", "destination"]);
    expect(moved.isTraversalAllowed()).toBe(false);
  });

  it("does not reuse a detached node after a later preparation removes it from a warmed tree", () => {
    const { root, add, walk } = setup();
    const removed = add("removed", 10);
    const later = add("later", 20);
    walk();
    walk();
    later.data.prepare = () => {
      root.remove(removed);
      later.data.prepare = undefined;
      return true;
    };

    expect(walk()).toMatchObject({ prepared: ["root", "removed", "later"], visited: ["root", "later"] });
    expect(walk()).toMatchObject({ prepared: ["root", "later"], visited: ["root", "later"] });
    expect(walk().prepared).toEqual(["root", "later"]);
    expect(removed.parent).toBeUndefined();
  });

  it("discovers a new child in an earlier branch and honors suppression during cached preparation", () => {
    const { add, make, walk } = setup();
    const earlier = add("earlier", 10);
    add("retained", 20, earlier);
    const later = add("later", 30);
    add("suppressed", 40, later);
    walk();
    walk();
    const created = make("created", 50);
    later.data.prepare = () => {
      earlier.append(created);
      later.data.prepare = () => false;
      return false;
    };

    const result = walk();
    expect(result.prepared).toEqual(["root", "earlier", "retained", "later", "created"]);
    expect(result.drawn).toEqual(["root", "earlier", "retained", "created", "later"]);
    expect(result.events.indexOf("prepare:created")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:suppressed:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(walk().prepared.sort()).toEqual(["created", "earlier", "later", "retained", "root"]);
    later.data.prepare = () => true;
    expect(walk().drawn).toEqual(["root", "earlier", "retained", "created", "later", "suppressed"]);
  });

  it("updates the paint order after a z-index change in a warmed fully visible tree", () => {
    const { add, walk } = setup();
    const first = add("first", 10);
    add("child", 20, first);
    const second = add("second", 30);
    walk();
    walk();
    first.updateZIndex(5);
    expect(walk().drawn).toEqual(["root", "second", "first", "child"]);
    second.updateZIndex(10);
    expect(walk().drawn).toEqual(["root", "first", "child", "second"]);
  });

  it("completes a child once when painting reparents it into a branch visited later", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const mover = add("mover", 30);
    const destination = add("destination", 40);
    walk();
    walk();
    mover.data.paint = () => {
      destination.append(child);
      return true;
    };

    expect(walk()).toMatchObject({
      visited: ["root", "original", "child", "mover", "destination"],
      drawn: ["root", "original", "child", "mover", "destination"],
    });
    expect(walk().drawn).toEqual(["root", "original", "mover", "destination", "child"]);
  });

  it("releases cached preparation references when a subtree is removed without another traversal", () => {
    const { root, add, walk } = setup();
    const parent = add("parent", 10);
    add("child", 20, parent);
    walk();
    walk();
    root.remove(parent);

    const scope = root["culling"];
    if (!scope) throw new Error("Missing scope");
    expect(scope.nodes.size).toBe(0);
    expect(scope.fullPreparation?.nodes.some((node) => node !== root) ?? false).toBe(false);
    expect(scope.fullPaint?.nodes.some((node) => node !== root) ?? false).toBe(false);
  });

  it("prepares and completes transferred descendants once in every destination scope", () => {
    const source = setup();
    const destination = setup();
    const parent = source.add("parent", 10);
    const child = source.add("child", 20, parent);
    const completed: string[] = [];
    const prepared: string[] = [];
    for (const node of [parent, child]) {
      node.data.prepare = () => {
        prepared.push(node.data.name);
        return true;
      };
      node.data.paint = () => {
        completed.push(node.data.name);
        return true;
      };
    }
    source.walk();
    destination.root.append(parent);
    destination.walk();
    source.walk();
    source.root.append(parent);
    source.walk();

    expect(prepared).toEqual(["parent", "child", "parent", "child", "parent", "child"]);
    expect(completed).toEqual(prepared);
    expect(source.root["culling"]?.index.size).toBe(2);
    expect(destination.root["culling"]?.index.size).toBe(0);
  });

  it("invalidates cached full visibility when an attached node was hidden in its previous scope", () => {
    const source = setup();
    source.state.viewport = viewport(100);
    const child = source.add("child", 300);
    source.walk();
    expect(child.isVisible()).toBe(false);
    const destination = setup();
    destination.add("resident", 10);
    destination.walk();

    destination.root.append(child);
    destination.walk();
    expect(child.isVisible()).toBe(true);
    destination.state.viewport = viewport(100);
    destination.walk();
    expect(child.isVisible()).toBe(false);
  });

  it("updates the root's own visibility when its bounds change while all descendants remain visible", () => {
    const { root, add, walk } = setup();
    add("child", 10);
    walk();
    root.setBounds(2000, 2000, 2010, 2010);
    expect(walk().drawn).toEqual(["child"]);
    root.setBounds(20, 20, 30, 30);
    expect(walk().drawn).toEqual(["root", "child"]);
  });

  it("checks finite root bounds against viewport changes even when every descendant stays visible", () => {
    const { root, state, add, walk } = setup();
    root.setBounds(500, 500, 510, 510);
    add("child", 10);
    state.viewport = viewport(100);
    expect(walk().drawn).toEqual(["child"]);
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "child"]);
    state.viewport = viewport(100);
    expect(walk().drawn).toEqual(["child"]);
  });

  it("consumes dirty offscreen geometry before switching back to a full viewport", () => {
    const { state, add, walk } = setup();
    add("left", 10);
    const moved = add("moved", 300);
    walk();
    state.viewport = viewport(100);
    walk();
    moved.data.prepare = () => {
      moved.setBounds(40, 40, 50, 50);
      return true;
    };
    moved.requestWalk();
    const result = walk();
    expect(result.drawn).toEqual(["root", "left", "moved"]);
    expect(result.events).toContain("batch:left,moved");
    expect(result.events.indexOf("prepare:moved")).toBeLessThan(result.events.indexOf("draw:root"));
    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", "left", "moved"]);
  });

  it("finishes prepared descendants without paint when an ancestor suppresses them during paint", () => {
    const { add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    walk();
    parent.data.paint = () => false;
    let result = walk();
    expect(result.prepared).toEqual(["root", "parent", "child", "leaf"]);
    expect(result.visited).toEqual(["root", "parent", "child", "leaf"]);
    expect(result.drawn).toEqual(["root", "parent"]);
    expect([child.isVisible(), leaf.isVisible()]).toEqual([false, false]);

    parent.data.prepare = () => false;
    result = walk();
    expect(result.prepared).toEqual(["root", "parent"]);
    expect(result.visited).toEqual(["root", "parent"]);
    parent.data.prepare = parent.data.paint = () => true;
    expect(walk().drawn).toEqual(["root", "parent", "child", "leaf"]);
  });

  it("invalidates an ancestry check when painting suppresses a previously allowed branch", () => {
    const { root, add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    walk();
    const allowed: boolean[] = [];
    parent.data.paint = () => {
      allowed.push(leaf.isTraversalAllowed());
      return false;
    };
    child.data.paint = () => {
      allowed.push(leaf.isTraversalAllowed());
      return true;
    };

    expect(walk().drawn).toEqual(["root", "parent"]);
    expect(allowed).toEqual([true, false]);
    expect(leaf.isTraversalAllowed()).toBe(false);
    root.append(child);
    expect(leaf.isTraversalAllowed()).toBe(true);
    parent.append(child);
    expect(leaf.isTraversalAllowed()).toBe(false);
  });

  it("uses live ancestry when a later iterator reparents an already queried branch", () => {
    const { add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    const suppressed = add("suppressed", 40);
    suppressed.data.prepare = () => false;
    walk();
    const allowed: boolean[] = [];
    suppressed.data.paint = () => {
      allowed.push(leaf.isTraversalAllowed());
      suppressed.append(child);
      allowed.push(leaf.isTraversalAllowed());
      return true;
    };

    walk();
    expect(allowed).toEqual([true, false]);
    expect(leaf.isVisible()).toBe(false);
    expect(leaf.isTraversalAllowed()).toBe(false);
  });

  it("does not lose a preparation request when a full-viewport node requests the next frame", () => {
    const { state, add, walk } = setup();
    const node = add("node", 500);
    walk();
    node.data.prepare = () => {
      node.requestWalk();
      node.data.prepare = undefined;
      return true;
    };
    walk();
    state.viewport = viewport(100);
    expect(walk().prepared).toEqual(["root", "node"]);
    expect(walk().prepared).toEqual(["root"]);
  });
});
