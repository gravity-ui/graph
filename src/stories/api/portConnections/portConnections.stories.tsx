import React, { useLayoutEffect } from "react";

import { Text, ThemeProvider } from "@gravity-ui/uikit";
import { computed } from "@preact/signals-core";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Anchor, TAnchor } from "../../../components/canvas/anchors";
import { Block as CanvasBlock, TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState, TGraphConfig } from "../../../graph";
import {
  GraphBlock,
  GraphBlockAnchor,
  GraphCanvas,
  useComputedSignal,
  useGraph,
  useGraphEvent,
} from "../../../react-components";
import { cn } from "../../../react-components/utils/cn";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { TConnection } from "../../../store/connection/ConnectionState";
import { PortState, TPortId } from "../../../store/connection/port/Port";
import { createAnchorPortId, createBlockPointPortId } from "../../../store/connection/port/utils";
import { storiesSettings } from "../../configurations/definitions";

import "./portConnections.css";
import "@gravity-ui/uikit/styles/styles.css";

const HIGHLIGHT_COLOR = "#2E9AFF";

/**
 * Whether any connection that ends on the port is selected.
 * Reads `port.$connections`, so a computed over it depends only on this port's connections.
 */
function hasSelectedConnection(port: PortState | undefined): boolean {
  if (!port) {
    return false;
  }
  for (const connection of port.$connections.value) {
    if (connection.$selected.value) {
      return true;
    }
  }
  return false;
}

/** Canvas anchor that draws an extra ring while a connection on its port is selected. */
class EndpointHighlightAnchor extends Anchor {
  private endpointHighlighted = false;

  protected override willMount(): void {
    super.willMount();
    this.subscribeSignal(
      computed(() => hasSelectedConnection(this.props.port)),
      (highlighted) => {
        this.endpointHighlighted = highlighted;
        this.performRender();
      }
    );
  }

  protected override render(): void {
    super.render();
    if (!this.endpointHighlighted) {
      return;
    }
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return;
    }
    const { x, y } = this.getPosition();
    const ctx = this.context.ctx;
    ctx.beginPath();
    ctx.arc(x, y, this.state.size * 0.5 + this.props.lineWidth + 4, 0, 2 * Math.PI);
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
  }
}

/**
 * Canvas block that strokes its border while a connection on one of its block points is selected,
 * and renders its anchors with {@link EndpointHighlightAnchor}.
 */
class EndpointHighlightBlock extends CanvasBlock {
  private endpointHighlighted = false;

  protected override willMount(): void {
    super.willMount();
    const inputPort = this.getInputPort();
    const outputPort = this.getOutputPort();
    this.subscribeSignal(
      computed(() => hasSelectedConnection(inputPort) || hasSelectedConnection(outputPort)),
      (highlighted) => {
        this.endpointHighlighted = highlighted;
        this.performRender();
      }
    );
  }

  protected override renderAnchor(anchor: TAnchor) {
    return EndpointHighlightAnchor.create(
      {
        ...anchor,
        zIndex: this.zIndex,
        size: 18,
        lineWidth: 2,
        port: this.getAnchorPort(anchor.id),
      },
      {
        key: anchor.id,
      }
    );
  }

  protected override render(): void {
    super.render();
    if (!this.endpointHighlighted) {
      return;
    }
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return;
    }
    this.renderStroke(HIGHLIGHT_COLOR);
  }
}

/** React counterpart for the detailed level: looks the port up by id. */
function useHasSelectedConnection(graph: Graph, portId: TPortId): boolean {
  return useComputedSignal(
    () => hasSelectedConnection(graph.rootStore.connectionsList.getPort(portId)),
    [graph, portId]
  );
}

function EndpointHighlightReactAnchor({ graph, anchor }: { graph: Graph; anchor: TAnchor }) {
  const highlighted = useHasSelectedConnection(graph, createAnchorPortId(anchor.blockId, anchor.id));
  return (
    <GraphBlockAnchor
      className={cn("port-connections-anchor", { "port-connections-endpoint": highlighted })}
      position="absolute"
      graph={graph}
      anchor={anchor}
    />
  );
}

function EndpointHighlightReactBlock({ graph, block }: { graph: Graph; block: TBlock }) {
  const inputHighlighted = useHasSelectedConnection(graph, createBlockPointPortId(block.id, true));
  const outputHighlighted = useHasSelectedConnection(graph, createBlockPointPortId(block.id, false));
  return (
    <GraphBlock
      graph={graph}
      block={block}
      className={cn("port-connections-block", {
        "port-connections-endpoint": inputHighlighted || outputHighlighted,
      })}
    >
      <Text className="port-connections-block-name" variant="header-1">
        {block.name}
      </Text>
      {block.anchors?.map((anchor) => <EndpointHighlightReactAnchor key={anchor.id} graph={graph} anchor={anchor} />)}
    </GraphBlock>
  );
}

const BLOCK_IS = "endpoint-highlight-block";

function createBlock(id: string, x: number, y: number, anchors: Array<Omit<TAnchor, "blockId">>): TBlock {
  return {
    is: BLOCK_IS,
    id,
    name: `Block ${id}`,
    x,
    y,
    width: 200,
    height: 160,
    selected: false,
    anchors: anchors.map((anchor) => ({ ...anchor, blockId: id })),
  };
}

const blocks: TBlock[] = [
  createBlock("A", 100, 150, [
    { id: "out-1", type: EAnchorType.OUT },
    { id: "out-2", type: EAnchorType.OUT },
  ]),
  createBlock("B", 500, 0, [{ id: "in-1", type: EAnchorType.IN }]),
  createBlock("C", 500, 300, [{ id: "in-1", type: EAnchorType.IN }]),
  createBlock("D", 900, 150, []),
];

const connections: TConnection[] = [
  // anchor → anchor
  { id: "A/out-1 → B/in-1", sourceBlockId: "A", sourceAnchorId: "out-1", targetBlockId: "B", targetAnchorId: "in-1" },
  { id: "A/out-2 → C/in-1", sourceBlockId: "A", sourceAnchorId: "out-2", targetBlockId: "C", targetAnchorId: "in-1" },
  // anchor → block point
  { id: "A/out-1 → D", sourceBlockId: "A", sourceAnchorId: "out-1", targetBlockId: "D" },
  // block point → block point
  { id: "B → D", sourceBlockId: "B", targetBlockId: "D" },
  { id: "C → D", sourceBlockId: "C", targetBlockId: "D" },
];

const config: TGraphConfig = {
  settings: {
    ...storiesSettings,
    canCreateNewConnections: false,
    blockComponents: {
      [BLOCK_IS]: EndpointHighlightBlock,
    },
  },
};

const PortConnectionsDemo = () => {
  const { graph, setEntities, start } = useGraph(config);

  useLayoutEffect(() => {
    setEntities({ blocks, connections });
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 200 });
    }
  });

  const renderBlock = useFn((graphObject: Graph, block: TBlock) => {
    return <EndpointHighlightReactBlock graph={graphObject} block={block} />;
  });

  return (
    <ThemeProvider theme="dark">
      <div style={{ padding: "16px 16px 8px", fontFamily: "sans-serif", fontSize: "14px" }}>
        <strong>Highlight endpoints of selected connections (PortState.$connections)</strong>
        <p style={{ margin: "4px 0 12px", opacity: 0.7 }}>
          Click a connection (Cmd/Ctrl+click to select several). Anchors and blocks whose port has a selected connection
          are outlined — on canvas and in the detailed React view.
        </p>
      </div>
      <div style={{ height: "600px", ["--port-connections-highlight" as string]: HIGHLIGHT_COLOR }}>
        <GraphCanvas className="graph" graph={graph} renderBlock={renderBlock} />
      </div>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/PortConnections",
  component: PortConnectionsDemo,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const HighlightSelectedConnectionEndpoints: StoryFn = () => <PortConnectionsDemo />;
