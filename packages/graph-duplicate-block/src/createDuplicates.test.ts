import { createAnchorPortId, createBlockPointPortId } from "@gravity-ui/graph";
import type { TBlock, TConnection, TMultipointConnection, TPoint } from "@gravity-ui/graph";

import { createDuplicateConnectionId, createDuplicates } from "./createDuplicates";
import type { TCreateDuplicatesParams } from "./createDuplicates";

function block(id: string, overrides: Partial<TBlock> = {}): TBlock {
  return { id, is: "Block", x: 0, y: 0, width: 100, height: 50, name: id, anchors: [], ...overrides };
}

function anchoredBlock(id: string): TBlock {
  return block(id, {
    anchors: [
      { id: "out", blockId: id, type: "OUT" },
      { id: "in", blockId: id, type: "IN" },
    ],
  });
}

const delta = { x: 10, y: 20 };

/** Places each copy at its source position shifted by `delta`. */
function shifted(...blocks: TBlock[]): Array<{ block: TBlock; coord: TPoint }> {
  return blocks.map((source) => ({ block: source, coord: { x: source.x + delta.x, y: source.y + delta.y } }));
}

function duplicate(blocks: TBlock[], connections: TMultipointConnection[] = []): ReturnType<typeof createDuplicates> {
  const params: TCreateDuplicatesParams = {
    blocks: shifted(...blocks),
    connections,
    delta,
    createId: (source) => `${source.id}-copy`,
    createConnectionId: (connection) => `${String(connection.id)}-copy`,
  };
  return createDuplicates(params);
}

describe("createDuplicates", () => {
  describe("blocks", () => {
    it("keeps the source block type and data, moves the copy and drops selection", () => {
      const source = block("a", { is: "CustomBlock", x: 5, y: 7, selected: true, meta: { color: "red" } });

      const { blocks } = duplicate([source]);

      expect(blocks).toEqual([
        {
          id: "a-copy",
          is: "CustomBlock",
          x: 15,
          y: 27,
          width: 100,
          height: 50,
          name: "a",
          anchors: [],
          meta: { color: "red" },
        },
      ]);
    });

    it("places each copy at the given coordinates", () => {
      const { blocks } = createDuplicates({
        blocks: [{ block: block("a", { x: 5, y: 7 }), coord: { x: 100, y: 200 } }],
        connections: [],
        delta,
        createId: () => "copy",
        createConnectionId: () => "connection-copy",
      });

      expect(blocks[0]).toMatchObject({ x: 100, y: 200 });
    });
  });

  describe("block-based connections", () => {
    it("are not copied when a single block is duplicated", () => {
      const result = duplicate([block("a")], [{ id: "loop", sourceBlockId: "a", targetBlockId: "a" }]);

      expect(result.connections).toEqual([]);
    });

    it("copy a block-to-block connection between duplicated blocks with all its fields", () => {
      const connections: Array<TConnection & { meta?: unknown }> = [
        {
          id: "inner",
          sourceBlockId: "a",
          targetBlockId: "b",
          selected: true,
          label: "edge",
          dashed: true,
          styles: { background: "red" },
          meta: { weight: 3 },
        },
        { id: "outer", sourceBlockId: "a", targetBlockId: "c" },
      ];

      const result = duplicate([block("a"), block("b")], connections);

      expect(result.connections).toEqual([
        {
          id: "inner-copy",
          sourceBlockId: "a-copy",
          targetBlockId: "b-copy",
          label: "edge",
          dashed: true,
          styles: { background: "red" },
          meta: { weight: 3 },
        },
      ]);
    });

    it("keep the anchor IDs of an anchor-to-anchor connection", () => {
      const connection: TConnection = {
        id: "anchored",
        sourceBlockId: "a",
        sourceAnchorId: "out",
        targetBlockId: "b",
        targetAnchorId: "in",
      };

      const result = duplicate([anchoredBlock("a"), anchoredBlock("b")], [connection]);

      expect(result.connections).toEqual([
        {
          id: "anchored-copy",
          sourceBlockId: "a-copy",
          sourceAnchorId: "out",
          targetBlockId: "b-copy",
          targetAnchorId: "in",
        },
      ]);
    });

    it("match numeric and string block IDs", () => {
      const result = duplicate(
        [block("1", { id: 1 }), block("2")],
        [{ id: "numeric", sourceBlockId: 1, targetBlockId: "2" }]
      );

      expect(result.connections).toMatchObject([{ sourceBlockId: "1-copy", targetBlockId: "2-copy" }]);
    });
  });

  describe("port-based connections", () => {
    it("remap anchor ports and block point ports of duplicated blocks", () => {
      const connections: TConnection[] = [
        { id: "anchors", sourcePortId: createAnchorPortId("a", "out"), targetPortId: createAnchorPortId("b", "in") },
        {
          id: "points",
          sourcePortId: createBlockPointPortId("a", false),
          targetPortId: createBlockPointPortId("b", true),
        },
      ];

      const result = duplicate([anchoredBlock("a"), anchoredBlock("b")], connections);

      expect(result.connections).toEqual([
        {
          id: "anchors-copy",
          sourcePortId: createAnchorPortId("a-copy", "out"),
          targetPortId: createAnchorPortId("b-copy", "in"),
        },
        {
          id: "points-copy",
          sourcePortId: createBlockPointPortId("a-copy", false),
          targetPortId: createBlockPointPortId("b-copy", true),
        },
      ]);
    });

    it("skip custom ports and ports of blocks that are not duplicated", () => {
      const connections: TConnection[] = [
        { id: "custom", sourcePortId: "custom-port", targetPortId: createAnchorPortId("b", "in") },
        { id: "outer", sourcePortId: createAnchorPortId("a", "out"), targetPortId: createAnchorPortId("c", "in") },
        {
          id: "unknown-anchor",
          sourcePortId: createAnchorPortId("a", "missing"),
          targetPortId: createAnchorPortId("b", "in"),
        },
      ];

      const result = duplicate([anchoredBlock("a"), anchoredBlock("b")], connections);

      expect(result.connections).toEqual([]);
    });
  });

  describe("mixed connections", () => {
    it("follow the port when an end has both a derived port and a block ID", () => {
      const connection: TConnection = {
        id: "mixed",
        sourceBlockId: "stale",
        sourcePortId: createAnchorPortId("a", "out"),
        targetBlockId: "b",
        targetAnchorId: "in",
      };

      const [copy] = duplicate([anchoredBlock("a"), anchoredBlock("b")], [connection]).connections;

      expect(copy).toEqual({
        id: "mixed-copy",
        sourcePortId: createAnchorPortId("a-copy", "out"),
        targetBlockId: "b-copy",
        targetAnchorId: "in",
      });
    });

    it("are skipped when an end uses a custom port, even next to a duplicated block ID", () => {
      const connection: TConnection = {
        id: "custom",
        sourceBlockId: "a",
        sourcePortId: "custom-port",
        targetBlockId: "b",
      };

      expect(duplicate([block("a"), block("b")], [connection]).connections).toEqual([]);
    });
  });

  it("requests IDs only for the connections it copies", () => {
    const createConnectionId = jest.fn((connection: TConnection) => `${String(connection.id)}-copy`);

    createDuplicates({
      blocks: shifted(block("a"), block("b")),
      connections: [
        { id: "inner", sourceBlockId: "a", targetBlockId: "b" },
        { id: "outer", sourceBlockId: "a", targetBlockId: "c" },
      ],
      delta,
      createId: (source) => `${source.id}-copy`,
      createConnectionId,
    });

    expect(createConnectionId.mock.calls.map(([connection]) => connection.id)).toEqual(["inner"]);
  });

  it("shifts route points and positioned labels of copied connections", () => {
    const connection: TMultipointConnection = {
      id: "route",
      sourceBlockId: "a",
      targetBlockId: "b",
      points: [{ x: 1, y: 2 }],
      labels: [{ x: 3, y: 4, text: "positioned" }, { text: "floating" }],
    };

    const [copy] = duplicate([block("a"), block("b")], [connection]).connections;

    expect(copy).toMatchObject({
      points: [{ x: 11, y: 22 }],
      labels: [{ x: 13, y: 24, text: "positioned" }, { text: "floating" }],
    });
  });

  it("gives every copied connection its own ID, so repeated duplication of an anchor pair does not collide", () => {
    const connection: TConnection = {
      id: "out:in",
      sourceBlockId: "a",
      sourceAnchorId: "out",
      targetBlockId: "b",
      targetAnchorId: "in",
    };
    const params = {
      blocks: shifted(anchoredBlock("a"), anchoredBlock("b")),
      connections: [connection],
      delta,
      createId: (source: TBlock) => `${source.id}-copy`,
      createConnectionId: createDuplicateConnectionId,
    };

    const first = createDuplicates(params).connections[0];
    const second = createDuplicates(params).connections[0];

    expect(first.id).toEqual(expect.any(String));
    expect(first.id).not.toBe(connection.id);
    expect(second.id).not.toBe(first.id);
  });
});
