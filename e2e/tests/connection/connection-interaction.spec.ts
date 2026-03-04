import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK_A = {
  id: "block-a",
  is: "Block" as const,
  x: 100,
  y: 200,
  width: 200,
  height: 100,
  name: "Block A",
  anchors: [],
  selected: false,
};

const BLOCK_B = {
  id: "block-b",
  is: "Block" as const,
  x: 500,
  y: 200,
  width: 200,
  height: 100,
  name: "Block B",
  anchors: [],
  selected: false,
};

const CONNECTION = {
  id: "conn-1",
  sourceBlockId: "block-a",
  targetBlockId: "block-b",
};

test.describe("Connection Interaction", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    await graphPO.initialize({
      blocks: [BLOCK_A, BLOCK_B],
      connections: [CONNECTION],
      settings: { useBezierConnections: false },
    });

    // Wait for ports to resolve so $geometry is available
    await graphPO.waitForFrames(5);
  });

  test("should fire mouseenter on connection when hovering over it", async () => {
    const conn = graphPO.getConnectionCOM("conn-1");

    // Move mouse away from the connection area to ensure a clean mouseenter
    await graphPO.hover(-200, -200);
    await graphPO.waitForFrames(2);

    // Start collecting mouseenter events
    const listener = await graphPO.listenGraphEvents("mouseenter");

    // Hover over the connection midpoint (open area between the two blocks)
    await conn.hover({ waitFrames: 3 });

    // Verify mouseenter fired with the connection as target
    const connectionReceivedEvent = await listener.analyze(
      (events, connId) => {
        return events.some((e) => {
          const target = (e as any).detail?.target;
          return target?.props?.id === connId;
        });
      },
      "conn-1"
    );

    await listener.stop();

    expect(connectionReceivedEvent).toBe(true);
  });

  test("should select connection when clicking on it", async () => {
    const conn = graphPO.getConnectionCOM("conn-1");

    expect(await conn.isSelected()).toBe(false);

    await conn.click({ waitFrames: 3 });

    expect(await conn.isSelected()).toBe(true);
  });

  test("connections canvas should be below blocks canvas in DOM", async ({ page }) => {
    const isConnectionsBelow = await page.evaluate(() => {
      const connectionsCanvas = document.querySelector(".connections-canvas");
      const graphCanvas = window.graph.getGraphCanvas();
      if (!connectionsCanvas || !graphCanvas) return false;
      // DOCUMENT_POSITION_FOLLOWING means graphCanvas comes after connectionsCanvas in DOM order,
      // meaning it renders on top (connections are visually below blocks).
      return Boolean(connectionsCanvas.compareDocumentPosition(graphCanvas) & Node.DOCUMENT_POSITION_FOLLOWING);
    });

    expect(isConnectionsBelow).toBe(true);
  });

  test("should NOT fire mouseenter on connection when a block covers it", async () => {
    // Place a block over the connection midpoint
    await graphPO.setEntities({
      blocks: [
        BLOCK_A,
        BLOCK_B,
        {
          id: "block-c",
          is: "Block" as const,
          x: 350,
          y: 200,
          width: 100,
          height: 100,
          name: "Block C",
          anchors: [],
          selected: false,
        },
      ],
      connections: [CONNECTION],
    });
    await graphPO.waitForFrames(5);

    // Move away first
    await graphPO.hover(-200, -200);
    await graphPO.waitForFrames(2);

    // Listen for mouseenter events
    const listener = await graphPO.listenGraphEvents("mouseenter");

    // Hover at the midpoint (400, 250) — now covered by block-c (x=350..450, y=200..300)
    await graphPO.hover(400, 250, { waitFrames: 3 });

    const connectionReceivedEvent = await listener.analyze(
      (events, connId) => {
        return events.some((e) => {
          const target = (e as any).detail?.target;
          return target?.props?.id === connId;
        });
      },
      "conn-1"
    );

    const blockReceivedEvent = await listener.analyze((events) => {
      return events.some((e) => {
        const target = (e as any).detail?.target;
        return target?.props?.id === "block-c";
      });
    });

    await listener.stop();

    // Connection must NOT receive mouseenter — block intercepts it
    expect(connectionReceivedEvent).toBe(false);
    // Block C must receive mouseenter — it's on top
    expect(blockReceivedEvent).toBe(true);
  });
});
