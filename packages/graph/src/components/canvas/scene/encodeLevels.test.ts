import type { TScenePrimitive } from "../../../lib/scene/types";

import { encodeLevels } from "./encodeLevels";

const rect = (fill: string): TScenePrimitive => ({ kind: "rect", x: 0, y: 0, width: 1, height: 1, fill });
const fillOf = (primitive: TScenePrimitive): string => (primitive.kind === "rect" ? primitive.fill ?? "" : "");

describe("encodeLevels", () => {
  it("returns no primitives without level methods", () => {
    expect(encodeLevels({}, {})).toEqual([]);
  });

  it("uses the schematic primitives, as they are, on every level without its own method", () => {
    const body = rect("body");
    const out = encodeLevels({ schematic: () => [body] }, {});
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(body);
  });

  it("masks primitives by the methods that returned them", () => {
    const out = encodeLevels(
      { minimalistic: () => [rect("m")], schematic: () => [rect("s")], detailed: () => [rect("d")] },
      {}
    );
    const maskOf = (fill: string): number | undefined => out.find((p) => fillOf(p) === fill)?.levelMask;
    expect([maskOf("m"), maskOf("s"), maskOf("d")]).toEqual([1, 2, 4]);
  });

  it("encodes a primitive that levels share once and keeps each level's order", () => {
    const body = rect("body");
    const title = rect("title");
    const badge = rect("badge");
    const out = encodeLevels({ minimalistic: () => [body, title], schematic: () => [body, badge, title] }, {});
    expect(out.map(fillOf)).toEqual(["body", "badge", "title"]);
    expect(out[0]).toBe(body);
    expect(out[1].levelMask).toBe(6);
    expect(out[2]).toBe(title);
  });

  it("encodes one list returned by several levels once", () => {
    const list = [rect("a"), rect("b")];
    const detailed = [list[0]];
    const out = encodeLevels({ minimalistic: () => list, schematic: () => list, detailed: () => detailed }, {});
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["a", undefined],
      ["b", 3],
    ]);
  });

  it("encodes once a primitive that two levels return as equal copies", () => {
    // A level method that calls another one that returns fresh lists, as a subclass's detailed may call its schematic.
    const schematic = (): TScenePrimitive[] => [rect("body"), rect("title")];
    const out = encodeLevels({ minimalistic: () => schematic(), schematic, detailed: () => [rect("body")] }, {});
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["body", undefined],
      ["title", 3],
    ]);
  });

  it("keeps a primitive twice when two levels order it differently", () => {
    const a = rect("a");
    const b = rect("b");
    const out = encodeLevels({ minimalistic: () => [a, b], schematic: () => [b, a] }, {});
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["a", 1],
      ["b", undefined],
      ["a", 6],
    ]);
  });

  it("returns one list shared by every level as a new array of the same primitives, without masks", () => {
    // Task 17f: a look shared by the levels (one list per view) is the common case; nothing is merged for it.
    const list = [rect("a"), { ...rect("b"), levelMask: 2 }, rect("c")];
    const shared = (): TScenePrimitive[] => list;
    const out = encodeLevels({ minimalistic: shared, schematic: shared, detailed: shared }, {});
    expect(out).not.toBe(list);
    expect(out[0]).toBe(list[0]);
    expect(out[2]).toBe(list[2]);
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["a", undefined],
      ["b", undefined],
      ["c", undefined],
    ]);
    // Equal to the merge of the same list given three times as different arrays.
    const merged = encodeLevels(
      { minimalistic: () => [...list], schematic: () => [...list], detailed: () => [...list] },
      {}
    );
    expect(merged).toEqual(out);
  });

  it("keeps the order and masks of two lists when the first one is merged into nothing", () => {
    const a = rect("a");
    const b = rect("b");
    const c = rect("c");
    const out = encodeLevels({ schematic: () => [a, b, c], detailed: () => [c, rect("d")] }, {});
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["a", 3],
      ["b", 3],
      ["c", undefined],
      ["d", 4],
    ]);
  });

  it("falls back to the minimalistic list without schematic, and to the detailed one without both", () => {
    const m = rect("m");
    const d = rect("d");
    const out = encodeLevels({ minimalistic: () => [m], detailed: () => [d] }, {});
    // No primitive in common: the later list's primitive is inserted at the merge cursor (levels 1 + 2, then 4).
    expect(out.map((p) => [fillOf(p), p.levelMask])).toEqual([
      ["d", 4],
      ["m", 3],
    ]);
    const only = encodeLevels({ detailed: () => [d] }, {});
    expect(only).toHaveLength(1);
    expect(only[0]).toBe(d);
  });

  it("calls each method once with the view", () => {
    const view = { n: 1 };
    const schematic = jest.fn((): TScenePrimitive[] => []);
    encodeLevels({ schematic }, view);
    expect(schematic).toHaveBeenCalledTimes(1);
    expect(schematic).toHaveBeenCalledWith(view);
  });

  it("reports and replaces a levelMask a level method set", () => {
    const report = jest.fn();
    const out = encodeLevels({ schematic: () => [{ ...rect("x"), levelMask: 1 }] }, {}, report);
    expect(report).toHaveBeenCalledWith("schematic");
    expect(out[0].levelMask).toBeUndefined();
  });
});
