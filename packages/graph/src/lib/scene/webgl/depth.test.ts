// packages/graph/src/lib/scene/webgl/depth.test.ts
import { SceneDepth, depthOf } from "./depth";

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
    expect(new Set(depth.takeChanged())).toEqual(new Set(["a", "b", "line"]));
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
});

describe("depthOf", () => {
  it("is strictly increasing in key and sub and stays below 1", () => {
    expect(depthOf(0, 1)).toBeGreaterThan(depthOf(0, 0));
    expect(depthOf(1, 0)).toBeGreaterThan(depthOf(0, 31));
    expect(depthOf(2 ** 18 - 1, 31)).toBeLessThan(1);
  });
});
