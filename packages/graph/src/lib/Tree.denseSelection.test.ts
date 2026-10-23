import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & {
  name: string;
  prepare?: () => boolean;
  visibility?: (visible: boolean) => void;
};

function setup(fullWalkShare: number) {
  const state = { viewport: { minX: 0, minY: 0, maxX: 100, maxY: 100 } as TTileRect, token: 0 };
  const events: string[] = [];
  const batch = new Set<string>();
  const make = (name: string, x?: number) => {
    const node: Tree<Probe> = new Tree<Probe>({
      name,
      prepareUpdate: (): boolean => {
        events.push(`prepare:${name}`);
        return node.data.prepare?.() ?? true;
      },
      onViewportChange: (visible) => {
        events.push(`visible:${name}:${visible}`);
        if (visible) batch.add(name);
        else batch.delete(name);
        node.data.visibility?.(visible);
      },
      iterate: () => {
        events.push(`iterate:${name}`);
        if (node.isVisible()) events.push(`draw:${name}`);
        if (name === "root") events.push(`batch:${Array.from(batch).sort().join(",")}`);
        return true;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 10, x + 10);
    if (name !== "root") batch.add(name);
    return node;
  };
  const root = make("root");
  root.setCulling({
    tileSize: 32,
    getViewport: () => state.viewport,
    getWalkToken: () => state.token,
    fullWalkShare,
  });
  const add = (name: string, x?: number, parent = root) => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const fill = () => {
    const names = Array.from({ length: 20 }, (_, i) => `resident${i}`);
    for (const name of names) add(name, 20);
    return names;
  };
  const walk = () => {
    events.length = 0;
    state.token++;
    root.traverseDown((node) => node.data.iterate());
    const names = (prefix: string) =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), visited: names("iterate:"), events: events.slice() };
  };
  return { root, state, add, fill, walk };
}

/** Every visited node prepares in this frame, and never after its own paint. */
function expectPreparedBeforeOwnPaint(result: { events: string[]; visited: string[] }): void {
  for (const name of result.visited) {
    const prepared = result.events.indexOf(`prepare:${name}`);
    expect(prepared).toBeGreaterThanOrEqual(0);
    expect(prepared).toBeLessThan(result.events.indexOf(`iterate:${name}`));
  }
}

describe.each([
  ["dense", 0.75],
  ["sparse", 1],
] as const)("Tree %s partial selection", (_strategy, fullWalkShare) => {
  it("reaches a visible child through a clean offscreen ancestor without admitting its clean offscreen children", () => {
    const { state, add, fill, walk } = setup(fullWalkShare);
    const parent = add("parent", 1000);
    const leaf = add("leaf", 30, parent);
    const hiddenSibling = add("hiddenSibling", 1100, parent);
    const unknown = add("unknown");
    const residents = fill();
    walk();
    walk();

    const result = walk();
    expect(result.prepared).toEqual(["root", "leaf", "unknown", ...residents]);
    expect(result.drawn).toEqual(["root", "leaf", "unknown", ...residents]);
    expect(result.visited).toEqual(["root", "leaf", "unknown", ...residents]);
    expectPreparedBeforeOwnPaint(result);
    expect(parent.isSkippedByCulling(state.token)).toBe(true);
    expect(leaf.isSkippedByCulling(state.token)).toBe(false);
    expect(hiddenSibling.isSkippedByCulling(state.token)).toBe(true);
    expect(unknown.isVisible()).toBe(true);
  });

  it("prepares and paints in local z-order after a partial traversal warms", () => {
    const { add, fill, walk } = setup(fullWalkShare);
    const first = add("first", 10);
    add("child", 20, first);
    add("second", 30);
    const residents = fill();
    add("outside", 1000);
    first.updateZIndex(5);
    walk();
    walk();

    expect(walk()).toMatchObject({
      prepared: ["root", "second", ...residents, "first", "child"],
      drawn: ["root", "second", ...residents, "first", "child"],
    });
    first.updateZIndex(0);
    expect(walk()).toMatchObject({
      prepared: ["root", "first", "child", "second", ...residents],
      drawn: ["root", "first", "child", "second", ...residents],
    });
  });

  it("uses the final selection after a requested preparation moves one candidate out and another in", () => {
    const { add, fill, walk } = setup(fullWalkShare);
    const trigger = add("trigger", 10);
    const exiting = add("exiting", 30);
    const entering = add("entering", 1000);
    const residents = fill();
    walk();
    walk();
    trigger.data.prepare = () => {
      exiting.setBounds(1000, 1000, 1010, 1010);
      entering.setBounds(40, 40, 50, 50);
      return true;
    };
    trigger.requestWalk();

    const result = walk();
    expect(result.drawn).toEqual(["root", "trigger", "entering", ...residents]);
    expect(result.prepared.filter((name) => name === "entering")).toEqual(["entering"]);
    expect(result.prepared).not.toContain("exiting");
    expect(result.events).toContain(`batch:${["trigger", "entering", ...residents].sort().join(",")}`);
    for (const event of ["prepare:trigger", "visible:exiting:false", "visible:entering:true"]) {
      expect(result.events.indexOf(event)).toBeGreaterThanOrEqual(0);
      expect(result.events.indexOf(event)).toBeLessThan(result.events.indexOf("draw:root"));
    }
    expectPreparedBeforeOwnPaint(result);
    expect(walk().prepared).not.toContain("exiting");
  });

  it("paints a child attached after its parent's sibling in local order", () => {
    const { add, fill, walk } = setup(fullWalkShare);
    const first = add("first", 10);
    add("second", 30);
    const residents = fill();
    add("outside", 1000);
    walk();
    walk();
    add("lateChild", 20, first);
    walk();

    expect(walk()).toMatchObject({
      prepared: ["root", "first", "lateChild", "second", ...residents],
      drawn: ["root", "first", "lateChild", "second", ...residents],
    });
  });

  it("rechecks a later node when an earlier visibility callback changes its bounds", () => {
    const { state, add, fill, walk } = setup(fullWalkShare);
    const trigger = add("trigger", 120);
    const changed = add("changed", 40);
    const residents = fill();
    add("outside", 1000);
    walk();
    walk();
    trigger.data.visibility = (visible) => {
      if (visible) changed.setBounds(1000, 1000, 1010, 1010);
    };
    state.viewport = { minX: 0, minY: 0, maxX: 150, maxY: 150 };

    const result = walk();
    expect(result.prepared).not.toContain("changed");
    expect(result.drawn).toEqual(["root", "trigger", ...residents]);
    expect(result.events).toContain(`batch:${["trigger", ...residents].sort().join(",")}`);
    expect(result.events.indexOf("visible:changed:false")).toBeGreaterThan(
      result.events.indexOf("visible:trigger:true")
    );
    expect(result.events.indexOf("visible:changed:false")).toBeLessThan(result.events.indexOf("draw:root"));
  });

  it.each(["preparation", "visibility callback"])(
    "rechecks a selected node when %s changes the existing viewport object",
    (phase) => {
      const { state, add, fill, walk } = setup(fullWalkShare);
      const trigger = add("trigger", phase === "preparation" ? 10 : 120);
      add("target", 40);
      const residents = fill();
      add("outside", 1000);
      walk();
      walk();
      const changeViewport = () => {
        state.viewport.maxX = state.viewport.maxY = 35;
      };
      if (phase === "preparation") {
        trigger.data.prepare = () => {
          changeViewport();
          return true;
        };
        trigger.requestWalk();
      } else {
        trigger.data.visibility = (visible) => {
          if (visible) changeViewport();
        };
        state.viewport.maxX = state.viewport.maxY = 150;
      }

      // Publication repeats for the final viewport, so the trigger is drawn only if it still intersects it.
      const result = walk();
      const shown = phase === "preparation" ? ["trigger", ...residents] : residents;
      expect(result.prepared).not.toContain("target");
      expect(result.drawn).toEqual(["root", ...shown]);
      expect(result.events).toContain(`batch:${shown.slice().sort().join(",")}`);
      expect(result.events.indexOf("visible:target:false")).toBeGreaterThanOrEqual(0);
      expect(result.events.indexOf("visible:target:false")).toBeLessThan(result.events.indexOf("draw:root"));
    }
  );

  it("hides descendants when a visibility callback requests their ancestor to suppress them", () => {
    const { state, add, fill, walk } = setup(fullWalkShare);
    const trigger = add("trigger", 120);
    const parent = add("parent", 30);
    const child = add("child", 40, parent);
    const residents = fill();
    add("outside", 1000);
    walk();
    walk();
    let suppressed = false;
    parent.data.prepare = () => !suppressed;
    trigger.data.visibility = (visible) => {
      if (!visible) return;
      suppressed = true;
      parent.requestWalk();
    };
    state.viewport = { minX: 0, minY: 0, maxX: 150, maxY: 150 };

    const result = walk();
    expect(result.prepared).not.toContain("child");
    expect(result.events.indexOf("prepare:parent")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.drawn).toEqual(["root", "trigger", "parent", ...residents]);
    expect(result.visited).not.toContain("child");
    expect(result.events).toContain(`batch:${["trigger", "parent", ...residents].sort().join(",")}`);
    expect(result.events.indexOf("visible:child:false")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:child:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(child.isVisible()).toBe(false);
  });

  it("publishes the exit of a node initially visible without a preceding visibility callback", () => {
    const { state, add, fill, walk } = setup(fullWalkShare);
    const exiting = add("exiting", 40);
    const residents = fill();
    add("outside", 1000);
    expect(walk().events).not.toContain("visible:exiting:true");
    walk();
    state.viewport = { minX: 0, minY: 0, maxX: 35, maxY: 35 };

    const result = walk();
    expect(result.prepared).toEqual(["root", ...residents]);
    expect(result.drawn).toEqual(["root", ...residents]);
    expect(result.events).toContain(`batch:${residents.slice().sort().join(",")}`);
    expect(result.events.indexOf("visible:exiting:false")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:exiting:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(exiting.isSkippedByCulling(state.token)).toBe(true);
  });

  it("prepares a requested offscreen update and reveals its changed bounds before any paint", () => {
    const { add, fill, walk } = setup(fullWalkShare);
    const residents = fill();
    const parent = add("parent", 1000);
    const pending = add("pending", 1100, parent);
    add("cleanSibling", 1200, parent);
    walk();
    walk();
    pending.data.prepare = () => {
      pending.setBounds(40, 40, 50, 50);
      return true;
    };
    pending.requestWalk();

    const result = walk();
    expect(result.prepared).toEqual(["root", "parent", "pending", ...residents]);
    expect(result.drawn).toEqual(["root", ...residents, "pending"]);
    expect(result.events).toContain(`batch:${[...residents, "pending"].sort().join(",")}`);
    expect(result.events.indexOf("visible:pending:true")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:pending:true")).toBeLessThan(result.events.indexOf("draw:root"));
  });
});
