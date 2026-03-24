import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("Bezier Connection Hitbox", () => {
  test.describe("Horizontal graph — target to the right of source", () => {
    let graphPO: GraphPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      // Source at top-right, target at bottom-left.
      // Connection goes from source's right side, loops around, enters target's left side.
      // Bezier control points extend far right of source and far left of target —
      // this is the edge case where the hitbox must include bezier control points.
      await graphPO.initialize({
        blocks: [
          {
            id: "source",
            is: "Block",
            x: 500,
            y: 50,
            width: 200,
            height: 100,
            name: "Source",
            anchors: [],
            selected: false,
          },
          {
            id: "target",
            is: "Block",
            x: 0,
            y: 300,
            width: 200,
            height: 100,
            name: "Target",
            anchors: [],
            selected: false,
          },
        ],
        connections: [
          {
            sourceBlockId: "source",
            targetBlockId: "target",
          },
        ],
        settings: {
          useBezierConnections: true,
          bezierConnectionDirection: "horizontal",
        },
      });
    });

    test("should select connection on click near source control point", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      expect(await conn.exists()).toBe(true);
      expect(await conn.isSelected()).toBe(false);

      // t≈0.15 — curve near the source, where it extends to the right beyond the source block
      await conn.click({ curveTime: 0.15 });

      expect(await conn.isSelected()).toBe(true);
    });

    test("should select connection on click near target control point", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      // t≈0.85 — curve near the target, where it extends to the left beyond the target block
      await conn.click({ curveTime: 0.85 });

      expect(await conn.isSelected()).toBe(true);
    });

    test("should not select connection on click away from curve", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      // Click far from any connection or block
      await graphPO.click(-200, -200);

      expect(await conn.isSelected()).toBe(false);
    });
  });

  test.describe("Vertical graph — target above source", () => {
    let graphPO: GraphPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);

      // For vertical graphs, connection points are top/bottom of blocks.
      // We register a custom VerticalBlock that overrides getConnectionPoint.
      await page.goto("/base.html");

      await page.waitForFunction(() => {
        return (window as any).graphLibraryLoaded === true;
      });

      await page.evaluate(() => {
        const rootEl = document.getElementById("root");
        if (!rootEl) {
          throw new Error("Root element not found");
        }

        const { Graph, CanvasBlock } = (window as any).GraphModule;

        // Custom block with vertical connection points (out=bottom, in=top)
        class VerticalBlock extends CanvasBlock {
          getConnectionPoint(direction: "in" | "out") {
            return {
              x: (this.connectedState.x + this.connectedState.width / 2) | 0,
              y: this.connectedState.y + (direction === "out" ? this.connectedState.height : 0),
            };
          }
        }

        const config = {
          configurationName: "vertical-e2e",
          settings: {
            useBezierConnections: true,
            bezierConnectionDirection: "vertical",
            blockComponents: {
              verticalBlock: VerticalBlock,
            },
          },
        };

        const graph = new Graph(config, rootEl);

        // Source at bottom, target above and to the right.
        // Connection goes from source bottom to target top.
        // With vertical bezier, the curve bows sideways.
        graph.setEntities({
          blocks: [
            {
              id: "source",
              is: "verticalBlock",
              x: 200,
              y: 400,
              width: 200,
              height: 150,
              name: "Source",
              anchors: [],
              selected: false,
            },
            {
              id: "target",
              is: "verticalBlock",
              x: 500,
              y: 0,
              width: 200,
              height: 150,
              name: "Target",
              anchors: [],
              selected: false,
            },
          ],
          connections: [
            {
              sourceBlockId: "source",
              targetBlockId: "target",
            },
          ],
        });

        graph.start();
        graph.zoomTo("center");

        window.graph = graph;
        window.graphInitialized = true;
      });

      await page.waitForFunction(
        () => window.graphInitialized === true,
        { timeout: 5000 }
      );

      await graphPO.waitForFrames(3);
    });

    test("should select connection on click near source control point", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      expect(await conn.exists()).toBe(true);
      expect(await conn.isSelected()).toBe(false);

      // t≈0.15 — curve near source, extending below the source block
      await conn.click({ curveTime: 0.15 });

      expect(await conn.isSelected()).toBe(true);
    });

    test("should select connection on click near target control point", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      // t≈0.85 — curve near target, extending above the target block
      await conn.click({ curveTime: 0.85 });

      expect(await conn.isSelected()).toBe(true);
    });

    test("should not select connection on click away from curve", async () => {
      const conn = graphPO.getConnectionCOM("source:target");

      // Click far from any connection or block
      await graphPO.click(-300, -300);

      expect(await conn.isSelected()).toBe(false);
    });
  });
});
