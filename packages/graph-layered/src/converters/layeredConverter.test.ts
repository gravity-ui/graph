import { layeredConverter } from "./layeredConverter";
import type { LayeredLayoutResult } from "./layeredConverter";

const blockSizes = new Map([
  ["a", { width: 100, height: 40 }],
  ["b", { width: 80, height: 20 }],
]);

function convert(
  layoutResult: LayeredLayoutResult,
  ids: Record<string, (string | number)[]>,
  virtualNodeSize?: number
) {
  return layeredConverter({
    layoutResult,
    connectionIdBySourceTarget: new Map(Object.entries(ids)),
    blockSizes,
    virtualNodeSize,
  });
}

describe("layeredConverter", () => {
  it("returns block positions and connects the right middle of the source to the left middle of the target", () => {
    const result = convert(
      {
        nodes: [
          { id: "a", x: 0, y: 10 },
          { id: "b", x: 300, y: 50 },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      { "a/b": ["edge-1"] }
    );

    expect(result).toEqual({
      blocks: { a: { x: 0, y: 10 }, b: { x: 300, y: 50 } },
      edges: {
        "edge-1": {
          points: [
            { x: 100, y: 30 },
            { x: 300, y: 60 },
          ],
        },
      },
    });
  });

  it("routes an edge through the centers of its dummy nodes and omits them from blocks", () => {
    const result = convert(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "dummy-1", x: 200, y: 100, shape: "dot" },
          { id: "dummy-2", x: 400, y: 100, shape: "dot" },
          { id: "b", x: 600, y: 0 },
        ],
        edges: [
          { from: "a", to: "dummy-1", arrows: { to: false } },
          { from: "dummy-1", to: "dummy-2", arrows: { from: false, to: false } },
          { from: "dummy-2", to: "b", arrows: { from: false } },
        ],
      },
      { "a/b": ["long"] },
      20
    );

    expect(Object.keys(result.blocks)).toEqual(["a", "b"]);
    expect(result.edges).toEqual({
      long: {
        points: [
          { x: 100, y: 20 },
          { x: 210, y: 110 },
          { x: 410, y: 110 },
          { x: 600, y: 10 },
        ],
      },
    });
  });

  it("assigns parallel edges between the same blocks to connection ids in input order", () => {
    const layoutResult: LayeredLayoutResult = {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 300, y: 0 },
        { id: "dummy", x: 150, y: 200, shape: "dot" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "dummy" },
        { from: "dummy", to: "b" },
      ],
    };

    const result = convert(layoutResult, { "a/b": ["first", "second"] });

    expect(result.edges.first.points).toHaveLength(2);
    expect(result.edges.second.points).toHaveLength(3);
  });

  it("falls back to the source/target key when no connection id is known", () => {
    const result = convert(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 300, y: 0 },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      {}
    );

    expect(Object.keys(result.edges)).toEqual(["a/b"]);
  });
});
