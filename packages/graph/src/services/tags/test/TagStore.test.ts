import { computed, effect, signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { TagStore } from "../TagStore";
import { defineTag } from "../defineTag";

describe("TagStore", () => {
  const running = defineTag("running");
  const presence = defineTag<{ color: string }>("presence");

  it("gives each defined tag a unique id and its name", () => {
    const a = defineTag("a");
    const b = defineTag("a");
    expect(a.name).toBe("a");
    expect(a.id).not.toBe(b.id);
  });

  it("set replaces members and notifies only entities whose tags changed", () => {
    const tags = new TagStore();
    const one = tags.$of("block", "1");
    const two = tags.$of("block", "2");
    const seen: string[] = [];
    effect(() => {
      seen.push(one.value ? "1" : "1");
    });
    effect(() => {
      seen.push(two.value ? "2" : "2");
    });
    seen.length = 0;
    tags.set(running, { block: ["1"] });
    expect(seen).toEqual(["1"]);
    expect(one.value.has(running)).toBe(true);
    seen.length = 0;
    tags.set(running, { block: ["2"] });
    expect(seen.sort()).toEqual(["1", "2"]);
    expect(one.value.has(running)).toBe(false);
    expect(two.value.get(running)).toBe(true);
  });

  it("add, delete and clear change members incrementally", () => {
    const tags = new TagStore();
    tags.add(running, { block: ["1"], connection: ["c"] });
    tags.add(running, { block: ["2"] });
    tags.delete(running, { block: ["1"] });
    expect([...tags.membersOf(running).keys()].sort()).toEqual([`block\u00002`, `connection\u0000c`].sort());
    tags.clear(running);
    expect(tags.membersOf(running).size).toBe(0);
  });

  it("keeps tag values and does not notify when an equal value is written again", () => {
    const tags = new TagStore();
    const of = tags.$of("block", "1");
    tags.set(presence, { block: new Map([["1", { color: "#f00" }]]) });
    const first = of.value;
    tags.set(presence, { block: new Map([["1", { color: "#f00" }]]) });
    expect(of.value).toBe(first);
    expect(of.value.get(presence)).toEqual({ color: "#f00" });
  });

  it("retains inspected membership snapshots and signals across shallow-equal and mixed patches", () => {
    const tags = new TagStore();
    const first = { color: "red" };
    const equal = { color: "red" };
    const changed = { color: "blue" };
    const one = tags.$of("block", 1);
    tags.set(presence, { block: new Map([[1, first]]) });
    const original = tags.membersOf(presence);
    const initialTags = one.peek();
    tags.add(presence, { block: new Map([["1", equal]]) });
    expect(tags.membersOf(presence)).toBe(original);
    tags.add(presence, {
      block: new Map([
        [1, equal],
        [2, changed],
      ]),
    });
    const mixed = tags.membersOf(presence);
    expect(mixed.get("block\u00001")).toBe(equal);
    expect(mixed.get("block\u00002")).toBe(changed);
    expect(one.peek()).toBe(initialTags);
    expect(one.peek().get(presence)).toBe(first);
    expect(original.get("block\u00001")).toBe(first);
    expect(original.size).toBe(1);
    tags.delete(presence, { block: [1, "1", 9] });
    expect(mixed.size).toBe(2);
    const remaining = tags.membersOf(presence);
    tags.delete(presence, { block: [1] });
    expect(tags.membersOf(presence)).toBe(remaining);
    tags.clear(presence);
    expect(remaining.size).toBe(1);
  });

  it("keeps membership and signals unchanged when reading removal IDs fails", () => {
    const tags = new TagStore();
    tags.add(running, { block: ["a", "b"] });
    const seen = tags.membersOf(running);
    const ids = ["a", "b"];
    Object.defineProperty(ids, 1, {
      get: () => {
        throw new Error("read failed");
      },
    });
    expect(() => tags.delete(running, { block: ids })).toThrow("read failed");
    expect(tags.membersOf(running)).toBe(seen);
    tags.add(running, { block: ["c"] });
    expect([...tags.membersOf(running).keys()]).toEqual(["block\u0000a", "block\u0000b", "block\u0000c"]);
    expect(tags.peekOf("block", "a").has(running)).toBe(true);
  });

  it("publishes sparse edits in the same order and batch as a replacement, including reentrant writes", () => {
    const run = (incremental: boolean) => {
      const tags = new TagStore();
      const score = defineTag<number>("score");
      const members = new Map([
        ["b", 1],
        ["a", 2],
      ]);
      tags.set(score, { block: members });
      const events: string[] = [];
      let editing = false;
      ["a", "b", "c", "d"].forEach((id) => {
        tags.$of("block", id).subscribe((values) => {
          if (!editing) return;
          events.push(id + String(values.get(score)) + "/" + [...tags.membersOf(score).values()].join());
          if (id === "c" && values.get(score) === 3) tags.add(score, { block: new Map([["d", 4]]) });
        });
      });
      editing = true;
      const patch = new Map([
        ["c", 3],
        ["a", 20],
        ["b", 10],
      ]);
      if (incremental) tags.add(score, { block: patch });
      else tags.set(score, { block: new Map([...members, ...patch]) });
      if (incremental) tags.delete(score, { block: ["a", "c", "a", "b"] });
      else tags.set(score, { block: new Map([["d", 4]]) });
      tags.add(score, {
        block: new Map([
          ["a", 30],
          ["b", 40],
        ]),
      });
      tags.set(score, {
        block: new Map([
          ["a", 1],
          ["b", 2],
          ["d", 3],
        ]),
      });
      if (incremental)
        tags.add(score, {
          block: new Map([
            ["d", 6],
            ["b", 5],
            ["a", 4],
          ]),
        });
      else
        tags.set(score, {
          block: new Map([
            ["a", 4],
            ["b", 5],
            ["d", 6],
          ]),
        });
      return events;
    };
    const full = run(false);
    expect(full.length).toBeGreaterThan(8);
    expect(run(true)).toEqual(full);
  });

  it("a bound tag follows its source and rejects direct writes", () => {
    const tags = new TagStore();
    const ids = signal<string[]>(["1"]);
    const unbind = tags.bind(
      running,
      computed(() => ({ block: ids.value }))
    );
    expect(tags.$of("block", "1").value.has(running)).toBe(true);
    ids.value = ["2"];
    expect(tags.$of("block", "1").value.has(running)).toBe(false);
    expect(tags.$of("block", "2").value.has(running)).toBe(true);
    expect(() => tags.add(running, { block: ["3"] })).toThrow(/bound/);
    expect(() =>
      tags.bind(
        running,
        computed(() => ({}))
      )
    ).toThrow(/bound/);
    unbind();
    expect(tags.membersOf(running).size).toBe(0);
    tags.add(running, { block: ["3"] });
    expect(tags.$of("block", "3").value.has(running)).toBe(true);
  });

  it("root tags are a set of graph-wide tags", () => {
    const tags = new TagStore();
    const focus = defineTag("focus");
    tags.setRoot(focus, true);
    expect(tags.$root.value.has(focus)).toBe(true);
    const before = tags.$root.value;
    tags.setRoot(focus, true);
    expect(tags.$root.value).toBe(before);
    tags.setRoot(focus, false);
    expect(tags.$root.value.size).toBe(0);
  });

  it("dispose unbinds every bound tag", () => {
    const tags = new TagStore();
    const ids = signal<string[]>(["1"]);
    tags.bind(
      running,
      computed(() => ({ block: ids.value }))
    );
    tags.dispose();
    ids.value = ["2"];
    expect(tags.membersOf(running).size).toBe(0);
  });

  it("every graph owns a tag store", () => {
    const graph = new Graph({});
    expect(graph.scene.tags).toBeInstanceOf(TagStore);
  });

  it("releases an entity's signal after its last subscriber and reads current tags afterwards", () => {
    const tags = new TagStore();
    const first = tags.$of("block", "1");
    const sizes: number[] = [];
    const stop = effect(() => {
      sizes.push(first.value.size);
    });
    stop();
    expect(tags.$of("block", "1")).not.toBe(first);
    tags.add(running, { block: ["1"] });
    expect(tags.peekOf("block", "1").has(running)).toBe(true);
    expect(tags.$of("block", "1").value.has(running)).toBe(true);
  });

  describe("a holder that subscribes again to a released signal (React StrictMode, <Activity>)", () => {
    it("keeps receiving tag changes, and the store hands that signal out again", () => {
      const tags = new TagStore();
      const held = tags.$of("block", "1");
      // Subscribe, unsubscribe (the store releases it), subscribe again: the same object, no new $of call.
      held.subscribe(() => undefined)();
      const seen: boolean[] = [];
      const stop = effect(() => {
        seen.push(held.value.has(running));
      });
      tags.add(running, { block: ["1"] });
      expect(seen).toEqual([false, true]);
      expect(held.value.has(running)).toBe(true);
      expect(tags.$of("block", "1")).toBe(held);
      stop();
    });

    it("reads the tags written while it was released on its first read", () => {
      const tags = new TagStore();
      const held = tags.$of("block", "1");
      held.subscribe(() => undefined)();
      tags.add(running, { block: ["1"] });
      const seen: boolean[] = [];
      const stop = effect(() => {
        seen.push(held.value.has(running));
      });
      expect(seen).toEqual([true]);
      const derived = computed(() => held.value.size);
      const sizes: number[] = [];
      const stopSizes = effect(() => {
        sizes.push(derived.value);
      });
      tags.clear(running);
      expect([seen, sizes]).toEqual([
        [true, false],
        [1, 0],
      ]);
      stop();
      stopSizes();
    });

    it("keeps both current when $of made a new signal meanwhile, and hands out the one still watched", () => {
      const tags = new TagStore();
      const held = tags.$of("block", "1");
      held.subscribe(() => undefined)();
      const other = tags.$of("block", "1");
      expect(other).not.toBe(held);
      const stopOther = other.subscribe(() => undefined);
      const stopHeld = held.subscribe(() => undefined);
      tags.add(running, { block: ["1"] });
      expect([held.value.has(running), other.value.has(running)]).toEqual([true, true]);
      // The store's signal loses its last subscriber: the held one, still watched, takes its place.
      stopOther();
      expect(tags.$of("block", "1")).toBe(held);
      tags.delete(running, { block: ["1"] });
      expect(held.value.size).toBe(0);
      stopHeld();
      // Both released: a later call returns a new signal with the current tags.
      tags.add(running, { block: ["1"] });
      const next = tags.$of("block", "1");
      expect([next === held, next === other, next.value.has(running)]).toEqual([false, false, true]);
    });
  });
});
