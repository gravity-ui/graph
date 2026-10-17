import type { TBlock, TConnection, TMultipointConnection, TPoint } from "@gravity-ui/graph";

import { createDuplicates } from "./createDuplicates";

function block(id: string, overrides: Partial<TBlock> = {}): TBlock {
  return { id, is: "Block", x: 0, y: 0, width: 100, height: 50, name: id, anchors: [], ...overrides };
}

const createId = (source: TBlock): string => `${source.id}-copy`;
const delta = { x: 10, y: 20 };

/** Places each copy at its source position shifted by `delta`. */
function shifted(...blocks: TBlock[]): Array<{ block: TBlock; coord: TPoint }> {
  return blocks.map((source) => ({ block: source, coord: { x: source.x + delta.x, y: source.y + delta.y } }));
}

describe("createDuplicates", () => {
  it("keeps the source block type and data, moves the copy and drops selection", () => {
    const source = block("a", { is: "CustomBlock", x: 5, y: 7, selected: true, meta: { color: "red" } });

    const { blocks } = createDuplicates({ blocks: shifted(source), connections: [], delta, createId });

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
      createId,
    });

    expect(blocks[0]).toMatchObject({ x: 100, y: 200 });
  });

  it("does not copy connections when a single block is duplicated", () => {
    const connections: TConnection[] = [{ id: "loop", sourceBlockId: "a", targetBlockId: "a" }];

    const result = createDuplicates({ blocks: shifted(block("a")), connections, delta, createId });

    expect(result.connections).toEqual([]);
  });

  it("copies only connections whose both ends are duplicated, with all their fields", () => {
    const connections: Array<TConnection & { meta?: unknown }> = [
      {
        id: "inner",
        sourceBlockId: "a",
        targetBlockId: "b",
        sourceAnchorId: "out",
        targetAnchorId: "in",
        sourcePortId: "a/out",
        targetPortId: "b/in",
        selected: true,
        label: "edge",
        dashed: true,
        styles: { background: "red" },
        meta: { weight: 3 },
      },
      { id: "outer", sourceBlockId: "a", targetBlockId: "c" },
    ];

    const result = createDuplicates({ blocks: shifted(block("a"), block("b")), connections, delta, createId });

    expect(result.connections).toEqual([
      {
        sourceBlockId: "a-copy",
        targetBlockId: "b-copy",
        sourceAnchorId: "out",
        targetAnchorId: "in",
        label: "edge",
        dashed: true,
        styles: { background: "red" },
        meta: { weight: 3 },
      },
    ]);
  });

  it("shifts route points and positioned labels of copied connections", () => {
    const connection: TMultipointConnection = {
      id: "route",
      sourceBlockId: "a",
      targetBlockId: "b",
      points: [{ x: 1, y: 2 }],
      labels: [{ x: 3, y: 4, text: "positioned" }, { text: "floating" }],
    };

    const [copy] = createDuplicates({
      blocks: shifted(block("a"), block("b")),
      connections: [connection],
      delta,
      createId,
    }).connections;

    expect(copy).toMatchObject({
      points: [{ x: 11, y: 22 }],
      labels: [{ x: 13, y: 24, text: "positioned" }, { text: "floating" }],
    });
  });

  it("matches numeric and string block IDs", () => {
    const connections: TConnection[] = [{ id: "numeric", sourceBlockId: 1, targetBlockId: "2" }];

    const result = createDuplicates({
      blocks: shifted(block("1", { id: 1 }), block("2")),
      connections,
      delta,
      createId,
    });

    expect(result.connections).toMatchObject([{ sourceBlockId: "1-copy", targetBlockId: "2-copy" }]);
  });
});
