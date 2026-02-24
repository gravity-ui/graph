import React, { useEffect, useLayoutEffect, useRef } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Anchor, CanvasBlock, EAnchorType, ECanDrag, Graph } from "@gravity-ui/graph";
import { TBlock } from "@gravity-ui/graph";
import {
  IPortConnectionMeta,
  PortConnectionLayer,
} from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { createAnchorPortId } from "@gravity-ui/graph";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

/**
 * Helper function to check if two ports belong to the same block
 */
function isSameBlock(sourcePort: { owner?: unknown }, targetPort: { owner?: unknown }): boolean {
  return sourcePort.owner === targetPort.owner;
}

/**
 * Helper function to check if connection is valid (IN↔OUT bidirectional)
 */
function isValidConnection(sourcePort: { owner?: unknown }, targetPort: { owner?: unknown }): boolean {
  const sourceComponent = sourcePort.owner;
  const targetComponent = targetPort.owner;

  if (!sourceComponent || !targetComponent) {
    return true;
  }

  const isSourceAnchor = sourceComponent instanceof Anchor;
  const isTargetAnchor = targetComponent instanceof Anchor;

  if (isSourceAnchor && isTargetAnchor) {
    const sourceType = sourceComponent.connectedState.state.type;
    const targetType = targetComponent.connectedState.state.type;
    return sourceType !== targetType;
  }

  return true;
}

/**
 * Custom block with port-based snapping using PortConnectionLayer
 * Demonstrates the new port-centric approach
 * Rules:
 * - Can connect IN to OUT or OUT to IN (bidirectional)
 * - Cannot connect same types (IN to IN or OUT to OUT)
 * - Cannot connect ports of the same block
 */
class PortBasedBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    // Configure snapping for all anchors using new PortMetaKey
    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);

      const snapMeta: IPortConnectionMeta = {
        snappable: true,
        snapCondition: (ctx) => {
          // Cannot connect to the same block
          if (isSameBlock(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Can connect IN ↔ OUT (bidirectional)
          return isValidConnection(ctx.sourcePort, ctx.targetPort);
        },
      };

      // Configure port for snapping
      this.updatePort(portId, {
        meta: {
          [PortConnectionLayer.PortMetaKey]: snapMeta,
        },
      });
    });
  }
}

/**
 * Custom block with conditional snapping and data types
 * Demonstrates advanced port validation with metadata
 * This block passes "number" type through - both IN and OUT have same type
 */
class ConditionalPortBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);
      // Both IN and OUT have the same data type so they can connect
      const dataType = "number";

      const snapMeta: IPortConnectionMeta = {
        snappable: true,
        snapCondition: (ctx) => {
          // Cannot connect to the same block
          if (isSameBlock(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Can connect IN ↔ OUT (bidirectional)
          if (!isValidConnection(ctx.sourcePort, ctx.targetPort)) {
            return false;
          }

          // Check data types match
          const sourceMeta = ctx.sourcePort.meta as Record<string, unknown> | undefined;
          const targetMeta = ctx.targetPort.meta as Record<string, unknown> | undefined;
          const sourceDataType = sourceMeta?.dataType;
          const targetDataType = targetMeta?.dataType;

          if (!sourceDataType || !targetDataType) {
            return true;
          }

          return sourceDataType === targetDataType;
        },
      };

      // Store both snap metadata and data type
      this.updatePort(portId, {
        meta: {
          [PortConnectionLayer.PortMetaKey]: snapMeta,
          dataType: dataType,
        },
      });
    });
  }
}

const generatePortBlocks = (): TBlock[] => {
  return [
    {
      id: "port-block-1",
      name: "Port Block 1",
      x: 100,
      y: 100,
      width: 200,
      height: 400,
      is: "port-based-block",
      selected: false,
      anchors: [
        { id: "port-block-1/input-1", blockId: "port-block-1", type: EAnchorType.IN },
        { id: "port-block-1/input-2", blockId: "port-block-1", type: EAnchorType.IN },
        { id: "port-block-1/output-1", blockId: "port-block-1", type: EAnchorType.OUT },
      ],
    },
    {
      id: "port-block-2",
      name: "Port Block 2",
      x: 400,
      y: 100,
      width: 200,
      height: 400,
      is: "port-based-block",
      selected: false,
      anchors: [
        { id: "port-block-2/input-1", blockId: "port-block-2", type: EAnchorType.IN },
        { id: "port-block-2/output-1", blockId: "port-block-2", type: EAnchorType.OUT },
        { id: "port-block-2/output-2", blockId: "port-block-2", type: EAnchorType.OUT },
      ],
    },
    {
      id: "port-block-3",
      name: "Port Block 3",
      x: 700,
      y: 100,
      width: 200,
      height: 400,
      is: "port-based-block",
      selected: false,
      anchors: [
        { id: "port-block-3/input-1", blockId: "port-block-3", type: EAnchorType.IN },
        { id: "port-block-3/input-2", blockId: "port-block-3", type: EAnchorType.IN },
        { id: "port-block-3/output-1", blockId: "port-block-3", type: EAnchorType.OUT },
      ],
    },
    {
      id: "conditional-block-1",
      name: "Conditional Block 1",
      x: 100,
      y: 600,
      width: 200,
      height: 400,
      is: "conditional-port-block",
      selected: false,
      anchors: [
        { id: "conditional-block-1/input-1", blockId: "conditional-block-1", type: EAnchorType.IN },
        { id: "conditional-block-1/output-1", blockId: "conditional-block-1", type: EAnchorType.OUT },
      ],
    },
    {
      id: "conditional-block-2",
      name: "Conditional Block 2",
      x: 400,
      y: 600,
      width: 200,
      height: 400,
      is: "conditional-port-block",
      selected: false,
      anchors: [
        { id: "conditional-block-2/input-1", blockId: "conditional-block-2", type: EAnchorType.IN },
        { id: "conditional-block-2/output-1", blockId: "conditional-block-2", type: EAnchorType.OUT },
      ],
    },
  ];
};

const GraphApp = () => {
  const { graph, setEntities, start, addLayer, zoomTo } = useGraph({
    settings: {
      canDrag: ECanDrag.ALL,
      canCreateNewConnections: true,
      useBlocksAnchors: true,
      blockComponents: {
        "port-based-block": PortBasedBlock,
        "conditional-port-block": ConditionalPortBlock,
      },
    },
  });

  useEffect(() => {
    setEntities({
      blocks: generatePortBlocks(),
    });
    start();
    zoomTo("center", { padding: 300 });
  }, [graph]);

  const layerRef = useRef<PortConnectionLayer>(null);

  useLayoutEffect(() => {
    // Create icon for creating connections
    const createIcon = {
      path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
      fill: "#FFD700",
      width: 24,
      height: 24,
      viewWidth: 24,
      viewHeight: 24,
    };

    // Icon for connection point
    const pointIcon = {
      path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z",
      fill: "#4CAF50",
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
          color: "#4CAF50",
          dash: [],
        },
      };
    };

    layerRef.current = addLayer(PortConnectionLayer, {
      createIcon,
      point: pointIcon,
      drawLine,
      searchRadius: 30,
    });

    return () => {
      layerRef.current?.detachLayer();
    };
  }, []);

  const renderBlock = (graphInstance: Graph, block: TBlock) => {
    return <BlockStory graph={graphInstance} block={block} />;
  };

  return (
    <ThemeProvider theme="light">
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/PortConnectionLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
