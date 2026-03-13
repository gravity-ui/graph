import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Port Delegation", () => {
  let graphPO: GraphPageObject;

  const BLOCKS = [
    {
      id: "block-a",
      is: "Block" as const,
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      name: "Block A",
      anchors: [],
      selected: false,
    },
    {
      id: "block-b",
      is: "Block" as const,
      x: 500,
      y: 100,
      width: 200,
      height: 100,
      name: "Block B",
      anchors: [],
      selected: false,
    },
    {
      id: "block-c",
      is: "Block" as const,
      x: 100,
      y: 400,
      width: 200,
      height: 100,
      name: "Block C",
      anchors: [],
      selected: false,
    },
  ];

  const CONNECTIONS = [
    {
      id: "conn-ab",
      sourceBlockId: "block-a",
      targetBlockId: "block-b",
    },
  ];

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: BLOCKS,
      connections: CONNECTIONS,
    });
  });

  test("connection follows delegated port position", async ({ page }) => {
    // Get output port positions before delegation
    const before = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));

      return {
        portA: portA.$point.value,
        portC: portC.$point.value,
      };
    });

    // Delegate block-a output port to block-c output port
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Verify connection geometry now uses block-c's port position
    const after = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      const geometry = conn.$geometry.value;

      return geometry ? { source: geometry[0], target: geometry[1] } : null;
    });

    expect(after).not.toBeNull();
    // Source should match block-c's output port, not block-a's
    expect(after!.source.x).toBe(before.portC.x);
    expect(after!.source.y).toBe(before.portC.y);
  });

  test("connection updates when delegate target block moves", async ({ page }) => {
    // Delegate block-a output port to block-c output port
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Move block-c to a new position
    await page.evaluate(() => {
      window.graph.updateEntities({ blocks: [{ id: "block-c", x: 300, y: 600 }] });
    });

    await graphPO.waitForFrames(5);

    // Verify connection source moved with block-c
    const result = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portC = ports.getPort(createBlockPointPortId("block-c", false));
      const conn = window.graph.connections.getConnectionState("conn-ab");
      const geometry = conn.$geometry.value;

      return {
        portCPoint: portC.$point.value,
        connSource: geometry ? geometry[0] : null,
      };
    });

    expect(result.connSource).not.toBeNull();
    expect(result.connSource!.x).toBe(result.portCPoint.x);
    expect(result.connSource!.y).toBe(result.portCPoint.y);
  });

  test("undelegate restores original connection position", async ({ page }) => {
    // Get original geometry
    const originalSource = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      const geometry = conn.$geometry.value;
      return geometry ? { x: geometry[0].x, y: geometry[0].y } : null;
    });

    expect(originalSource).not.toBeNull();

    // Delegate then undelegate
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      portA.undelegate();
    });

    await graphPO.waitForFrames(3);

    // Verify connection returned to original position
    const restoredSource = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      const geometry = conn.$geometry.value;
      return geometry ? { x: geometry[0].x, y: geometry[0].y } : null;
    });

    expect(restoredSource).not.toBeNull();
    expect(restoredSource!.x).toBe(originalSource!.x);
    expect(restoredSource!.y).toBe(originalSource!.y);
  });

  test("setPoint during delegation is saved and restored on undelegate", async ({ page }) => {
    // Delegate block-a output port to block-c output port
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Move block-a (which calls setPoint on the delegated port internally)
    await page.evaluate(() => {
      window.graph.updateEntities({ blocks: [{ id: "block-a", x: 200, y: 200 }] });
    });

    await graphPO.waitForFrames(5);

    // Get expected port position after block-a move
    const expectedPoint = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      // While delegated, the savedPoint should reflect the new block position
      return portA.isDelegated;
    });

    expect(expectedPoint).toBe(true);

    // Undelegate
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      portA.undelegate();
    });

    await graphPO.waitForFrames(3);

    // After undelegate, the port should be at the new block-a position (200, 200 + height/2)
    const result = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const blockA = window.graph.blocks.getBlockState("block-a");
      const blockGeometry = blockA.$geometry.value;

      return {
        portPoint: portA.$point.value,
        // Output port should be at right edge, vertical center
        expectedX: blockGeometry.x + blockGeometry.width,
        expectedY: blockGeometry.y + Math.floor(blockGeometry.height / 2),
      };
    });

    expect(result.portPoint.x).toBe(result.expectedX);
    expect(result.portPoint.y).toBe(result.expectedY);
  });
});
