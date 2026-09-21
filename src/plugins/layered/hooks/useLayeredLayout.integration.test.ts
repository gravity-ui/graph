import { renderHook, waitFor } from "@testing-library/react";

import { useLayeredLayout } from "./useLayeredLayout";

describe("useLayeredLayout integration", () => {
  it("routes a differently sized chain through the block centers", async () => {
    const blocks = [
      { id: "a", width: 100, height: 300 },
      { id: "b", width: 180, height: 100 },
      { id: "c", width: 120, height: 200 },
    ];
    const connections = [
      { id: "a-b", sourceBlockId: "a", targetBlockId: "b" },
      { id: "b-c", sourceBlockId: "b", targetBlockId: "c" },
    ];
    const { result } = renderHook(() => useLayeredLayout({ blocks, connections }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const layout = result.current.result;
    expect(layout).not.toBeNull();
    if (!layout) return;
    const center = layout.blocks.a.y + blocks[0].height / 2;
    expect(layout.blocks.b.y + blocks[1].height / 2).toBe(center);
    expect(layout.blocks.c.y + blocks[2].height / 2).toBe(center);
    expect(layout.edges["a-b"].points?.map((point) => point.y)).toEqual([center, center]);
    expect(layout.edges["b-c"].points?.map((point) => point.y)).toEqual([center, center]);
  });

  it("aligns block and edge centers with custom default virtual-node sizes", async () => {
    const blocks = [
      { id: "source", level: 0, width: 80, height: 240 },
      { id: "middle", level: 1, width: 100, height: 100 },
      { id: "target", level: 2, width: 160, height: 40 },
    ];
    const connections = [
      { id: "short", sourceBlockId: "source", targetBlockId: "middle" },
      { id: "long", sourceBlockId: "source", targetBlockId: "target" },
    ];
    const layoutOptions = { defaultNodeWidth: 60, defaultNodeHeight: 30 };
    const { result } = renderHook(() =>
      useLayeredLayout({
        blocks,
        connections,
        layoutOptions,
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const layout = result.current.result;
    expect(layout).not.toBeNull();
    if (!layout) return;
    const targetCenter = layout.blocks.target.y + blocks[2].height / 2;
    const longEdgePoints = layout.edges.long.points;
    expect(longEdgePoints).toBeDefined();
    if (!longEdgePoints) return;
    expect(longEdgePoints[longEdgePoints.length - 1].y).toBe(targetCenter);
    expect(longEdgePoints[longEdgePoints.length - 2].y).toBe(targetCenter);
  });
});
