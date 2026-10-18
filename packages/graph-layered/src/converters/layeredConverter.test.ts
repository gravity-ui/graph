import type { ConverterResult, LayeredLayoutConnection } from "../types";

import { layeredConverter } from "./layeredConverter";
import type { LayeredLayoutResult } from "./layeredConverter";

const blockSizes = new Map([
  ["a", { width: 100, height: 40 }],
  ["b", { width: 80, height: 20 }],
]);

function convert(
  layoutResult: LayeredLayoutResult,
  connections: LayeredLayoutConnection[],
  virtualNodeSize?: number
): ConverterResult {
  return layeredConverter({ layoutResult, connections, blockSizes, virtualNodeSize });
}

const twoBlocks: LayeredLayoutResult = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 300, y: 0 },
  ],
  edges: [{ from: "a", to: "b" }],
};

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
      [{ id: "edge-1", sourceBlockId: "a", targetBlockId: "b" }]
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
      [{ id: "long", sourceBlockId: "a", targetBlockId: "b" }],
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

    const result = convert(layoutResult, [
      { id: "first", sourceBlockId: "a", targetBlockId: "b" },
      { id: "second", sourceBlockId: "a", targetBlockId: "b" },
    ]);

    expect(result.edges.first.points).toHaveLength(2);
    expect(result.edges.second.points).toHaveLength(3);
  });

  it("falls back to the source/target key when a connection has no id", () => {
    const result = convert(twoBlocks, [{ sourceBlockId: "a", targetBlockId: "b" }]);

    expect(Object.keys(result.edges)).toEqual(["a/b"]);
  });

  it("matches numeric block ids and keeps numeric connection ids", () => {
    const result = layeredConverter({
      layoutResult: {
        nodes: [
          { id: "1", x: 0, y: 0 },
          { id: "2", x: 300, y: 0 },
        ],
        edges: [{ from: "1", to: "2" }],
      },
      connections: [{ id: 7, sourceBlockId: 1, targetBlockId: 2 }],
      blockSizes: new Map([["1", { width: 100, height: 40 }]]),
    });

    expect(result.edges[7].points?.[0]).toEqual({ x: 100, y: 20 });
  });

  it("does not confuse ids that contain the key separator", () => {
    const result = layeredConverter({
      layoutResult: {
        nodes: [
          { id: "a/b", x: 0, y: 0 },
          { id: "c", x: 300, y: 0 },
          { id: "a", x: 0, y: 200 },
          { id: "b/c", x: 300, y: 200 },
        ],
        edges: [
          { from: "a/b", to: "c" },
          { from: "a", to: "b/c" },
        ],
      },
      // Listed in the opposite order of the edges: a flat "source/target" key ("a/b/c" for both) would swap the ids.
      connections: [
        { id: "second", sourceBlockId: "a", targetBlockId: "b/c" },
        { id: "first", sourceBlockId: "a/b", targetBlockId: "c" },
      ],
      blockSizes: new Map(),
    });

    expect(result.edges.first.points).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ]);
    expect(result.edges.second.points).toEqual([
      { x: 0, y: 200 },
      { x: 300, y: 200 },
    ]);
  });

  it("omits port-only connections from the result", () => {
    const result = convert(twoBlocks, [
      { id: "ports", sourceBlockId: undefined, targetBlockId: undefined },
      { id: "blocks", sourceBlockId: "a", targetBlockId: "b" },
    ]);

    expect(Object.keys(result.edges)).toEqual(["blocks"]);
  });
});
