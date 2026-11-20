import { TBlock } from "../../../components/canvas/blocks/Block";
import { getBlocksRect } from "../index";

describe("getBlocksRect", () => {
  const createMockTBlock = (id: string, x: number, y: number, width: number, height: number): TBlock => ({
    id,
    is: "Block",
    x,
    y,
    width,
    height,
    name: `Block ${id}`,
    anchors: [],
    settings: {
      phantom: false,
    },
  });

  it("should return correct rect for single block", () => {
    const blocks = [createMockTBlock("block1", 10, 20, 100, 50)];
    const result = getBlocksRect(blocks);

    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("should return correct rect for multiple blocks", () => {
    const blocks = [createMockTBlock("block1", 10, 20, 100, 50), createMockTBlock("block2", 50, 30, 80, 60)];
    const result = getBlocksRect(blocks);

    expect(result).toEqual({ x: 10, y: 20, width: 120, height: 70 });
  });

  it("should return default rect when blocks array is empty", () => {
    const result = getBlocksRect([]);

    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("should handle blocks with negative coordinates", () => {
    const blocks = [createMockTBlock("block1", -10, -20, 100, 50), createMockTBlock("block2", 50, 30, 80, 60)];
    const result = getBlocksRect(blocks);

    expect(result).toEqual({ x: -10, y: -20, width: 140, height: 110 });
  });

  it("should handle single block with zero dimensions", () => {
    const blocks = [createMockTBlock("block1", 0, 0, 0, 0)];
    const result = getBlocksRect(blocks);

    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("should handle blocks with very large coordinates", () => {
    const blocks = [
      createMockTBlock("block1", 1000000, 2000000, 100, 50),
      createMockTBlock("block2", 1000100, 2000050, 80, 60),
    ];
    const result = getBlocksRect(blocks);

    expect(result).toEqual({ x: 1000000, y: 2000000, width: 180, height: 110 });
  });
});
