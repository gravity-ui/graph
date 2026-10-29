import type { TTileRect } from "./TileIndex";
import { ITree, Tree } from "./Tree";

type TProbe = ITree & {
  name: string;
  /** What this node's preparation and painting return: false suppresses its children. */
  allowChildren: boolean;
  /** One-shot work done by this node's next preparation. */
  onPrepare?: () => void;
};

type TProbeTree = Tree<TProbe>;

type TFrame = {
  prepared: TProbeTree[];
  /** `visible` passed to each iterated node. */
  painted: Map<TProbeTree, boolean>;
  /** Nodes whose iterate() returned false while painting. */
  vetoed: Set<TProbeTree>;
  errors: string[];
};

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

function intersects(node: Tree, viewport: TTileRect | undefined): boolean {
  return (
    !viewport ||
    Number.isNaN(node.boundsMinX) ||
    (node.boundsMinX <= viewport.maxX &&
      node.boundsMaxX >= viewport.minX &&
      node.boundsMinY <= viewport.maxY &&
      node.boundsMaxY >= viewport.minY)
  );
}

function setup() {
  const state: { viewport: TTileRect | undefined; enabled: boolean } = {
    viewport: rect(0, 0, 100, 100),
    enabled: true,
  };
  const newFrame = (): TFrame => ({ prepared: [], painted: new Map(), vetoed: new Set(), errors: [] });
  let frame = newFrame();
  const hooks: { atPublication?: () => void } = {};
  const make = (name: string): TProbeTree => {
    const node: TProbeTree = new Tree<TProbe>({
      name,
      allowChildren: true,
      prepareUpdate: () => {
        if (frame.prepared.includes(node)) frame.errors.push(`${name} prepared twice`);
        frame.prepared.push(node);
        const work = node.data.onPrepare;
        node.data.onPrepare = undefined;
        work?.();
        return node.data.allowChildren;
      },
      iterate: (prepared, visible) => {
        // The owner paints first: publication is complete and nothing has painted yet.
        if (name === "root") hooks.atPublication?.();
        const allowed = prepared ? node.data.allowChildren : node.data.prepareUpdate?.() ?? true;
        if (frame.painted.has(node)) frame.errors.push(`${name} iterated twice`);
        frame.painted.set(node, visible);
        if (!allowed) frame.vetoed.add(node);
        return allowed;
      },
    });
    return node;
  };
  const root = make("root");
  root.setCulling({ tileSize: 64, getViewport: () => state.viewport, isEnabled: () => state.enabled });
  const walk = (): TFrame => {
    frame = newFrame();
    root.traverseDown((node, prepared, visible) => node.data.iterate(prepared, visible));
    return frame;
  };
  return { root, state, make, walk, hooks, current: () => frame };
}

describe("TreeCulling publication invariants", () => {
  it.each([false, true])(
    "paints a prepared child moved to another parent during preparation (partial viewport: %s)",
    (partial) => {
      const { root, make, walk } = setup();
      const at = (node: TProbeTree, x: number): TProbeTree => {
        node.setBounds(x, x, x + 10, x + 10);
        return node;
      };
      const original = at(make("original"), 10);
      const child = at(make("child"), 10);
      const destination = at(make("destination"), 10);
      root.append(original);
      original.append(child);
      root.append(destination);
      if (partial) root.append(at(make("distant"), 1000));
      walk();
      // The child prepares first, then the destination's preparation adopts it in the same frame.
      child.requestWalk();
      destination.requestWalk();
      destination.data.onPrepare = () => destination.append(child);
      for (let i = 0; i < 3; i++) {
        const frame = walk();
        expect(frame.errors).toEqual([]);
        expect(frame.painted.get(child)).toBe(true);
      }
      expect(child.parent).toBe(destination);
      expect(child.isVisible()).toBe(true);
    }
  );

  it("does not paint a prepared child moved during preparation under a parent that suppresses it", () => {
    const { root, make, walk } = setup();
    const child = make("child");
    const destination = make("destination");
    child.setBounds(10, 10, 20, 20);
    destination.setBounds(10, 10, 20, 20);
    root.append(child);
    root.append(destination);
    walk();
    child.requestWalk();
    destination.requestWalk();
    destination.data.allowChildren = false;
    destination.data.onPrepare = () => destination.append(child);
    const frame = walk();
    expect(frame.errors).toEqual([]);
    // Its update already ran in this frame, so it completes without painting.
    expect(frame.painted.get(child)).toBe(false);
    expect(child.isVisible()).toBe(false);
    destination.data.allowChildren = true;
    destination.requestWalk();
    expect(walk().painted.get(child)).toBe(true);
  });

  it("keeps no frame references to nodes removed after the last traversal", () => {
    const { root, make, walk } = setup();
    const parent = make("parent");
    const child = make("child");
    parent.setBounds(10, 10, 20, 20);
    child.setBounds(10, 10, 20, 20);
    root.append(parent);
    parent.append(child);
    walk();
    root.remove(parent);
    const scope = root.scope;
    if (!scope) throw new Error("Missing scope");
    for (const list of [scope["visitList"], scope["prepared"], scope["visible"], scope.nodes]) {
      expect(list.includes(parent) || list.includes(child)).toBe(false);
    }
  });

  it("checks unchanged children in linear time for any number of z-indexes", () => {
    const root = new Tree({ iterate: () => true });
    const nodes = Array.from({ length: 100 }, (_, i) => {
      const node = new Tree({ iterate: () => true });
      node.updateZIndex(i);
      root.append(node);
      return node;
    });
    const counter = { reads: 0 };
    for (const node of nodes) {
      const value = { zIndex: node.zIndex };
      Object.defineProperty(node, "zIndex", {
        configurable: true,
        get: (): number => {
          counter.reads++;
          return value.zIndex;
        },
        set: (next: number): void => {
          value.zIndex = next;
        },
      });
    }
    root.setChildren(nodes);
    expect(counter.reads).toBeLessThanOrEqual(2 * nodes.length);
  });

  it.each([1, 2, 3, 4, 5, 6])("matches a full recomputation after random changes (seed %i)", (seed) => {
    let value = seed * 7919;
    const random = (): number => {
      value = (value * 16807) % 2147483647;
      return value / 2147483647;
    };
    const pick = <T>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];
    const { root, state, make, walk, hooks, current } = setup();
    const created: TProbeTree[] = [];
    let step = 0;

    const attached = (): TProbeTree[] => {
      const result: TProbeTree[] = [];
      const visit = (node: Tree): void => {
        for (const child of node.children) {
          result.push(child as TProbeTree);
          visit(child);
        }
      };
      visit(root);
      return result;
    };
    const isAncestor = (ancestor: Tree, node: Tree): boolean => {
      for (let current: Tree | undefined = node; current; current = current.parent) {
        if (current === ancestor) return true;
      }
      return false;
    };
    // Eligible: every ancestor up to the owner contains the node and allows walking its children.
    const eligible = (node: Tree): boolean => {
      for (let current: Tree = node; current !== root; ) {
        const parent = current.parent;
        if (!parent || !parent.children.has(current) || !parent.childrenWalkAllowed) return false;
        current = parent;
      }
      return true;
    };
    const randomBounds = (node: Tree): void => {
      if (random() < 0.1) {
        node.setBounds(NaN, NaN, NaN, NaN);
        return;
      }
      const x = Math.floor(random() * 1000);
      const y = Math.floor(random() * 1000);
      node.setBounds(x, y, x + 5 + Math.floor(random() * 200), y + 5 + Math.floor(random() * 200));
    };
    const create = (parent: Tree): TProbeTree => {
      const node = make(`n${created.length}`);
      created.push(node);
      randomBounds(node);
      node.updateZIndex(1 + Math.floor(random() * 3));
      parent.append(node);
      return node;
    };
    const parentFor = (node?: Tree): Tree => {
      const candidates = attached().filter((candidate) => !node || !isAncestor(node, candidate));
      return random() < 0.3 ? root : pick(candidates) ?? root;
    };

    // Expected publication, captured when the owner paints first.
    let expected = new Set<TProbeTree>();
    let ancestry = new Map<TProbeTree, Tree[]>();
    hooks.atPublication = () => {
      const errors = current().errors;
      expected = new Set();
      ancestry = new Map();
      const scope = root.scope;
      if (!scope) throw new Error("Missing scope");
      for (const node of attached()) {
        const visible = eligible(node) && intersects(node, state.viewport);
        if (visible) expected.add(node);
        const chain: Tree[] = [];
        for (let parent = node.parent; parent && parent !== root; parent = parent.parent) chain.push(parent);
        ancestry.set(node, chain);
        if (node.published !== visible)
          errors.push(`${node.data.name} published ${node.published}, expected ${visible}`);
        if (node.isVisible() !== visible) errors.push(`${node.data.name} isVisible ${node.isVisible()}`);
      }
      const visibleList: Tree[] = scope["visible"];
      if (visibleList.length !== expected.size) errors.push(`visible list ${visibleList.length} != ${expected.size}`);
      visibleList.forEach((node, slot) => {
        if (node.visibleSlot !== slot || !node.published) errors.push(`visible list slot ${slot}`);
      });
    };

    const operations: Array<() => void> = [
      () => create(parentFor()),
      () => {
        const node = pick(attached());
        node?.parent?.remove(node);
      },
      () => {
        const node = pick(created);
        if (node) parentFor(node).append(node);
      },
      () => {
        const node = pick(attached());
        if (node) randomBounds(node);
      },
      () => {
        const node = pick(attached());
        if (!node) return;
        node.data.allowChildren = !node.data.allowChildren;
        // Without a request the change applies when the node paints, as a paint-time veto.
        if (random() < 0.5) node.requestWalk();
      },
      () => pick(attached())?.updateZIndex(1 + Math.floor(random() * 3)),
      () => pick(attached())?.requestWalk(),
      () => {
        const x = Math.floor(random() * 1200) - 200;
        const y = Math.floor(random() * 1200) - 200;
        const size = 50 + Math.floor(random() * 1500);
        state.viewport = random() < 0.05 ? undefined : rect(x, y, x + size, y + size * 0.6);
      },
      () => {
        const viewport = state.viewport;
        if (!viewport) return;
        const dx = Math.floor(random() * 41) - 20;
        // Shifting the same object in place: publication must work on its own snapshot.
        viewport.minX += dx;
        viewport.maxX += dx;
      },
      () => {
        if (random() < 0.2) state.enabled = !state.enabled;
      },
      () => {
        // A preparation that changes structure or geometry in the same frame.
        const node = pick(attached());
        if (!node) return;
        const kind = Math.floor(random() * 4);
        const other = pick(attached().filter((candidate) => !isAncestor(candidate, node)));
        // Requested first, the other node is usually prepared before this preparation changes it.
        other?.requestWalk();
        node.data.onPrepare = () => {
          if (kind === 0 && other && !isAncestor(other, node)) node.append(other);
          else if (kind === 1 && other) randomBounds(other);
          else if (kind === 2) create(node);
          else {
            const child = pick(Array.from(node.children));
            if (child) node.remove(child);
          }
        };
        node.requestWalk();
      },
    ];

    for (let i = 0; i < 12; i++) create(parentFor());
    for (step = 0; step < 250; step++) {
      const count = 1 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) pick(operations)?.();
      const frame = walk();
      // Every node visible at publication is painted unless an ancestor suppressed it while painting.
      for (const node of expected) {
        const suppressed = ancestry.get(node)?.some((ancestor) => frame.vetoed.has(ancestor as TProbeTree));
        if (!suppressed && frame.painted.get(node) !== true) frame.errors.push(`${node.data.name} not painted`);
      }
      for (const [node, visible] of frame.painted) {
        if (visible && node !== root && !expected.has(node)) frame.errors.push(`${node.data.name} painted offscreen`);
      }
      if (frame.errors.length) throw new Error(`seed ${seed}, step ${step}: ${frame.errors.join("; ")}`);
    }
  });
});
