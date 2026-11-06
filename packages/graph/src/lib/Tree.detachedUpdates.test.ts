import { DetachedUpdates, TDetachedEntry } from "./DetachedUpdates";
import { ITree, Tree } from "./Tree";

function node(name: string, log: string[]): Tree {
  const tree: Tree = new Tree({
    prepareUpdate: () => {
      log.push(`prepare:${name}`);
      return true;
    },
    iterate: () => {
      if (!tree.framePrepared) log.push(`prepare:${name}`);
      log.push(`paint:${name}`);
      return true;
    },
  } satisfies ITree);
  return tree;
}

function setup(culling: boolean) {
  const log: string[] = [];
  const root = node("root", log);
  const child = node("child", log);
  root.append(child);
  if (culling) root.setCulling({ tileSize: 64, getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }) });
  root.detachedUpdates = new DetachedUpdates();
  const walk = (): void => root.traverseDown((tree) => tree.data.iterate());
  walk();
  log.length = 0;
  return { log, root, child, walk, queue: root.detachedUpdates };
}

describe("Tree applies detached updates", () => {
  it("applies them after preparation in a culled tree and prepares what they request", () => {
    const { log, child, walk, queue } = setup(true);
    const update: TDetachedEntry = {
      slot: -1,
      appliedFrame: -1,
      apply: () => {
        log.push("apply");
        child.requestWalk();
      },
    };
    queue.enqueue(update);
    walk();
    expect(log).toEqual(["prepare:root", "apply", "prepare:child", "paint:root", "paint:child"]);
  });

  it("applies them before the walk without culling", () => {
    const { log, walk, queue } = setup(false);
    queue.enqueue({ slot: -1, appliedFrame: -1, apply: () => log.push("apply") });
    walk();
    expect(log).toEqual(["apply", "prepare:root", "paint:root", "prepare:child", "paint:child"]);
  });

  it("starts a new frame on every traversal", () => {
    const { log, walk, queue } = setup(true);
    const again: TDetachedEntry = {
      slot: -1,
      appliedFrame: -1,
      apply: () => {
        log.push("apply");
        queue.enqueue(again);
      },
    };
    queue.enqueue(again);
    walk();
    expect(log.filter((entry) => entry === "apply")).toHaveLength(1);
    walk();
    expect(log.filter((entry) => entry === "apply")).toHaveLength(2);
  });
});
