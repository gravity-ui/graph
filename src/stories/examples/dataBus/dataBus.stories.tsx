import React, { useCallback, useEffect } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import { toaster } from "@gravity-ui/uikit/toaster-singleton-react-18";
import type { Meta, StoryFn } from "@storybook/react";
import intersects from "intersects";

import {
  CanvasBlock,
  CanvasConnection,
  Graph,
  GraphBlock,
  GraphCanvas,
  GraphLayer,
  GraphState,
  TBlock,
  TBlockProps,
  TConnectionProps,
  TPoint,
  useGraph,
  useGraphEvents,
} from "../../../index";

import { DATA_BUS_MAGNETIC_DISTANCE, DataBusBlockIs, DataBusConnectionIs, TDataBusBlock, config } from "./definitions";

import "@gravity-ui/uikit/styles/styles.css";

class DataBusConnection extends CanvasConnection {
  public sourceBusBlock: DataBusBlock;

  public targetBusBlock: DataBusBlock;

  public cachedGeometry: { x1: number; x2: number; y1: number; y2: number };

  private shouldRecalculatePositionOnBus = false;

  constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);

    this.updateHitBox();

    const r1 = this.sourceBlock.connectedState.$geometry.subscribe(() => (this.shouldRecalculatePositionOnBus = true));
    const r2 = this.targetBlock.connectedState.$geometry.subscribe(() => (this.shouldRecalculatePositionOnBus = true));

    this.unsubscribe.push(r1, r2);
  }

  public updateBusBlocks(sourceBusBlock?: DataBusBlock, targetBusBlock?: DataBusBlock) {
    const alreadyCachedGeometry = Boolean(this.cachedGeometry);
    const trappedByBusBlock = Boolean(sourceBusBlock || targetBusBlock);

    this.sourceBusBlock = sourceBusBlock;
    this.targetBusBlock = targetBusBlock;

    if (!alreadyCachedGeometry && trappedByBusBlock) {
      this.cachedGeometry = { ...this.geometry };
    }

    if (alreadyCachedGeometry && !trappedByBusBlock) {
      this.cachedGeometry = undefined;
    }

    this.addInRenderOrder(this.props, this.state);
  }

  public override updateGeometry(sourceBlock: CanvasBlock, targetBlock: CanvasBlock) {
    const scale = this.context.camera.getCameraScale();
    const isSchematicView = scale < this.context.constants.connection.SCALES[1];
    const isUseAnchors = this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors");
    const shouldRecalculateStartPosition = this.shouldRecalculatePositionOnBus && this.sourceBusBlock;
    const shouldRecalculateEndPosition = this.shouldRecalculatePositionOnBus && this.targetBusBlock;

    let sourcePos: TPoint | undefined;
    let targetPos: TPoint | undefined;

    if (!isSchematicView && isUseAnchors && this.sourceAnchor) {
      sourcePos = sourceBlock.getConnectionAnchorPosition(this.sourceAnchor);
    }

    if (!isSchematicView && isUseAnchors && this.targetAnchor) {
      targetPos = targetBlock.getConnectionAnchorPosition(this.targetAnchor);
    }

    if (!this.sourceAnchor) {
      sourcePos = sourceBlock.getConnectionPoint("out");
    }

    if (!this.targetAnchor) {
      targetPos = targetBlock.getConnectionPoint("in");
    }

    if (isSchematicView) {
      sourcePos = sourceBlock.getConnectionPoint("out");
      targetPos = targetBlock.getConnectionPoint("in");
    }

    const isPositionSet = sourcePos && targetPos;

    if (shouldRecalculateStartPosition && isPositionSet) {
      this.geometry.x1 = sourcePos.x;
      this.geometry.y1 = sourcePos.y;
      this.geometry.x2 = targetPos.x;
      this.geometry.y2 = targetPos.y;

      this.sourceBusBlock.resortTrappedConnections();

      this.shouldRecalculatePositionOnBus = false;
    }

    if (shouldRecalculateEndPosition && isPositionSet) {
      this.geometry.x1 = sourcePos.x;
      this.geometry.y1 = sourcePos.y;
      this.geometry.x2 = targetPos.x;
      this.geometry.y2 = targetPos.y;

      this.targetBusBlock.resortTrappedConnections();

      this.shouldRecalculatePositionOnBus = false;
    }

    if (this.sourceBusBlock) {
      sourcePos = this.sourceBusBlock.getBusConnectionPoint("out", this);
    }

    if (this.targetBusBlock) {
      targetPos = this.targetBusBlock.getBusConnectionPoint("in", this);
    }

    if (isPositionSet) {
      this.geometry.x1 = sourcePos.x;
      this.geometry.y1 = sourcePos.y;
      this.geometry.x2 = targetPos.x;
      this.geometry.y2 = targetPos.y;
    }
  }
}

export class DataBusBlock extends CanvasBlock<TDataBusBlock> {
  constructor(props: TBlockProps, parent: GraphLayer) {
    super(props, parent);

    this.context.graph.hitTest.once("update", () => {
      this.updateTrappedConnections();
    });
  }

  private trappedConnections: DataBusConnection[] = [];

  private parentBlock: CanvasBlock;

  protected override onDragEnd(event: MouseEvent) {
    super.onDragEnd(event);

    // force update hitBox for immediate recalculation of the position of the links
    this.updateHitBox(this.state, true);

    this.updateTrappedConnections();
  }

  public updateTrappedConnections() {
    this.trappedConnections = [];

    const minX = this.state.x - DATA_BUS_MAGNETIC_DISTANCE;
    const minY = this.state.y - DATA_BUS_MAGNETIC_DISTANCE;
    const maxX = this.state.x + this.state.width + DATA_BUS_MAGNETIC_DISTANCE;
    const maxY = this.state.y + this.state.height + DATA_BUS_MAGNETIC_DISTANCE;

    const components = this.context.graph.hitTest.testBox({ minX, minY, maxX, maxY });

    const newTrappedConnections = components.filter((component) => component instanceof DataBusConnection);

    if (this.state.meta.type === "IN") {
      const parentConnection = newTrappedConnections.find((connection) => connection.targetBlock === this);
      this.parentBlock = parentConnection?.sourceBlock;
    }

    if (this.state.meta.type === "OUT") {
      const parentConnection = newTrappedConnections.find((connection) => connection.sourceBlock === this);
      this.parentBlock = parentConnection?.targetBlock;
    }

    newTrappedConnections.forEach((lineComponent) => {
      if (lineComponent.sourceBlock === this) return;
      if (lineComponent.targetBlock === this) return;
      if (lineComponent.sourceBlock !== this.parentBlock && lineComponent.targetBlock !== this.parentBlock) return;

      const isInTrap = intersects.lineBox(
        lineComponent.cachedGeometry?.x1 || lineComponent.geometry.x1,
        lineComponent.cachedGeometry?.y1 || lineComponent.geometry.y1,
        lineComponent.cachedGeometry?.x2 || lineComponent.geometry.x2,
        lineComponent.cachedGeometry?.y2 || lineComponent.geometry.y2,
        this.state.x - DATA_BUS_MAGNETIC_DISTANCE,
        this.state.y - DATA_BUS_MAGNETIC_DISTANCE,
        this.state.width + DATA_BUS_MAGNETIC_DISTANCE * 2,
        this.state.height + DATA_BUS_MAGNETIC_DISTANCE * 2
      );

      const sourceBusBlock = this.state.meta.type === "IN" && isInTrap ? this : undefined;
      const targetBusBlock = this.state.meta.type === "OUT" && isInTrap ? this : undefined;

      lineComponent.updateBusBlocks(sourceBusBlock, targetBusBlock);

      if (isInTrap) this.trappedConnections.push(lineComponent);
    });

    this.resortTrappedConnections();
  }

  public resortTrappedConnections() {
    if (this.state.meta.type === "IN" && this.state.meta.direction === "VERTICAL") {
      this.trappedConnections.sort((a, b) => a.geometry.y2 - b.geometry.y2);
    }

    if (this.state.meta.type === "IN" && this.state.meta.direction === "HORIZONTAL") {
      this.trappedConnections.sort((a, b) => a.geometry.x2 - b.geometry.x2);
    }

    if (this.state.meta.type === "OUT" && this.state.meta.direction === "VERTICAL") {
      this.trappedConnections.sort((a, b) => a.geometry.y1 - b.geometry.y1);
    }

    if (this.state.meta.type === "OUT" && this.state.meta.direction === "HORIZONTAL") {
      this.trappedConnections.sort((a, b) => a.geometry.x1 - b.geometry.x1);
    }
  }

  public getBusConnectionPoint(direction: "in" | "out", connectionComponent: DataBusConnection): TPoint {
    const connectionIndex = this.trappedConnections.indexOf(connectionComponent);

    if (connectionIndex === -1) return { x: 0, y: 0 };

    const interval = this.state.height / this.trappedConnections.length;
    const x = this.state.x + (direction === "out" ? this.state.width : 0);
    const y = this.state.y + interval * connectionIndex + interval / 2;

    return { x, y };
  }
}

const GraphApp = () => {
  const { graph, setEntities, start, setSettings } = useGraph({
    settings: config.settings,
    layers: config.layers,
    viewConfiguration: {
      constants: { block: { HEAD_HEIGHT: 0 } },
    },
  });

  useGraphEvents(graph, {
    onStateChanged: ({ state }) => {
      if (state === GraphState.ATTACHED) {
        start();
        graph.zoomTo("center", { padding: 300 });
      }
    },
  });

  const renderBlockFn = useCallback((currentGraph: Graph, block: TBlock) => {
    return (
      <GraphBlock graph={currentGraph} block={block}>
        <Flex justifyContent={"center"} alignItems={"center"} style={{ width: "100%", height: "100%" }}>
          <Text>{block.name}</Text>
        </Flex>
      </GraphBlock>
    );
  }, []);

  //set graph entities on load
  useEffect(() => {
    setEntities({ blocks: config.blocks, connections: config.connections });
    //when graph update blocks and connections
    //it also update hitTests for tracking click events on it
    //so after update we can catch first "update" event for zooming graph in usable rectangle
    //this mean that graph loaded all blocks and calculated it (usable rectangle)
    graph.hitTest.once("update", () => {
      graph.zoomTo("center", { padding: 300 });
    });
  }, [setEntities]);

  //set config for custom connections
  useEffect(() => {
    setSettings({
      connectionComponents: { [DataBusConnectionIs]: DataBusConnection },
      blockComponents: { [DataBusBlockIs]: DataBusBlock },
    });

    toaster.add({
      isClosable: true,
      title: "Data Bus connections",
      name: "dataBusConnections",
      content: (
        <Flex direction={"column"}>
          <span>Drag Bus blocks - connections will update their start/end points automatically after drag end.</span>
          <span>Drag blocks - connections will be resorted.</span>
        </Flex>
      ),
      autoHiding: false,
      type: "info",
    });

    return () => toaster.remove("dataBusConnections");
  }, []);

  return (
    <ThemeProvider theme={"light"}>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/DataBus",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
