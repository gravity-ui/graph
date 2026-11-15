// packages/graph/src/lib/scene/webgl/depth.test.ts
import { SCENE_DEPTH, SceneDepth, depthOf, maxSubBitsFor, subBitsFor } from "./depth";

describe("SceneDepth", () => {
  it("orders by zIndex band, then by order", () => {
    const depth = new SceneDepth();
    depth.set("block", 200, 1);
    depth.set("line", 100, 2);
    depth.set("block2", 200, 3);
    expect(depth.keyOf("line")).toBeLessThan(depth.keyOf("block"));
    expect(depth.keyOf("block")).toBeLessThan(depth.keyOf("block2"));
  });

  it("moves an element between bands and renumbers only what changed", () => {
    const depth = new SceneDepth();
    depth.set("a", 200, 1);
    depth.set("b", 200, 2);
    depth.set("line", 100, 3);
    depth.takeChanged();
    depth.set("a", 50, 1); // lowered under the connections: a new lowest band
    expect(depth.keyOf("a")).toBeLessThan(depth.keyOf("line"));
    // Keys are dense over all bands: a moves from 1 to 0 and line from 0 to 1; b keeps key 2.
    expect(new Set(depth.takeChanged())).toEqual(new Set(["a", "line"]));
    expect(["a", "line", "b"].map((id) => depth.keyOf(id))).toEqual([0, 1, 2]);
  });

  it("raises to the end of the band", () => {
    const depth = new SceneDepth();
    depth.set("a", 200, 1);
    depth.set("b", 200, 2);
    depth.set("a", 200, 3);
    expect(depth.keyOf("a")).toBeGreaterThan(depth.keyOf("b"));
  });

  it("throws past 16 bands", () => {
    const depth = new SceneDepth();
    for (let z = 0; z < 16; z++) depth.set(`e${z}`, z, z);
    expect(() => depth.set("e16", 16, 16)).toThrow(RangeError);
  });
});

describe("SceneDepth atomicity and bulk load", () => {
  it("leaves the previous key unchanged when a set fails", () => {
    const depth = new SceneDepth();
    for (let z = 0; z < 16; z++) depth.set(`e${z}`, z, z);
    depth.set("x", 3, 100);
    const before = depth.keyOf("x");
    expect(() => depth.set("x", 99, 101)).toThrow(RangeError);
    expect(depth.keyOf("x")).toBe(before);
    depth.set("y", 3, 102);
    expect(depth.keyOf("y")).toBeGreaterThan(depth.keyOf("x"));
  });

  it("loads 20000 elements across 3 bands", () => {
    const depth = new SceneDepth();
    for (let i = 0; i < 20000; i++) depth.set(`e${i}`, 100 + (i % 3), i);
    expect(depth.takeChanged()).toHaveLength(20000);
    expect(depth.keyOf("e0")).toBeLessThan(depth.keyOf("e1"));
  });

  it("lists the elements whose own zIndex or order was set, not the ones a renumbering moved", () => {
    const depth = new SceneDepth();
    depth.set("a", 200, 1);
    depth.set("b", 200, 2);
    depth.set("c", 200, 3);
    expect(depth.takeSet().sort()).toEqual(["a", "b", "c"]);
    depth.takeChanged();
    depth.set("a", 200, 4); // a raise: b and c move up a rank
    expect(new Set(depth.takeChanged())).toEqual(new Set(["a", "b", "c"]));
    expect(depth.takeSet()).toEqual(["a"]);
    expect(depth.takeSet()).toEqual([]);
    depth.set("d", 200, 5);
    depth.delete("d");
    expect(depth.takeSet()).toEqual([]);
  });
});

describe("SceneDepth batching", () => {
  it("records changes in O(1) and rebuilds a changed band once per renumber", () => {
    const depth = new SceneDepth();
    const rebuild = jest.spyOn(depth as unknown as { rebuildBand(zIndex: number): void }, "rebuildBand");
    for (let i = 0; i < 10000; i++) depth.set(`e${i}`, 200, i);
    for (let i = 0; i < 10000; i += 2) depth.set(`e${i}`, 200, 10000 + i); // raise every other one
    expect(depth.peekKey("e0")).toBe(0);
    expect(rebuild).not.toHaveBeenCalled();
    expect(depth.takeChanged()).toHaveLength(10000);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(depth.keyOf("e0")).toBeGreaterThan(depth.keyOf("e9999"));
    expect(depth.keyOf("e1")).toBe(0);
    expect(depth.peekKey("e0")).toBe(depth.keyOf("e0"));
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("keeps a released element's key, so setting it back to its place changes nothing", () => {
    const depth = new SceneDepth();
    depth.set("a", 200, 1);
    depth.set("b", 200, 2);
    depth.takeChanged();
    const key = depth.keyOf("b");
    depth.release("b");
    expect(depth.peekKey("b")).toBe(key);
    depth.set("b", 200, 2);
    expect(depth.takeChanged()).toEqual([]);
    expect(depth.keyOf("b")).toBe(key);
    depth.release("b");
    depth.delete("b");
    expect(() => depth.keyOf("b")).toThrow();
  });

  it("renumbers only the changed bands while the set of bands stays", () => {
    const depth = new SceneDepth();
    depth.set("line", 100, 1);
    depth.set("a", 200, 2);
    depth.set("b", 200, 3);
    depth.takeChanged();
    depth.set("a", 200, 4);
    expect(new Set(depth.takeChanged())).toEqual(new Set(["a", "b"]));
  });
});

describe("SceneDepth keys and sub-order width", () => {
  it("keys owners densely over all bands, so a band's size moves only the bands above it", () => {
    const depth = new SceneDepth();
    depth.set("group", 50, 1);
    depth.set("line", 100, 2);
    depth.set("a", 200, 3);
    depth.set("b", 200, 4);
    depth.takeChanged();
    expect(["group", "line", "a", "b"].map((id) => depth.keyOf(id))).toEqual([0, 1, 2, 3]);
    depth.set("line2", 100, 5);
    expect(new Set(depth.takeChanged())).toEqual(new Set(["line2", "a", "b"]));
    expect(["group", "line", "line2", "a", "b"].map((id) => depth.keyOf(id))).toEqual([0, 1, 2, 3, 4]);
    depth.delete("group");
    expect(new Set(depth.takeChanged())).toEqual(new Set(["line", "line2", "a", "b"]));
    expect(["line", "line2", "a", "b"].map((id) => depth.keyOf(id))).toEqual([0, 1, 2, 3]);
  });

  it("grows the width from 5 to 7 bits when a root reaches 100 primitives, and keeps the keys dense", () => {
    const depth = new SceneDepth();
    depth.set("line", 100, 1);
    depth.set("a", 200, 2);
    depth.set("b", 200, 3);
    for (const id of ["line", "a", "b"]) depth.setSubCount(id, 5);
    depth.takeChanged();
    expect(depth.subBits).toBe(5);
    depth.setSubCount("a", 100);
    // A width change moves no key: the shader's multiplier changes, not the keys.
    expect(depth.takeChanged()).toEqual([]);
    expect(depth.subBits).toBe(7);
    expect(["line", "a", "b"].map((id) => depth.keyOf(id))).toEqual([0, 1, 2]);
    depth.setSubCount("b", 128);
    depth.takeChanged();
    expect(depth.subBits).toBe(7);
    depth.setSubCount("b", 129);
    depth.takeChanged();
    expect(depth.subBits).toBe(8);
    // It follows the widest root down again once the wide ones shrink or leave.
    depth.delete("b");
    depth.setSubCount("a", 32);
    depth.takeChanged();
    expect(depth.subBits).toBe(5);
    expect(["line", "a"].map((id) => depth.keyOf(id))).toEqual([0, 1]);
  });

  it("computes one width for a frame that both grows a root and adds roots", () => {
    const depth = new SceneDepth();
    const compute = jest.spyOn(depth as unknown as { computeWidth(): number }, "computeWidth");
    depth.set("a", 200, 1);
    depth.setSubCount("a", 5);
    depth.takeChanged();
    compute.mockClear();
    depth.setSubCount("a", 100);
    for (let i = 0; i < 10; i++) {
      depth.set(`n${i}`, 200, 10 + i);
      depth.setSubCount(`n${i}`, 40);
    }
    expect(compute).not.toHaveBeenCalled();
    expect(depth.takeChanged()).toHaveLength(10);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(depth.subBits).toBe(7);
    depth.keyOf("n9");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("throws, naming the widest root, once the owners times the width exceed the depth index space", () => {
    const depth = new SceneDepth();
    // 2^16 + 1 primitives need 17 bits: 64 keys x 2^17 fill the 2^23 depth indices.
    depth.set("big", 200, 0);
    depth.setSubCount("big", 2 ** 16 + 1);
    for (let i = 0; i < 63; i++) depth.set(`k${i}`, 200, i + 1);
    expect(depth.maxSub).toBe(2 ** 17 - 1);
    expect(() => depth.takeChanged()).not.toThrow();
    expect(depth.subBits).toBe(17);
    depth.set("k63", 200, 100);
    expect(depth.maxSub).toBe(2 ** 16 - 1);
    expect(() => depth.takeChanged()).toThrow(RangeError);
    expect(() => depth.keyOf("k63")).toThrow(/big has 65537 primitives/);
    depth.delete("k63");
    // maxSub follows the owner count down again, and a release counts as one owner fewer.
    expect(depth.maxSub).toBe(2 ** 17 - 1);
    expect(() => depth.takeChanged()).not.toThrow();
    depth.set("k63", 200, 100);
    expect(depth.maxSub).toBe(2 ** 16 - 1);
    depth.release("k63");
    expect(depth.maxSub).toBe(2 ** 17 - 1);
  });

  it("sizes the width by the widest root and the room by the number of keys", () => {
    expect([1, 32, 33, 64, 65, 100, 128, 129].map(subBitsFor)).toEqual([5, 5, 6, 6, 7, 7, 7, 8]);
    expect(maxSubBitsFor(0)).toBe(SCENE_DEPTH.INDEX_BITS);
    expect(maxSubBitsFor(1)).toBe(23);
    expect(maxSubBitsFor(2 ** 18)).toBe(5);
    expect(maxSubBitsFor(2 ** 18 + 1)).toBe(4);
    expect(maxSubBitsFor(1000)).toBe(13);
  });
});

describe("depthOf", () => {
  it("is strictly increasing in key and sub and stays below 1", () => {
    expect(depthOf(0, 1)).toBeGreaterThan(depthOf(0, 0));
    expect(depthOf(1, 0)).toBeGreaterThan(depthOf(0, 31));
    expect(depthOf(2 ** 18 - 1, 31)).toBeLessThan(1);
  });

  it("takes the sub-order width: 2^subBits subs per key", () => {
    expect(depthOf(1, 0, 7)).toBeGreaterThan(depthOf(0, 127, 7));
    expect(depthOf(1, 0, 7)).toBe(depthOf(0, 128, 7));
    expect(depthOf(2 ** 16 - 1, 127, 7)).toBeLessThan(1);
  });
});
