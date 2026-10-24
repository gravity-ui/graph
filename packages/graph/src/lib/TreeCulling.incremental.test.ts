import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type Probe = ITree & { name: string; paint?: () => boolean };
/** The private complete scan, spied on to tell it from tile queries. */
type TScanProbe = { publishScan(viewport: TTileRect, keepBase: boolean): void };

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

function setup() {
  const state = { viewport: rect(0, 0, 100, 100) };
  const events: string[] = [];
  const nodes: Array<Tree<Probe>> = [];
  const published = new Map<Tree<Probe>, boolean>();
  const make = (name: string, x?: number, y = x): Tree<Probe> => {
    const node: Tree<Probe> = new Tree<Probe>({
      name,
      prepareUpdate: () => {
        events.push(`prepare:${name}`);
        return true;
      },
      iterate: (prepared) => {
        // A node the tree did not prepare applies its own pending work first.
        if (!prepared) node.data.prepareUpdate?.();
        if (name === "root") {
          // The root paints first: record visibility published for this frame before anything draws.
          for (const other of nodes) {
            const visible = other.isVisible();
            const previous = published.get(other);
            if (previous !== undefined && previous !== visible) events.push(`visible:${other.data.name}:${visible}`);
            published.set(other, visible);
          }
        }
        events.push(`iterate:${name}`);
        if (node.isVisible()) events.push(`draw:${name}`);
        return node.data.paint?.() ?? true;
      },
    });
    if (x !== undefined && y !== undefined) node.setBounds(x, y, x + 10, y + 10);
    if (name !== "root") nodes.push(node);
    return node;
  };
  const root = make("root");
  root.setCulling({ tileSize: 32, getViewport: () => state.viewport });
  const add = (name: string, x: number, y = x, parent: Tree = root): Tree<Probe> => {
    const node = make(name, x, y);
    parent.append(node);
    return node;
  };
  const walk = () => {
    events.length = 0;
    root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
    const names = (prefix: string): string[] =>
      events.filter((event) => event.startsWith(prefix)).map((event) => event.slice(prefix.length));
    return { prepared: names("prepare:"), drawn: names("draw:"), visited: names("iterate:"), events: events.slice() };
  };
  return { root, state, make, add, walk };
}

describe("TreeCulling incremental visibility", () => {
  it("matches a complete selection over random pans, zooms and jumps", () => {
    const { root, state, add, walk } = setup();
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const nodes: Array<Tree<Probe>> = [];
    for (let i = 0; i < 400; i++) {
      nodes.push(add(`n${i}`, Math.floor(random() * 2000), Math.floor(random() * 2000)));
    }
    const expected = () =>
      nodes
        .filter((node) => {
          const { minX, minY, maxX, maxY } = state.viewport;
          return (
            node.boundsMinX <= maxX && node.boundsMaxX >= minX && node.boundsMinY <= maxY && node.boundsMaxY >= minY
          );
        })
        .map((node) => node.data.name)
        .sort();

    for (let frame = 0; frame < 120; frame++) {
      const { minX, minY, maxX, maxY } = state.viewport;
      const kind = frame % 3;
      if (kind === 0) {
        const dx = Math.floor(random() * 60 - 30);
        const dy = Math.floor(random() * 60 - 30);
        state.viewport = rect(minX + dx, minY + dy, maxX + dx, maxY + dy);
      } else if (kind === 1) {
        const grow = Math.floor(random() * 80 - 40);
        state.viewport = rect(
          minX - grow,
          minY - grow,
          Math.max(minX - grow, maxX + grow),
          Math.max(minY - grow, maxY + grow)
        );
      } else if (frame % 10 === 2) {
        const x = Math.floor(random() * 1800);
        const y = Math.floor(random() * 1800);
        state.viewport = rect(x, y, x + 200, y + 150);
      }
      if (frame % 17 === 5) {
        const node = nodes[Math.floor(random() * nodes.length)];
        const x = Math.floor(random() * 2000);
        const y = Math.floor(random() * 2000);
        node.setBounds(x, y, x + 10, y + 10);
      }
      const result = walk();
      expect(result.drawn.filter((name) => name !== "root").sort()).toEqual(expected());
      expect(
        nodes
          .filter((node) => node.isVisible())
          .map((node) => node.data.name)
          .sort()
      ).toEqual(expected());
    }
    expect(root["culling"]?.nodes).toHaveLength(400);
  });

  it("rechecks only nodes near the viewport edges when the camera pans", () => {
    const { root, state, add, walk } = setup();
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) add(`n${x}_${y}`, x * 50, y * 50);
    }
    state.viewport = rect(0, 0, 400, 400);
    walk();
    walk();
    const scope = root["culling"];
    if (!scope) throw new Error("Missing scope");
    const query = jest.spyOn(scope.index, "query");
    const linearScan = jest.spyOn(scope as unknown as TScanProbe, "publishScan");
    const checked = new Set<Tree>();
    const intersects = jest.spyOn(scope, "intersects").mockImplementation(function (this: unknown, node, viewport) {
      checked.add(node);
      return (
        !viewport ||
        Number.isNaN(node.boundsMinX) ||
        (node.boundsMinX <= viewport.maxX &&
          node.boundsMaxX >= viewport.minX &&
          node.boundsMinY <= viewport.maxY &&
          node.boundsMaxY >= viewport.minY)
      );
    });

    state.viewport = rect(20, 0, 420, 400);
    const result = walk();
    expect(linearScan).not.toHaveBeenCalled();
    for (const [strip] of query.mock.calls) expect(strip.maxX - strip.minX).toBeLessThanOrEqual(20);
    // Only the columns crossing the left and right edges are rechecked, not the 81 visible nodes.
    expect(checked.size).toBeLessThanOrEqual(2 * 10 + 1);
    // Edges are inclusive: the column at x = 400 was already visible, only the first column leaves.
    expect(result.events.filter((event) => event.startsWith("visible:")).sort()).toEqual(
      Array.from({ length: 9 }, (_, y) => `visible:n0_${y}:false`).sort()
    );
    expect(result.drawn).toHaveLength(1 + 8 * 9);
    intersects.mockRestore();
  });

  it("lets clean visible nodes prepare inside iterate and requested nodes before painting", () => {
    const { root, add, walk } = setup();
    const first = add("first", 10);
    add("second", 30);
    add("outside", 1000);
    walk();
    const prepare = jest.fn(root.data.prepareUpdate);
    root.data.prepareUpdate = prepare;
    let result = walk();
    expect(result.prepared).toEqual(["root", "first", "second"]);
    expect(result.events.indexOf("prepare:first")).toBeGreaterThan(result.events.indexOf("draw:root"));
    expect(prepare).toHaveBeenCalledTimes(1);

    first.requestWalk();
    result = walk();
    expect(result.prepared).toEqual(["root", "first", "second"]);
    expect(result.events.indexOf("prepare:first")).toBeLessThan(result.events.indexOf("draw:root"));
    expect(result.events.filter((event) => event === "prepare:first")).toHaveLength(1);
  });

  it("paints children that a clean node adds while painting from the next frame", () => {
    const { make, add, walk } = setup();
    const parent = add("parent", 10);
    walk();
    const late = make("late", 20);
    parent.data.paint = () => {
      parent.append(late);
      parent.data.paint = undefined;
      return true;
    };

    let result = walk();
    expect(result.drawn).toEqual(["root", "parent"]);
    result = walk();
    expect(result.drawn).toEqual(["root", "parent", "late"]);
    expect(result.events.indexOf("prepare:late")).toBeLessThan(result.events.indexOf("draw:root"));
  });
});
