import { expect, test } from "@playwright/test";
import type { TScenePrimitive } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

test("a polygon outline keeps its interior transparent in either paint order", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await graph.initialize({ settings: { renderer: "canvas" } });
  await graph.evaluate((graph) => {
    class Polygons extends window.GraphModule.CanvasBlock {
      protected override schematic(): readonly TScenePrimitive[] {
        const square = (x: number, fill?: string): TScenePrimitive => ({
          kind: "polygon",
          points: new Float32Array([x, 0, x + 20, 0, x + 20, 20, x, 20]),
          fill,
          stroke: { color: "#000", width: 2 },
        });
        const shapes = [square(0, "red"), square(30)];
        return this.props.id === "forward" ? shapes : shapes.reverse();
      }
    }
    graph.updateSettings({ blockComponents: { Polygons } });
    graph.setEntities({
      blocks: ["forward", "reverse"].map((id, i) => ({
        id,
        is: "Polygons",
        name: id,
        x: 5,
        y: 5 + i * 30,
        width: 50,
        height: 20,
      })),
    });
  });
  await graph.waitForFrames(2);
  const pixels = await graph.evaluate((graph) => {
    return [5, 35].map((y) => {
      const image = graph.scene.toImage({
        rect: { x: 0, y, width: 60, height: 20 },
        scale: 1,
        pixelRatio: 1,
        level: "schematic",
      });
      const ctx = image.getContext("2d")!;
      return [15, 45].map((x) => Array.from(ctx.getImageData(x, 10, 1, 1).data));
    });
  });
  const interiors = [
    [255, 0, 0, 255],
    [0, 0, 0, 0],
  ];
  expect(pixels).toEqual([interiors, interiors]);
});

test.describe("Blocks in the scene: hit order", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [
        {
          id: "lower",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Lower",
          anchors: [{ id: "out", blockId: "lower", type: "OUT" }],
        },
        { id: "upper", is: "Block", x: 220, y: 140, width: 200, height: 100, name: "Upper", anchors: [] },
      ],
      connections: [],
    });
  });

  test("a click in the overlap selects the block drawn on top", async () => {
    await graphPO.clickAt({ x: 260, y: 170 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["upper"]);
  });

  test("a block raised by selection stays on top after deselection", async () => {
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["lower"], true));
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["lower"], false));
    await graphPO.waitForFrames(3);
    await graphPO.clickAt({ x: 260, y: 170 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["lower"]);
  });

  test("an anchor of the lower block under the upper block is not hit", async () => {
    // The OUT anchor of "lower" is at (300, 188), under "upper".
    await graphPO.clickAt({ x: 300, y: 188 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["upper"]);
  });
});
