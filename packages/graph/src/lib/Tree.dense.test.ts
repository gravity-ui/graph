import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & { name: string; prepare?: () => boolean; paint?: () => boolean };
const viewport = (maxX: number): TTileRect => ({ minX: 0, minY: 0, maxX, maxY: maxX });

function setup() {
  const state = { viewport: viewport(1000), enabled: true };
  const events: string[] = [];
  const nodes: Array<Tree<Probe>> = [];
  const published = new Map<Tree<Probe>, boolean>();
  // The root paints first: it records the visibility published for this frame, as a batch would see it.
  const recordPublished = () => {
    const batch: string[] = [];
    for (const node of nodes) {
      const visible = node.isVisible();
      const previous = published.get(node);
      if (previous !== undefined && previous !== visible) events.push(`visible:${node.data.name}:${visible}`);
      published.set(node, visible);
      if (visible) batch.push(node.data.name);
    }
    events.push(`batch:${batch.sort().join(",")}`);
  };
  const make = (name: string, x?: number) => {
    const node: Tree<Probe> = new Tree<Probe>({
      name,
      prepareUpdate: () => {
        events.push(`prepare:${name}`);
        return node.data.prepare?.() ?? true;
      },
      iterate: (prepared): boolean => {
        // A node the tree did not prepare applies its own pending work first.
        const allowed = prepared ? true : node.data.prepareUpdate?.() ?? true;
        events.push(`iterate:${name}`);
        if (name === "root") recordPublished();
        if (node.isVisible()) events.push(`draw:${name}`);
        const painted = node.data.paint?.() ?? true;
        return allowed && painted;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    if (name !== "root") nodes.push(node);
    return node;
  };
  const root = make("root");
  root.setCulling({
    tileSize: 64,
    getViewport: () => state.viewport,
    isEnabled: () => state.enabled,
  });
  const add = (name: string, x?: number, parent = root) => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const walk = () => {
    events.length = 0;
    root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
    const names = (prefix: string) =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), visited: names("iterate:"), events: events.slice() };
  };
  return { root, state, add, make, walk };
}

/** Every visited node prepares in this frame, and never after its own paint. */
function expectPreparedBeforeOwnPaint(result: { events: string[]; visited: string[] }): void {
  for (const name of result.visited) {
    const prepared = result.events.indexOf(`prepare:${name}`);
    expect(prepared).toBeGreaterThanOrEqual(0);
    expect(prepared).toBeLessThan(result.events.indexOf(`iterate:${name}`));
  }
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
    // The skipped leaf stays attached and eligible for point queries.
    expect(result.visited).not.toContain("leaf");
    expect(leaf.isTraversalAllowed()).toBe(true);

    state.viewport = viewport(1000);
    result = walk();
    expect(result.drawn).toEqual(["root", "left", "right", "leaf"]);
    expect(result.events).toContain("batch:leaf,left,right");
    expect(result.events.indexOf("visible:leaf:true")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.visited).toContain("leaf");

    state.viewport = viewport(100);
    state.enabled = false;
    result = walk();
    expect(result.prepared).toEqual(["root", "left", "right", "leaf"]);
    expect(result.drawn).toEqual(["root", "left"]);
    expect(result.events).toContain("batch:left");
    expect(result.visited).toEqual(["root", "left", "right", "leaf"]);

    state.enabled = true;
    expect(walk().visited).toEqual(["root", "left"]);
    expect(root["culling"]).toBe(scope);
    expect(scope?.index.size).toBe(3);
  });

  it("updates a dense partial selection without preparing clean exits or losing new entrants", () => {
    const { state, add, walk } = setup();
    const names = Array.from({ length: 20 }, (_, i) => `node${i}`);
    const nodes = names.map((name, i) => add(name, 10 + i * 20));
    walk();
    walk();
    nodes[0].updateZIndex(5);
    state.viewport = viewport(365);
    let result = walk();
    expect(result.prepared).toEqual(result.visited);
    expect(result.visited).toEqual(["root", ...names.slice(1, 18), "node0"]);
    expect(result.drawn).toEqual(result.visited);
    expect(result.events).toContain(`batch:${names.slice(0, 18).sort().join(",")}`);

    state.viewport = { minX: 41, minY: 41, maxX: 410, maxY: 410 };
    result = walk();
    expect(result.prepared).toEqual(["root", ...names.slice(2)]);
    expect(result.visited).toEqual(["root", ...names.slice(2)]);
    expect(result.drawn).toEqual(result.visited);
    expect(result.events).toContain(`batch:${names.slice(2).sort().join(",")}`);
    for (const event of ["visible:node0:false", "visible:node1:false", "visible:node18:true", "visible:node19:true"]) {
      expect(result.events.indexOf(event)).toBeGreaterThanOrEqual(0);
      expect(result.events.indexOf(event)).toBeLessThan(result.events.indexOf("draw:root"));
    }

    state.viewport = viewport(1000);
    expect(walk().drawn).toEqual(["root", ...names.slice(1), "node0"]);
  });

  it("paints a visible subtree that a requested preparation moves under an offscreen ancestor", () => {
    const { state, add, walk } = setup();
    state.viewport = viewport(100);
    const original = add("original", 10);
    const child = add("child", 20, original);
    add("grandchild", 30, child);
    const trigger = add("trigger", 40);
    const fillers = Array.from({ length: 8 }, (_, i) => `filler${i}`);
    for (const name of fillers) add(name, 50);
    const far = add("far", 5000);
    walk();
    walk();
    trigger.data.prepare = () => {
      far.append(child);
      return true;
    };
    trigger.requestWalk();

    // Reparenting registers the subtree again: it prepares before painting with its offscreen ancestor,
    // and each node's own bounds keep the moved nodes visible below that ancestor.
    const result = walk();
    expect(result.prepared.slice(0, 5)).toEqual(["root", "trigger", "far", "child", "grandchild"]);
    expect(result.drawn).toEqual(["root", "original", "trigger", ...fillers, "child", "grandchild"]);
    expect(result.visited).toEqual(["root", "original", "trigger", ...fillers, "far", "child", "grandchild"]);
    expectPreparedBeforeOwnPaint(result);
  });

  it("finishes a prepared subtree once after a later preparation moves it under an unprepared ancestor", () => {
    const { state, add, walk } = setup();
    state.viewport = viewport(100);
    const original = add("original", 10);
    const child = add("child", 20, original);
    const grandchild = add("grandchild", 30, child);
    const trigger = add("trigger", 40);
    const fillers = Array.from({ length: 8 }, (_, i) => `filler${i}`);
    for (const name of fillers) add(name, 50);
    const far = add("far", 5000);
    walk();
    walk();
    trigger.data.prepare = () => {
      far.append(child);
      trigger.data.prepare = undefined;
      return true;
    };
    grandchild.requestWalk();
    trigger.requestWalk();

    // The subtree prepares before the move; it counts as prepared and paints by its own bounds once,
    // below an offscreen ancestor that is neither prepared nor painted.
    const result = walk();
    expect(result.prepared).toEqual(["root", "original", "child", "grandchild", "trigger", ...fillers]);
    expect(result.drawn).toEqual(["root", "original", "trigger", ...fillers, "child", "grandchild"]);
    expect(result.visited).toEqual(["root", "original", "trigger", ...fillers, "child", "grandchild"]);
    expect(walk().visited).toEqual(["root", "original", "trigger", ...fillers, "child", "grandchild"]);
  });

  it("uses final geometry and child order when a requested preparation changes a fully visible tree", () => {
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
    parent.requestWalk();

    const result = walk();
    expect(result.drawn).toEqual(["root", "tail", "visibleChild", "parent", "replacement"]);
    expect(result.prepared).not.toContain("early");
    expect(result.visited).not.toContain("removed");
    expect(result.events.indexOf("prepare:replacement")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:early:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(removed.parent).toBeUndefined();
    expect(root["culling"]?.index.size).toBe(5);
  });

  it("prepares and completes a node once when a requested preparation reparents it in the same scope", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const destination = add("destination", 30);
    walk();
    destination.data.prepare = () => {
      destination.append(child);
      return true;
    };
    destination.requestWalk();

    const result = walk();
    // Reparenting registers the child again, so it prepares before painting.
    expect(result.prepared).toEqual(["root", "destination", "child", "original"]);
    expect(result.visited).toEqual(["root", "original", "destination", "child"]);
    expect(result.drawn).toEqual(["root", "original", "destination", "child"]);
    expect(child.parent).toBe(destination);
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
    child.requestWalk();
    destination.requestWalk();

    // The child prepares before the destination adopts it; registering it again does not repeat that.
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
    mover.requestWalk();

    const result = walk();
    expect(result.prepared).toEqual(["root", "original", "mover", "destination"]);
    expect(result.visited).toEqual(["root", "original", "mover", "destination"]);
    expect(moved.isTraversalAllowed()).toBe(false);
  });

  it("does not reuse a detached node after a requested preparation removes it from a warmed tree", () => {
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
    later.requestWalk();

    expect(walk()).toMatchObject({ prepared: ["root", "later"], visited: ["root", "later"] });
    expect(walk()).toMatchObject({ prepared: ["root", "later"], visited: ["root", "later"] });
    expect(walk().prepared).toEqual(["root", "later"]);
    expect(removed.parent).toBeUndefined();
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
    removed.requestWalk();
    later.requestWalk();

    // The removed node prepared earlier in this frame; once detached it is neither painted nor completed.
    expect(walk()).toMatchObject({ prepared: ["root", "removed", "later"], visited: ["root", "later"] });
    expect(walk()).toMatchObject({ prepared: ["root", "later"], visited: ["root", "later"] });
    expect(walk().prepared).toEqual(["root", "later"]);
    expect(removed.parent).toBeUndefined();
  });

  it("discovers a new child in an earlier branch and honors suppression from a requested preparation", () => {
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
    later.requestWalk();

    const result = walk();
    expect(result.prepared.slice().sort()).toEqual(["created", "earlier", "later", "retained", "root"]);
    expect(result.drawn).toEqual(["root", "earlier", "retained", "created", "later"]);
    expect(result.events.indexOf("prepare:created")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.indexOf("visible:suppressed:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(walk().prepared.sort()).toEqual(["created", "earlier", "later", "retained", "root"]);
    later.data.prepare = () => true;
    later.requestWalk();
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

  it("paints a child that painting moves to a later branch from the next frame", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const destination = add("destination", 30);
    walk();
    walk();
    original.data.paint = () => {
      destination.append(child);
      return true;
    };

    // Moving registers the child again; nodes registered while painting wait for the next frame.
    expect(walk()).toMatchObject({
      visited: ["root", "original", "destination"],
      drawn: ["root", "original", "destination"],
    });
    expect(walk().drawn).toEqual(["root", "original", "destination", "child"]);
  });

  it("finishes a prepared unvisited child without paint when an iterator reparents it to a later prepared branch", () => {
    const { add, walk } = setup();
    const original = add("original", 10);
    const child = add("child", 20, original);
    const destination = add("destination", 30);
    walk();
    walk();
    original.data.paint = () => {
      destination.append(child);
      original.data.paint = undefined;
      return true;
    };
    child.requestWalk();
    destination.requestWalk();

    // Its update already ran, so it completes this frame without paint and paints at its new place next.
    expect(walk()).toMatchObject({
      prepared: ["root", "original", "child", "destination"],
      visited: ["root", "original", "destination", "child"],
      drawn: ["root", "original", "destination"],
    });
    expect(walk()).toMatchObject({
      visited: ["root", "original", "destination", "child"],
      drawn: ["root", "original", "destination", "child"],
    });
  });

  it("defers a node that a newly visible node appends to a painted ancestor until the next frame", () => {
    const { root, state, add, make, walk } = setup();
    add("resident", 10);
    const trigger = add("trigger", 500);
    walk();
    state.viewport = viewport(100);
    walk();
    const created = make("created", 20);
    trigger.data.paint = () => {
      if (!created.parent) root.append(created);
      return true;
    };

    state.viewport = viewport(1000);
    expect(walk()).toMatchObject({
      prepared: ["root", "resident", "trigger"],
      visited: ["root", "resident", "trigger"],
    });
    const result = walk();
    expect(result.drawn).toEqual(["root", "resident", "trigger", "created"]);
    expect(result.prepared.slice().sort()).toEqual(["created", "resident", "root", "trigger"]);
    expect(result.events.indexOf("prepare:created")).toBeLessThan(result.events.indexOf("draw:root"));
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
    expect(scope.nodes).toHaveLength(0);
    expect(scope["paintOrder"]?.nodes.some((node) => node !== root) ?? false).toBe(false);
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

  it("skips clean descendants when an ancestor suppresses them during paint", () => {
    const { add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    walk();
    parent.data.paint = () => false;
    let result = walk();
    expect(result.prepared).toEqual(["root", "parent"]);
    expect(result.visited).toEqual(["root", "parent"]);
    expect(result.drawn).toEqual(["root", "parent"]);
    expect([child.isVisible(), leaf.isVisible()]).toEqual([false, false]);

    parent.data.prepare = () => false;
    result = walk();
    expect(result.prepared).toEqual(["root", "parent"]);
    expect(result.visited).toEqual(["root", "parent"]);
    parent.data.prepare = parent.data.paint = () => true;
    parent.requestWalk();
    expect(walk().drawn).toEqual(["root", "parent", "child", "leaf"]);
  });

  it("finishes prepared descendants without paint when an ancestor suppresses them during paint", () => {
    const { add, walk } = setup();
    const parent = add("parent", 10);
    const child = add("child", 20, parent);
    const leaf = add("leaf", 30, child);
    walk();
    parent.data.paint = () => false;
    leaf.requestWalk();
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
    parent.requestWalk();
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
    // The clean child is not reached once its ancestor suppresses the branch.
    expect(allowed).toEqual([true]);
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
