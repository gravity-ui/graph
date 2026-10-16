import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";
import { requireValue } from "../page-objects/requireValue";

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
      if (!portA || !portC) throw new Error("Expected output ports of block-a and block-c");

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
      if (!portA || !portC) throw new Error("Expected output ports of block-a and block-c");

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Verify connection geometry now uses block-c's port position
    const after = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      if (!conn) throw new Error("Expected connection conn-ab");
      const geometry = conn.$geometry.value;

      return geometry ? { source: geometry[0], target: geometry[1] } : null;
    });

    expect(after).not.toBeNull();
    const { source } = requireValue(after, "conn-ab geometry");
    // Source should match block-c's output port, not block-a's
    expect(source.x).toBe(before.portC.x);
    expect(source.y).toBe(before.portC.y);
  });

  test("connection updates when delegate target block moves", async ({ page }) => {
    // Delegate block-a output port to block-c output port
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));
      if (!portA || !portC) throw new Error("Expected output ports of block-a and block-c");

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Move block-c to a new position
    await page.evaluate(({ id, is, name, width, height }) => {
      window.graph.updateEntities({ blocks: [{ id, is, name, width, height, x: 300, y: 600 }] });
    }, BLOCKS[2]);

    await graphPO.waitForFrames(5);

    // Verify connection source moved with block-c
    const result = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portC = ports.getPort(createBlockPointPortId("block-c", false));
      if (!portC) throw new Error("Expected output port of block-c");
      const conn = window.graph.connections.getConnectionState("conn-ab");
      if (!conn) throw new Error("Expected connection conn-ab");
      const blockC = window.graph.blocks.getBlockState("block-c");
      if (!blockC) throw new Error("Expected block-c");
      const geometry = conn.$geometry.value;
      const blockGeometry = blockC.$geometry.value;

      return {
        portCPoint: portC.$point.value,
        connSource: geometry ? geometry[0] : null,
        blockC: { x: blockGeometry.x, y: blockGeometry.y, width: blockGeometry.width, height: blockGeometry.height },
      };
    });

    // block-c really moved, and its output port follows it (right edge, vertical center)
    expect(result.blockC.x).toBe(300);
    expect(result.blockC.y).toBe(600);
    expect(result.portCPoint.x).toBe(result.blockC.x + result.blockC.width);
    expect(result.portCPoint.y).toBe(result.blockC.y + Math.floor(result.blockC.height / 2));

    expect(result.connSource).not.toBeNull();
    const connSource = requireValue(result.connSource, "conn-ab source point");
    expect(connSource.x).toBe(result.portCPoint.x);
    expect(connSource.y).toBe(result.portCPoint.y);
  });

  test("undelegate restores original connection position", async ({ page }) => {
    // Get original geometry
    const originalSource = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      if (!conn) throw new Error("Expected connection conn-ab");
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
      if (!portA || !portC) throw new Error("Expected output ports of block-a and block-c");

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      if (!portA) throw new Error("Expected output port of block-a");
      portA.undelegate();
    });

    await graphPO.waitForFrames(3);

    // Verify connection returned to original position
    const restoredSource = await page.evaluate(() => {
      const conn = window.graph.connections.getConnectionState("conn-ab");
      if (!conn) throw new Error("Expected connection conn-ab");
      const geometry = conn.$geometry.value;
      return geometry ? { x: geometry[0].x, y: geometry[0].y } : null;
    });

    expect(restoredSource).not.toBeNull();
    const restored = requireValue(restoredSource, "restored conn-ab source");
    const original = requireValue(originalSource, "original conn-ab source");
    expect(restored.x).toBe(original.x);
    expect(restored.y).toBe(original.y);
  });

  test("setPoint during delegation is saved and restored on undelegate", async ({ page }) => {
    // Delegate block-a output port to block-c output port
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const portC = ports.getPort(createBlockPointPortId("block-c", false));
      if (!portA || !portC) throw new Error("Expected output ports of block-a and block-c");

      portA.delegate(portC);
    });

    await graphPO.waitForFrames(3);

    // Move block-a (which calls setPoint on the delegated port internally)
    await page.evaluate(({ id, is, name, width, height }) => {
      window.graph.updateEntities({ blocks: [{ id, is, name, width, height, x: 200, y: 200 }] });
    }, BLOCKS[0]);

    await graphPO.waitForFrames(5);

    // Get expected port position after block-a move
    const expectedPoint = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      if (!portA) throw new Error("Expected output port of block-a");
      // While delegated, the savedPoint should reflect the new block position
      return portA.isDelegated;
    });

    expect(expectedPoint).toBe(true);

    // Undelegate
    await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      if (!portA) throw new Error("Expected output port of block-a");
      portA.undelegate();
    });

    await graphPO.waitForFrames(3);

    // After undelegate, the port should be at the new block-a position (200, 200 + height/2)
    const result = await page.evaluate(() => {
      const { createBlockPointPortId } = window.GraphModule;
      const ports = window.graph.connections.ports;

      const portA = ports.getPort(createBlockPointPortId("block-a", false));
      const blockA = window.graph.blocks.getBlockState("block-a");
      if (!portA || !blockA) throw new Error("Expected block-a and its output port");
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
