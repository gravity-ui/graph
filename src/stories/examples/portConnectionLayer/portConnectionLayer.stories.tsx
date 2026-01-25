import React, { useEffect, useLayoutEffect, useRef } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Anchor, CanvasBlock, EAnchorType, Graph } from "../../../";
import { Block, TBlock } from "../../../components/canvas/blocks/Block";
import {
  IPortConnectionMeta,
  PortConnectionLayer,
} from "../../../components/canvas/layers/portConnectionLayer/PortConnectionLayer";
import { GraphCanvas, useGraph } from "../../../react-components";
import { createAnchorPortId } from "../../../store/connection/port/utils";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

/**
 * Helper function to check if two ports belong to the same block
 */
function isSameBlock(sourcePort: { owner?: unknown }, targetPort: { owner?: unknown }): boolean {
  const sourceComponent = sourcePort.owner;
  const targetComponent = targetPort.owner;

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

    return (
      (sourceType === EAnchorType.IN && targetType === EAnchorType.OUT) ||
      (sourceType === EAnchorType.OUT && targetType === EAnchorType.IN)
    );
  }

  return true;
}

/**
 * Custom block with port-based snapping using PortConnectionLayer
 * Demonstrates the new port-centric approach
 * Rules:
 * - Can only connect IN to OUT (not IN to IN or OUT to OUT)
 * - Cannot connect input and output of the same block
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

          // Can only connect IN to OUT
          return isValidConnection(ctx.sourcePort, ctx.targetPort);
        },
      };

      // Use new API with PortMetaKey
      this.updatePort(portId, undefined, undefined, {
        [PortConnectionLayer.PortMetaKey]: snapMeta,
      });
    });
  }
}

/**
 * Custom block with conditional snapping and data types
 * Demonstrates advanced port validation with metadata
 */
class ConditionalPortBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();

    this.state.anchors?.forEach((anchor) => {
      const portId = createAnchorPortId(this.state.id, anchor.id);
      const dataType = anchor.type === EAnchorType.IN ? "number" : "string";

      const snapMeta: IPortConnectionMeta = {
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
      this.updatePort(portId, undefined, undefined, {
        [PortConnectionLayer.PortMetaKey]: snapMeta,
        dataType: dataType,
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
        { id: "input-1", blockId: "port-block-1", type: EAnchorType.IN },
        { id: "input-2", blockId: "port-block-1", type: EAnchorType.IN },
        { id: "output-1", blockId: "port-block-1", type: EAnchorType.OUT },
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
        { id: "input-1", blockId: "port-block-2", type: EAnchorType.IN },
        { id: "output-1", blockId: "port-block-2", type: EAnchorType.OUT },
        { id: "output-2", blockId: "port-block-2", type: EAnchorType.OUT },
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
        { id: "input-1", blockId: "port-block-3", type: EAnchorType.IN },
        { id: "input-2", blockId: "port-block-3", type: EAnchorType.IN },
        { id: "output-1", blockId: "port-block-3", type: EAnchorType.OUT },
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
        { id: "input-1", blockId: "conditional-block-1", type: EAnchorType.IN },
        { id: "output-1", blockId: "conditional-block-1", type: EAnchorType.OUT },
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
        { id: "input-1", blockId: "conditional-block-2", type: EAnchorType.IN },
        { id: "output-1", blockId: "conditional-block-2", type: EAnchorType.OUT },
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
      searchRadius: 30, // Увеличенный радиус поиска портов
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
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">PortConnectionLayer Demo</Text>
          <Text variant="body-1">Демонстрация нового слоя PortConnectionLayer, работающего только с портами.</Text>
          <Text variant="body-2">
            Тяните от якоря одного блока к другому. Связь автоматически привязывается к ближайшим портам при
            приближении.
          </Text>
          <Flex direction="column" gap={1} style={{ marginTop: 8 }}>
            <Text variant="body-2">
              <strong>Правила подключения:</strong>
            </Text>
            <Text variant="body-2">• Можно соединять только IN порты с OUT портами</Text>
            <Text variant="body-2">• Нельзя соединять входные и выходные порты одного блока</Text>
            <Text variant="body-2">
              <strong>Port Blocks (верхний ряд):</strong> Используют базовую валидацию подключений через порты.
            </Text>
            <Text variant="body-2">
              <strong>Conditional Blocks (нижний ряд):</strong> Дополнительно проверяют совместимость типов данных.
            </Text>
            <Text variant="body-2" style={{ marginTop: 8, fontStyle: "italic" }}>
              <strong>Новые возможности:</strong> События теперь содержат прямые ссылки на sourcePort и targetPort, что
              дает прямой доступ к метаданным портов и их владельцам.
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
  title: "Examples/PortConnectionLayer",
  component: GraphApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
