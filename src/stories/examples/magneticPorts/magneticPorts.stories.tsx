import React, { useEffect, useLayoutEffect, useRef } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Anchor, CanvasBlock, EAnchorType, Graph } from "../../../";
import { Block, TBlock } from "../../../components/canvas/blocks/Block";
import { ConnectionLayer, IPortSnapMeta } from "../../../components/canvas/layers/connectionLayer/ConnectionLayer";
import { GraphCanvas, useGraph } from "../../../react-components";
import { createAnchorPortId } from "../../../store/connection/port/utils";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

/**
 * Helper function to check if two ports belong to the same block
 */
function isSameBlock(sourcePort: { component?: unknown }, targetPort: { component?: unknown }): boolean {
  const sourceComponent = sourcePort.component;
  const targetComponent = targetPort.component;

  if (!sourceComponent || !targetComponent) {
    return false;
  }

  const isSourceBlock = sourceComponent instanceof Block;
  const isTargetBlock = targetComponent instanceof Block;
  const isSourceAnchor = sourceComponent instanceof Anchor;
  const isTargetAnchor = targetComponent instanceof Anchor;

  if (isSourceBlock && isTargetBlock) {
    return sourceComponent.connectedState.id === targetComponent.connectedState.id;
  } else if (isSourceAnchor && isTargetAnchor) {
    return sourceComponent.connectedState.blockId === targetComponent.connectedState.blockId;
  } else if (isSourceBlock && isTargetAnchor) {
    return sourceComponent.connectedState.id === targetComponent.connectedState.blockId;
  } else if (isSourceAnchor && isTargetBlock) {
    return sourceComponent.connectedState.blockId === targetComponent.connectedState.id;
  }

  return false;
}

/**
 * Helper function to check if connection is valid (IN to OUT or OUT to IN)
 */
function isValidConnection(sourcePort: { component?: unknown }, targetPort: { component?: unknown }): boolean {
  const sourceComponent = sourcePort.component;
  const targetComponent = targetPort.component;

  if (!sourceComponent || !targetComponent) {
    return true;
  }

  const isSourceAnchor = sourceComponent instanceof Anchor;
  const isTargetAnchor = targetComponent instanceof Anchor;

  if (isSourceAnchor && isTargetAnchor) {
    const sourceType = sourceComponent.connectedState.state.type;
    const targetType = targetComponent.connectedState.state.type;

    return (
      (sourceType === EAnchorType.IN && targetType === EAnchorType.OUT) ||
      (sourceType === EAnchorType.OUT && targetType === EAnchorType.IN)
    );
  }

  return true;
}

/**
 * Custom block with snapping ports
 * Demonstrates how to configure port snapping for anchors
 * Rules:
 * - Can only connect IN to OUT (not IN to IN or OUT to OUT)
 * - Cannot connect input and output of the same block
 */
class MagneticBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    // Configure snapping for all anchors
    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);

      const snapMeta: IPortSnapMeta = {
        snappable: true,
        snapCondition: (ctx) => {
          // Cannot connect to the same block
          if (isSameBlock(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Can only connect IN to OUT
          return isValidConnection(ctx.sourcePort, ctx.targetPort);
        },
      };

      this.updatePort(portId, undefined, undefined, snapMeta);
    });
  }
}

/**
 * Custom block with conditional snapping
 * Only snaps to ports with matching data types
 * Also applies the same rules as MagneticBlock:
 * - Can only connect IN to OUT
 * - Cannot connect input and output of the same block
 */
class ConditionalMagneticBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);

      const snapMeta: IPortSnapMeta = {
        snappable: true,
        snapCondition: (ctx) => {
          // Cannot connect to the same block
          if (isSameBlock(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Can only connect IN to OUT
          if (!isValidConnection(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Only snap if both ports have matching data types
          const sourceMeta = ctx.sourcePort.meta as { dataType?: string } | undefined;
          const targetMeta = ctx.targetPort.meta as { dataType?: string } | undefined;

          if (!sourceMeta?.dataType || !targetMeta?.dataType) {
            return true; // Allow snapping if no data type specified
          }

          return sourceMeta.dataType === targetMeta.dataType;
        },
      };

      this.updatePort(portId, undefined, undefined, {
        ...snapMeta,
        dataType: anchor.type === EAnchorType.IN ? "input-data" : "output-data",
      });
    });
  }
}

const generateMagneticBlocks = (): TBlock[] => {
  return [
    {
      id: "block-1",
      name: "Magnetic Block 1",
      x: 100,
      y: 100,
      width: 200,
      height: 400,
      is: "magnetic-block",
      selected: false,
      anchors: [
        { id: "input-1", blockId: "block-1", type: EAnchorType.IN },
        { id: "input-2", blockId: "block-1", type: EAnchorType.IN },
        { id: "output-1", blockId: "block-1", type: EAnchorType.OUT },
      ],
    },
    {
      id: "block-2",
      name: "Magnetic Block 2",
      x: 400,
      y: 100,
      width: 200,
      height: 400,
      is: "magnetic-block",
      selected: false,
      anchors: [
        { id: "input-1", blockId: "block-2", type: EAnchorType.IN },
        { id: "output-1", blockId: "block-2", type: EAnchorType.OUT },
        { id: "output-2", blockId: "block-2", type: EAnchorType.OUT },
      ],
    },
    {
      id: "block-3",
      name: "Magnetic Block 3",
      x: 700,
      y: 100,
      width: 200,
      height: 400,
      is: "magnetic-block",
      selected: false,
      anchors: [
        { id: "input-1", blockId: "block-3", type: EAnchorType.IN },
        { id: "input-2", blockId: "block-3", type: EAnchorType.IN },
        { id: "output-1", blockId: "block-3", type: EAnchorType.OUT },
      ],
    },
    {
      id: "block-4",
      name: "Conditional Block 1",
      x: 100,
      y: 600,
      width: 200,
      height: 400,
      is: "conditional-magnetic-block",
      selected: false,
      anchors: [
        { id: "input-1", blockId: "block-4", type: EAnchorType.IN },
        { id: "output-1", blockId: "block-4", type: EAnchorType.OUT },
      ],
    },
    {
      id: "block-5",
      name: "Conditional Block 2",
      x: 400,
      y: 600,
      width: 200,
      height: 400,
      is: "conditional-magnetic-block",
      selected: false,
      anchors: [
        { id: "input-1", blockId: "block-5", type: EAnchorType.IN },
        { id: "output-1", blockId: "block-5", type: EAnchorType.OUT },
      ],
    },
  ];
};

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({
    settings: {
      canCreateNewConnections: true,
      useBlocksAnchors: true,
      blockComponents: {
        "magnetic-block": MagneticBlock,
        "conditional-magnetic-block": ConditionalMagneticBlock,
      },
    },
  });

  useEffect(() => {
    setEntities({
      blocks: generateMagneticBlocks(),
    });
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const connectionLayerRef = useRef<ConnectionLayer>(null);

  useLayoutEffect(() => {
    // Create icon for creating connections
    const createIcon = {
      path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", // Star icon
      fill: "#FFD700",
      width: 24,
      height: 24,
      viewWidth: 24,
      viewHeight: 24,
    };

    // Icon for connection point
    const pointIcon = {
      path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z",
      fill: "#4285F4",
      stroke: "#FFFFFF",
      width: 24,
      height: 24,
      viewWidth: 24,
      viewHeight: 24,
    };

    // Function for drawing connection line
    const drawLine = (start, end) => {
      const path = new Path2D();
      path.moveTo(start.x, start.y);
      path.lineTo(end.x, end.y);
      return {
        path,
        style: {
          color: "#4285F4",
          dash: [],
        },
      };
    };

    connectionLayerRef.current = addLayer(ConnectionLayer, {
      createIcon,
      point: pointIcon,
      drawLine,
    });

    return () => {
      connectionLayerRef.current?.detachLayer();
    };
  }, []);

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">Port Snapping Demo</Text>
          <Text variant="body-1">
            This demo shows how ports can automatically snap to nearby ports when creating connections.
          </Text>
          <Text variant="body-2">
            Try dragging from an anchor on one block to create a connection. Notice how the connection endpoint snaps to
            nearby ports when you get close to them.
          </Text>
          <Flex direction="column" gap={1} style={{ marginTop: 8 }}>
            <Text variant="body-2">
              <strong>Connection Rules:</strong>
            </Text>
            <Text variant="body-2">• Can only connect IN ports to OUT ports (not IN to IN or OUT to OUT)</Text>
            <Text variant="body-2">• Cannot connect input and output ports of the same block</Text>
            <Text variant="body-2">
              <strong>Snapping Blocks (top row):</strong> All anchors have snapping enabled with connection validation
              rules.
            </Text>
            <Text variant="body-2">
              <strong>Conditional Blocks (bottom row):</strong> Apply the same connection rules plus additional data
              type matching validation.
            </Text>
          </Flex>
        </Flex>
        <div style={{ flex: 1, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/Port Snapping",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
