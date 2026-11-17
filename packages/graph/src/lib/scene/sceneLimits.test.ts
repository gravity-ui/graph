import { SceneStore } from "./SceneStore";
import { watchSceneLimits } from "./sceneLimits";
import type { TScenePrimitive } from "./types";

const rect = (part?: string): TScenePrimitive => ({ kind: "rect", x: 0, y: 0, width: 1, height: 1, part });
const rects = (count: number, part?: string): TScenePrimitive[] => Array.from({ length: count }, () => rect(part));
const element = (id: string, zIndex: number, primitives: TScenePrimitive[] = [], parent?: string) => ({
  id,
  zIndex,
  x: 0,
  y: 0,
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  primitives,
  parent,
});

describe("watchSceneLimits", () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
  });

  const messages = (): string[] => error.mock.calls.map(([message]) => String(message));

  it("names each exceeded limit once in development builds", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    store.add(
      element(
        "parts",
        1,
        Array.from({ length: 16 }, (_, i) => rect(`p${i}`))
      )
    );
    // 33 primitives with its child: a wider sub-order, no limit.
    store.add(element("big", 1, rects(30, "p0")));
    store.add(element("kid", 0, rects(3, "p0"), "big"));
    for (let z = 0; z < 17; z++) store.add(element(`z${z}`, 1000 + z));
    store.add(
      element(
        "parts2",
        1,
        Array.from({ length: 17 }, (_, i) => rect(`q${i}`))
      )
    );
    expect(messages()).toHaveLength(2);
    expect(messages()[0]).toContain("16 distinct parts; the limit is 15");
    expect(messages()[1]).toContain("zIndex bands, raised buckets included; the limit is 16");
    stop();
  });

  it("reports nothing for 20000 owners in one band while the shared depth budget fits", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    for (let i = 0; i < 20000; i++) store.add(element(`line${i}`, 100, [rect()]));
    expect(messages()).toEqual([]);
    stop();
  });

  it("reports nothing for a block with 40 anchors", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    store.add(element("block", 200, rects(5, "body")));
    for (let i = 0; i < 40; i++) store.add(element(`anchor${i}`, 0, [rect("anchor"), rect("border")], "block"));
    for (let i = 0; i < 1000; i++) store.add(element(`other${i}`, 200, rects(5, "body")));
    expect(messages()).toEqual([]);
    stop();
  });

  it("reports a key space overflow once, naming the root with the most primitives", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    // 4097 primitives with its children need 2^13 sub-orders: 1024 owners fill the 2^23 depth indices.
    store.add(element("wide", 200, rects(97)));
    for (let i = 0; i < 40; i++) store.add(element(`kid${i}`, 0, rects(100), "wide"));
    store.add(element("narrow", 200, rects(5)));
    for (let i = 0; i < 1022; i++) store.add(element(`r${i}`, 200));
    // 1024 owners x 2^13 is exactly 2^23.
    expect(messages()).toEqual([]);
    // A child that grows "narrow" past "wide" makes it the widest root, at the same width.
    store.add(element("narrow-kid", 0, rects(4500), "narrow"));
    expect(messages()).toEqual([]);
    store.add(element("r1022", 200));
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("Scene element narrow has 4505 primitives with its child elements");
    expect(messages()[0]).toContain("1025 owner elements");
    expect(messages()[0]).toContain("8388608 depth indices");
    store.add(element("r1023", 200));
    expect(messages()).toHaveLength(1);
    stop();
  });

  it("counts the part names only styles name, as the WebGL style table allocates their slots", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    const names = (prefix: string, count: number): Record<string, { color: string }> =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, { color: "#000" }]));
    store.add(element("one", 200, [rect("body")]));
    // 1 primitive part, 14 in the state rules of a row: 15, no limit.
    store.defineStyle({ parts: names("s", 14) });
    expect(messages()).toEqual([]);
    // One more, in the base rules of another row (the slot "none" is not a part).
    store.defineStyle({ base: { ...names("b", 1), none: { color: "#000" } } });
    expect(messages()).toEqual([
      "The scene has 16 distinct parts; the limit is 15 (the WebGL renderer falls back to Canvas2D)",
    ]);
    stop();
  });

  it("counts the part names of styles defined before it watches", () => {
    const store = new SceneStore();
    store.defineStyle({
      parts: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`p${i}`, { visible: false }])),
    });
    const stop = watchSceneLimits(store);
    expect(messages()).toEqual([
      "The scene has 16 distinct parts; the limit is 15 (the WebGL renderer falls back to Canvas2D)",
    ]);
    stop();
  });

  it("follows deletes and shrinking roots: the room comes back", () => {
    const store = new SceneStore();
    const stop = watchSceneLimits(store);
    // 1024 owners at 2^13 sub-orders: full.
    store.add(element("wide", 200, rects(5000)));
    for (let i = 0; i < 1023; i++) store.add(element(`r${i}`, 200));
    store.update("wide", { primitives: rects(5) });
    store.add(element("r1023", 200));
    store.delete("r1023");
    // r0 needs 2^13 while its child lives, then 2^5 again.
    store.add(element("kid", 0, rects(4097), "r0"));
    store.delete("kid");
    store.add(element("r1024", 200));
    store.add(element("r1025", 200));
    expect(messages()).toEqual([]);
    stop();
  });
});
