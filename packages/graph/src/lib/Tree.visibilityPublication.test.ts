import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & {
  name: string;
  prepare?: () => boolean;
  paint?: () => boolean;
  visibility?: (visible: boolean) => void;
};

function setup() {
  const state = { viewport: { minX: 0, minY: 0, maxX: 100, maxY: 100 } as TTileRect };
  const events: string[] = [];
  const batch = new Set<string>();
  const make = (name: string, x?: number): Tree<Probe> => {
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
        node.data.visibility?.(visible);
      },
      iterate: () => {
        events.push(`iterate:${name}`);
        if (name === "root") events.push(`batch:${Array.from(batch).sort().join(",")}`);
        if (node.isVisible()) events.push(`draw:${name}`);
        return node.data.paint?.() ?? true;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 5, x + 5);
    if (name !== "root") batch.add(name);
    return node;
  };
  const root = make("root");
  root.setCulling({ tileSize: 32, getViewport: () => state.viewport });
  const add = (name: string, x: number, parent = root): Tree<Probe> => {
    const node = make(name, x);
    parent.append(node);
    return node;
  };
  const fill = (): string[] => {
    const names = Array.from({ length: 20 }, (_, i) => `resident${i}`);
    for (const name of names) add(name, 25);
    add("outside", 1000);
    return names;
  };
  const walk = () => {
    events.length = 0;
    root.traverseDown((node) => node.data.iterate());
    const names = (prefix: string): string[] =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), events: events.slice() };
  };
  return { root, state, add, fill, walk };
}

describe("Tree visibility publication", () => {
  it.each(["bounds", "viewport", "ancestor"] as const)(
    "rechecks a resident when a clean exit callback changes its %s before publication",
    (change) => {
      const { state, add, fill, walk } = setup();
      const exiting = add("exiting", 5);
      const parent = add("parent", 30);
      const target = add("target", 40, parent);
      const residents = fill();
      walk();
      walk();
      let suppressed = false;
      parent.data.prepare = () => !suppressed;
      exiting.data.visibility = (visible) => {
        if (visible) return;
        if (change === "bounds") target.setBounds(1000, 1000, 1005, 1005);
        else if (change === "viewport") state.viewport.maxX = state.viewport.maxY = 35;
        else {
          // Components suppress children from their own update, requested like any other change.
          suppressed = true;
          parent.requestWalk();
        }
      };
      state.viewport.minX = state.viewport.minY = 20;

      const result = walk();
      expect(result.prepared).not.toContain("exiting");
      expect(result.prepared).not.toContain("target");
      expect(result.drawn).toEqual(["root", "parent", ...residents]);
      expect(result.events).toContain(`batch:${["parent", ...residents].sort().join(",")}`);
      expect(result.events.indexOf("visible:target:false")).toBeGreaterThan(
        result.events.indexOf("visible:exiting:false")
      );
      expect(result.events.indexOf("visible:target:false")).toBeLessThan(result.events.indexOf("draw:root"));
      expect(target.isVisible()).toBe(false);
    }
  );

  it("publishes a new offscreen node's initial exit after an unchanged partial viewport warms", () => {
    const { add, fill, walk } = setup();
    const residents = fill();
    walk();
    walk();
    add("new", 2000);

    const result = walk();
    expect(result.prepared.filter((name) => name === "new")).toEqual(["new"]);
    expect(result.drawn).toEqual(["root", ...residents]);
    expect(result.events).toContain(`batch:${residents.slice().sort().join(",")}`);
    expect(result.events.indexOf("visible:new:false")).toBeGreaterThanOrEqual(0);
    expect(result.events.indexOf("visible:new:false")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(walk().prepared).not.toContain("new");
  });

  it("restores visibility before the next batch paint after painting suppressed a branch", () => {
    const { state, add, fill, walk } = setup();
    const parent = add("parent", 30);
    const child = add("child", 40, parent);
    const residents = fill();
    walk();
    walk();
    parent.data.paint = () => false;

    let result = walk();
    expect(result.drawn).toEqual(["root", "parent", ...residents]);
    expect(result.events).not.toContain("iterate:child");
    expect(child.isVisible()).toBe(false);

    parent.data.paint = undefined;
    state.viewport.maxX = state.viewport.maxY = 99;
    result = walk();
    expect(result.drawn).toEqual(["root", "parent", "child", ...residents]);
    // The veto only lived inside one paint, so the child's published membership never changed.
    expect(result.events).toContain(`batch:${["parent", "child", ...residents].sort().join(",")}`);
    expect(result.events).not.toContain("visible:child:false");
    expect(result.events.indexOf("prepare:parent")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(child.isVisible()).toBe(true);
  });
});
