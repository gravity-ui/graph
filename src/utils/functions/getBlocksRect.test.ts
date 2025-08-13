import { TBlock } from "../../components/canvas/blocks/Block";
import { Rect } from "../types/shapes";

import { getBlocksRect } from "./index";

describe("getBlocksRect", () => {
  const createMockTBlock = (id: string, x: number, y: number, width: number, height: number): TBlock => ({
    id,
    is: "Block",
    x,
    y,
    width,
    height,
    selected: false,
    name: `Block ${id}`,
    anchors: [],
    settings: {
      phantom: false,
    },
  });

  it("should return correct rect for single block", () => {
    const blocks = [createMockTBlock("block1", 10, 20, 100, 50)];
    const result = getBlocksRect(blocks);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it("should return correct rect for multiple blocks", () => {
    const blocks = [createMockTBlock("block1", 10, 20, 100, 50), createMockTBlock("block2", 50, 30, 80, 60)];
    const result = getBlocksRect(blocks);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(120); // 50 + 80
    expect(result.height).toBe(70); // 30 + 60 - 20
  });

  it("should return default rect when blocks array is empty", () => {
    const result = getBlocksRect([]);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("should handle blocks with negative coordinates", () => {
    const blocks = [createMockTBlock("block1", -10, -20, 100, 50), createMockTBlock("block2", 50, 30, 80, 60)];
    const result = getBlocksRect(blocks);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(-10);
    expect(result.y).toBe(-20);
    expect(result.width).toBe(140); // 50 + 80
    expect(result.height).toBe(110); // 30 + 60 - (-20)
  });

  it("should handle single block with zero dimensions", () => {
    const blocks = [createMockTBlock("block1", 0, 0, 0, 0)];
    const result = getBlocksRect(blocks);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("should handle blocks with very large coordinates", () => {
    const blocks = [
      createMockTBlock("block1", 1000000, 2000000, 100, 50),
      createMockTBlock("block2", 1000100, 2000050, 80, 60),
    ];
    const result = getBlocksRect(blocks);

    expect(result).toBeInstanceOf(Rect);
    expect(result.x).toBe(1000000);
    expect(result.y).toBe(2000000);
    expect(result.width).toBe(180); // 100 + 80
    expect(result.height).toBe(110); // 50 + 60
  });
});
