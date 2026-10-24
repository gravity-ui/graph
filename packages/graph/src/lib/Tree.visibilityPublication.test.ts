import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & {
  name: string;
  prepare?: () => boolean;
  paint?: () => boolean;
};

function setup() {
  const state = { viewport: { minX: 0, minY: 0, maxX: 100, maxY: 100 } as TTileRect };
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
  const make = (name: string, x?: number): Tree<Probe> => {
    const node: Tree<Probe> = new Tree<Probe>({
      name,
      prepareUpdate: () => {
        events.push(`prepare:${name}`);
        return node.data.prepare?.() ?? true;
      },
      iterate: (prepared) => {
        // A node the tree did not prepare applies its own pending work first.
        const allowed = prepared ? true : node.data.prepareUpdate?.() ?? true;
        if (name === "root") recordPublished();
        events.push(`iterate:${name}`);
        if (node.isVisible()) events.push(`draw:${name}`);
        const painted = node.data.paint?.() ?? true;
        return allowed && painted;
      },
    });
    if (x !== undefined) node.setBounds(x, x, x + 5, x + 5);
    if (name !== "root") nodes.push(node);
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
    root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
    const names = (prefix: string): string[] =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), events: events.slice() };
  };
  return { root, state, add, fill, walk };
}

describe("Tree visibility publication", () => {
  it("keeps a new offscreen node out of the published set after an unchanged partial viewport warms", () => {
    const { add, fill, walk } = setup();
    const residents = fill();
    walk();
    walk();
    const node = add("new", 2000);

    const result = walk();
    expect(result.prepared.filter((name) => name === "new")).toEqual(["new"]);
    expect(result.drawn).toEqual(["root", ...residents]);
    expect(result.events).toContain(`batch:${residents.slice().sort().join(",")}`);
    expect(node.isVisible()).toBe(false);
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
    // The veto only lived inside one paint: the parent prepares before the next publication.
    expect(result.events).toContain(`batch:${["parent", "child", ...residents].sort().join(",")}`);
    expect(result.events).not.toContain("visible:child:false");
    expect(result.events.indexOf("prepare:parent")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(child.isVisible()).toBe(true);
  });
});
