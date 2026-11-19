import { SceneStore } from "../../../lib/scene/SceneStore";
import { DelegatedRanks } from "../DelegatedRanks";

const input = (id: string): Parameters<SceneStore["add"]>[0] => ({
  id,
  zIndex: 200,
  x: 0,
  y: 0,
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  primitives: [],
});

describe("DelegatedRanks", () => {
  it("ranks shown elements densely in scene order, once per flush, following raises and deletes", () => {
    const store = new SceneStore();
    ["a", "b", "c"].forEach((id) => store.add(input(id)));
    const schedule = jest.fn();
    const ranks = new DelegatedRanks(store, schedule);
    const rank = jest.spyOn(ranks as unknown as { rank(generation: number): ReadonlyMap<string, number> }, "rank");
    ranks.track("a", true);
    ranks.track("b", true);
    expect(schedule).toHaveBeenCalledTimes(1);
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b"), ranks.rankOf("c")]).toEqual([1, 2, 0]);
    store.raise("a");
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([1, 2]);
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([2, 1]);
    store.setStyle("b", store.defineStyle({ raise: 1 }));
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([1, 2]);
    ranks.track("a", false);
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([0, 1]);
    store.delete("b");
    ranks.flush();
    expect(ranks.rankOf("b")).toBe(0);
    const before = rank.mock.calls.length;
    for (let i = 0; i < 200; i++) {
      store.add(input(`n${i}`));
      ranks.track(`n${i}`, true);
    }
    ranks.flush();
    expect(ranks.rankOf("n199")).toBe(200);
    expect(rank.mock.calls.length - before).toBe(1);
    ranks.dispose();
  });

  it("ranks an element again when it is added back under a tracked id", () => {
    const store = new SceneStore();
    ["a", "b"].forEach((id) => store.add(input(id)));
    const ranks = new DelegatedRanks(store, jest.fn());
    ranks.track("a", true);
    ranks.track("b", true);
    ranks.flush();
    store.delete("a");
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([0, 1]);
    store.add(input("a"));
    ranks.flush();
    expect([ranks.rankOf("a"), ranks.rankOf("b")]).toEqual([2, 1]);
    ranks.dispose();
  });

  it("keeps an id tracked while any watcher remains", () => {
    const store = new SceneStore();
    store.add(input("a"));
    const ranks = new DelegatedRanks(store, jest.fn());
    // A container moves to a new view of the same block: the new view is watched before the old one is released.
    ranks.track("a", true);
    ranks.track("a", true);
    ranks.track("a", false);
    ranks.flush();
    expect(ranks.rankOf("a")).toBe(1);
    ranks.track("a", false);
    ranks.flush();
    expect(ranks.rankOf("a")).toBe(0);
    // A release without a watcher changes nothing.
    ranks.track("a", false);
    ranks.track("a", true);
    ranks.flush();
    expect(ranks.rankOf("a")).toBe(1);
    ranks.dispose();
  });

  it("ignores tracking after dispose", () => {
    const store = new SceneStore();
    store.add(input("a"));
    const schedule = jest.fn();
    const ranks = new DelegatedRanks(store, schedule);
    ranks.dispose();
    ranks.track("a", true);
    ranks.flush();
    expect(ranks.rankOf("a")).toBe(0);
    expect(schedule).not.toHaveBeenCalled();
  });
});
