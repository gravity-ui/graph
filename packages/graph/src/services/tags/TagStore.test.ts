import { computed, effect, signal } from "@preact/signals-core";

import { Graph } from "../../graph";

import { TagStore } from "./TagStore";
import { defineTag } from "./defineTag";

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
});
