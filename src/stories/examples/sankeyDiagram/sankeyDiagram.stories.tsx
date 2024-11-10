import React, { useCallback, useEffect } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import {
  CanvasConnection,
  Graph,
  GraphBlock,
  GraphCanvas,
  GraphLayer,
  GraphState,
  HitBoxData,
  TBlock,
  TConnection,
  TConnectionProps,
  generateBezierParams,
  useGraph,
  useGraphEvents,
} from "../../../index";

import { SankeyConnectionIs, config } from "./definitions";

import "@gravity-ui/uikit/styles/styles.css";

class SankeyConnection extends CanvasConnection {
  private topLineGeometry = { x1: 0, y1: 0, x2: 0, y2: 0 };
  private bottomLineGeometry = { x1: 0, y1: 0, x2: 0, y2: 0 };

  constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);
    this.updateHitBox();
  }

  public override computeRenderSettings(props: SankeyConnection, nextState: TConnection & { hovered: boolean }) {
    const defaultSettings = super.computeRenderSettings(props, nextState);

    defaultSettings.fillStyle = "rgba(54, 151, 241, 0.15)";
    if (nextState.hovered) defaultSettings.fillStyle = "rgba(54, 151, 241, 0.3)";
    if (nextState.selected) defaultSettings.fillStyle = "rgb(233, 174, 86)";

    const { strokeStyle: _strokeStyle, ...renderSettings } = defaultSettings;

    return renderSettings;
  }

  private computeMinMaxConnectionPoints() {
    const xArrays = [
      this.topLineGeometry.x1,
      this.topLineGeometry.x2,
      this.bottomLineGeometry.x1,
      this.bottomLineGeometry.x2,
    ];
    const yArrays = [
      this.topLineGeometry.y1,
      this.topLineGeometry.y2,
      this.bottomLineGeometry.y1,
      this.bottomLineGeometry.y2,
    ];
    const topLeftX = Math.min(...xArrays);
    const topLeftY = Math.min(...yArrays);
    const bottomRightX = Math.max(...xArrays);
    const bottomRightY = Math.max(...yArrays);

    return { topLeftX, topLeftY, bottomRightX, bottomRightY };
  }

  public override isConnectionVisible() {
    const { bottomRightX, bottomRightY, topLeftX, topLeftY } = this.computeMinMaxConnectionPoints();

    const isLineRectVisible = this.context.camera.isRectVisible(
      topLeftX,
      topLeftY,
      bottomRightX - topLeftX,
      bottomRightY - topLeftY
    );

    return isLineRectVisible;
  }

  public override calculateHitBoxHash() {
    const { bottomRightX, bottomRightY, topLeftX, topLeftY } = this.computeMinMaxConnectionPoints();

    const hash = topLeftX + topLeftY + bottomRightX + bottomRightY;

    return hash;
  }

  public override updateHitBox = () => {
    const { bottomRightX, bottomRightY, topLeftX, topLeftY } = this.computeMinMaxConnectionPoints();

    this.setHitBox(topLeftX, topLeftY, bottomRightX, bottomRightY);
  };

  public override onHitBox(shape: HitBoxData): boolean {
    const isComponentDrawn = this.isIterated();

    if (!isComponentDrawn) return false;
    if (!this.path2d) return false;

    const isPointInPath = this.context.ctx.isPointInPath(this.path2d, shape.x, shape.y);

    return isComponentDrawn && isPointInPath;
  }

  public override render() {
    const mode = "horizontal";

    const sourceAnchorId = this.sourceAnchor.id;
    const sourceBlock = this.connectedState.$sourceBlock.value;
    const sourceBlockGeometry = sourceBlock.$geometry.value;
    const sourceBlockOutAnchors = sourceBlock.$anchors.value.filter((anchor) => anchor.type === "OUT");
    const sourceBlockOutAnchorsCount = sourceBlockOutAnchors.length;
    const sourceBlockAnchorIndex = sourceBlockOutAnchors.findIndex((anchor) => anchor.id === sourceAnchorId);
    const sourceFlowHeight = sourceBlockGeometry.height / sourceBlockOutAnchorsCount;

    const targetAnchorId = this.targetAnchor.id;
    const targetBlock = this.connectedState.$targetBlock.value;
    const targetBlockGeometry = targetBlock.$geometry.value;
    const targetBlockInAnchors = targetBlock.$anchors.value.filter((anchor) => anchor.type === "IN");
    const targetBlockInAnchorsCount = targetBlockInAnchors.length;
    const targetBlockAnchorIndex = targetBlockInAnchors.findIndex((anchor) => anchor.id === targetAnchorId);
    const targetFlowHeight = targetBlockGeometry.height / targetBlockInAnchorsCount;

    const topRightX = sourceBlockGeometry.x + sourceBlockGeometry.width;
    const topRightY = sourceBlockGeometry.y + sourceFlowHeight * sourceBlockAnchorIndex;
    const bottomRightX = sourceBlockGeometry.x + sourceBlockGeometry.width;
    const bottomRightY = sourceBlockGeometry.y + sourceFlowHeight * (sourceBlockAnchorIndex + 1);
    const topLeftX = targetBlockGeometry.x;
    const topLeftY = targetBlockGeometry.y + targetFlowHeight * targetBlockAnchorIndex;
    const bottomLeftX = targetBlockGeometry.x;
    const bottomLeftY = targetBlockGeometry.y + targetFlowHeight * (targetBlockAnchorIndex + 1);

    const path = new Path2D();
    const ctx = this.context.ctx;

    const [topStart, topFirstPoint, topSecondPoint, topEnd] = generateBezierParams(
      { x: topRightX, y: topRightY },
      { x: topLeftX, y: topLeftY },
      mode
    );

    const [bottomStart, bottomFirstPoint, bottomSecondPoint, bottomEnd] = generateBezierParams(
      { x: bottomRightX, y: bottomRightY },
      { x: bottomLeftX, y: bottomLeftY },
      mode
    );

    this.topLineGeometry = {
      x1: topStart.x,
      y1: topStart.y,
      x2: topEnd.x,
      y2: topEnd.y,
    };
    this.bottomLineGeometry = {
      x1: bottomStart.x,
      y1: bottomStart.y,
      x2: bottomEnd.x,
      y2: bottomEnd.y,
    };

    path.moveTo(topStart.x, topStart.y);
    ctx.moveTo(topStart.x, topStart.y);

    path.bezierCurveTo(topFirstPoint.x, topFirstPoint.y, topSecondPoint.x, topSecondPoint.y, topEnd.x, topEnd.y);
    ctx.bezierCurveTo(topFirstPoint.x, topFirstPoint.y, topSecondPoint.x, topSecondPoint.y, topEnd.x, topEnd.y);

    path.lineTo(bottomEnd.x, bottomEnd.y);
    ctx.lineTo(bottomEnd.x, bottomEnd.y);

    path.bezierCurveTo(
      bottomSecondPoint.x,
      bottomSecondPoint.y,
      bottomFirstPoint.x,
      bottomFirstPoint.y,
      bottomStart.x,
      bottomStart.y
    );
    ctx.bezierCurveTo(
      bottomSecondPoint.x,
      bottomSecondPoint.y,
      bottomFirstPoint.x,
      bottomFirstPoint.y,
      bottomStart.x,
      bottomStart.y
    );

    path.closePath();
    ctx.closePath();

    this.path2d = path;
  }
}

const GraphApp = () => {
  const { graph, setEntities, setSettings, start } = useGraph({
    settings: config.settings,
    layers: config.layers,
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
      connectionComponents: { [SankeyConnectionIs]: SankeyConnection },
    });
  }, []);

  return (
    <ThemeProvider theme={"light"}>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/SankeyDiagram",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
