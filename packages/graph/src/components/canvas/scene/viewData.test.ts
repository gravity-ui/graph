import type { TScenePrimitive } from "../../../lib/scene/types";

import { freezeView, samePrimitives, sameView } from "./viewData";

describe("sameView", () => {
  it("compares values by identity, and plain objects and arrays one level deep", () => {
    expect(sameView({ a: 1, meta: { x: 1 } }, { a: 1, meta: { x: 1 } })).toBe(true);
    expect(sameView({ list: [1, 2] }, { list: [1, 2] })).toBe(true);
    expect(sameView({ meta: { x: { y: 1 } } }, { meta: { x: { y: 1 } } })).toBe(false);
    expect(sameView({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameView({ a: undefined }, { b: undefined })).toBe(false);
    class Point {
      constructor(public x: number) {}
    }
    expect(sameView({ p: new Point(1) }, { p: new Point(1) })).toBe(false);
  });

  it("compares primitive lists by value down to stroke sizes, typed arrays and paths by identity", () => {
    const rect = (width: number, px = 3): TScenePrimitive => ({
      kind: "rect",
      x: 0,
      y: 0,
      width,
      height: 1,
      radius: [1, 2, 3, 4],
      border: { width: { px, maxWorld: 10 }, dash: [4, 4] },
    });
    expect(samePrimitives([rect(1)], [rect(1)])).toBe(true);
    expect(samePrimitives([rect(1)], [rect(1), rect(1)])).toBe(false);
    expect(samePrimitives([rect(1)], [rect(2)])).toBe(false);
    expect(samePrimitives([rect(1)], [rect(1, 4)])).toBe(false);
    const path = (segments: Float32Array): TScenePrimitive => ({ kind: "path", segments, stroke: { width: 1 } });
    const segments = new Float32Array(8);
    expect(samePrimitives([path(segments)], [path(segments)])).toBe(true);
    expect(samePrimitives([path(segments)], [path(new Float32Array(8))])).toBe(false);
  });

  it("compares keys in any order, null-prototype objects by entries, and holes as undefined", () => {
    expect(sameView({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    const bare = (entries: Record<string, unknown>): object => Object.assign(Object.create(null) as object, entries);
    expect(sameView(bare({ a: 1 }), bare({ a: 1 }))).toBe(true);
    expect(sameView(bare({ a: 1 }), bare({ a: 2 }))).toBe(false);
    expect(sameView({ a: 1, b: undefined }, { a: 1 })).toBe(false);
    expect(sameView({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    // eslint-disable-next-line no-sparse-arrays
    expect(sameView({ list: [, 1] }, { list: [2, 1] })).toBe(false);
    expect(sameView({ n: Number.NaN, z: 0 }, { n: Number.NaN, z: 0 })).toBe(true);
    expect(sameView({ z: 0 }, { z: -0 })).toBe(false);
  });

  it("ignores enumerable keys inherited from the prototype chain, as Object.keys does", () => {
    const proto = { inherited: 1 };
    const withProto = Object.assign(Object.create(proto) as Record<string, unknown>, { a: 1 });
    // Not plain objects (their prototype is not Object.prototype): compared by identity only.
    expect(sameView({ v: withProto }, { v: withProto })).toBe(true);
    expect(sameView({ v: withProto }, { v: { a: 1 } })).toBe(false);
  });

  it("freezes the top level in development builds", () => {
    const view = freezeView({ meta: { x: 1 } });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.meta)).toBe(false);
  });
});
