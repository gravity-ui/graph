import React, { useCallback, useEffect } from "react";

import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import { toaster } from "@gravity-ui/uikit/toaster-singleton-react-18";
import type { Meta, StoryFn } from "@storybook/react";

import {
  CanvasConnection,
  EVENTS,
  Graph,
  GraphBlock,
  GraphCanvas,
  GraphLayer,
  GraphState,
  HitBoxData,
  TBlock,
  TConnection,
  TConnectionProps,
  addEventListeners,
  dragListener,
  isPointInStroke,
  useGraph,
  useGraphEvents,
} from "../../../index";

import { POLYLINE_POINT_RADIUS, PolylineConnectionIs, config } from "./definitions";

import "@gravity-ui/uikit/styles/styles.css";

function isPointInCircle(point: { x: number; y: number }, center: { x: number; y: number }, radius: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return dx * dx + dy * dy <= radius * radius;
}

type TLinePoint = { x: number; y: number; virtual?: boolean };

type TDraggingOptions = {
  addInRenderOrder: () => void;
  linePointIndex?: number;
  isLineSelected: () => boolean;
};

class PolylineConnection extends CanvasConnection {
  private linePoints: TLinePoint[] = [];
  private draggingOptions: TDraggingOptions = {
    addInRenderOrder: () => this.addInRenderOrder(this.props, this.state),
    isLineSelected: () => this.state.selected,
  };

  constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);

    this.updateHitBox();

    const linePoints = this.linePoints;
    const context = this.context;
    const draggingOptions = this.draggingOptions;
    const geometry = this.geometry;

    addEventListeners(this, {
      mousedown(event: MouseEvent) {
        const isLineSelected = draggingOptions.isLineSelected();

        if (!isLineSelected) return;

        event.stopPropagation();

        dragListener(this.context.ownerDocument)
          .on(EVENTS.DRAG_START, (_event: MouseEvent) => {
            const position = context.graph.getPointInCameraSpace(_event);

            for (let i = 0; i < linePoints.length; i++) {
              const isPointInPath = isPointInCircle(position, linePoints[i], POLYLINE_POINT_RADIUS);

              if (!isPointInPath) continue;

              draggingOptions.linePointIndex = i;

              break;
            }

            const currentPoint = linePoints[draggingOptions.linePointIndex];
            const prevPoint =
              draggingOptions.linePointIndex === 0
                ? { x: geometry.x1, y: geometry.y1, virtual: false }
                : linePoints[draggingOptions.linePointIndex - 1];
            const nextPoint =
              draggingOptions.linePointIndex === linePoints.length - 1
                ? { x: geometry.x2, y: geometry.y2, virtual: false }
                : linePoints[draggingOptions.linePointIndex + 1];

            currentPoint.virtual = false;

            if (prevPoint.virtual && nextPoint.virtual) return;

            linePoints.splice(draggingOptions.linePointIndex + 1, 0, {
              x: (nextPoint.x + currentPoint.x) / 2,
              y: (nextPoint.y + currentPoint.y) / 2,
              virtual: true,
            });
            linePoints.splice(draggingOptions.linePointIndex, 0, {
              x: (prevPoint.x + currentPoint.x) / 2,
              y: (prevPoint.y + currentPoint.y) / 2,
              virtual: true,
            });

            draggingOptions.linePointIndex++;
          })
          .on(EVENTS.DRAG_UPDATE, (_event: MouseEvent) => {
            if (draggingOptions.linePointIndex === undefined) return;

            const linePoint = linePoints[draggingOptions.linePointIndex];
            const position = context.graph.getPointInCameraSpace(_event);

            linePoint.x = position.x;
            linePoint.y = position.y;

            draggingOptions.addInRenderOrder();
          })
          .on(EVENTS.DRAG_END, (_event: MouseEvent) => {
            draggingOptions.linePointIndex = undefined;
          });
      },
    });
  }

  public override computeRenderSettings(props: PolylineConnection, nextState: TConnection & { hovered: boolean }) {
    const defaultSettings = super.computeRenderSettings(props, nextState);
    defaultSettings.fillStyle = defaultSettings.strokeStyle;

    return defaultSettings;
  }

  private computeMinMaxConnectionPoints() {
    const points = [
      { x: this.geometry.x1, y: this.geometry.y1 },
      ...this.linePoints,
      { x: this.geometry.x2, y: this.geometry.y2 },
    ];
    const xArrays = points.map((point) => point.x);
    xArrays.push(this.geometry.x1, this.geometry.x2);
    const yArrays = points.map((point) => point.y);
    yArrays.push(this.geometry.x1, this.geometry.x2);
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

    const isPointInPath = isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, 10);

    return isComponentDrawn && isPointInPath;
  }

  public override render() {
    this.updateGeometry(this.sourceBlock, this.targetBlock);
    this.path2d = new Path2D();

    if (this.linePoints.length === 0) {
      const x = (this.geometry.x1 + this.geometry.x2) / 2;
      const y = (this.geometry.y1 + this.geometry.y2) / 2;
      this.linePoints.push({ x, y, virtual: true });
    }

    const points = [
      { x: this.geometry.x1, y: this.geometry.y1 },
      ...this.linePoints,
      { x: this.geometry.x2, y: this.geometry.y2 },
    ];

    this.context.ctx.moveTo(points[0].x, points[0].y);
    this.path2d.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i += 2) {
      const currentPoint = points[i];
      const nextVirtualPoint = points[i + 1];
      const nextPoint = points[i + 2];

      nextVirtualPoint.x = (currentPoint.x + nextPoint.x) / 2;
      nextVirtualPoint.y = (currentPoint.y + nextPoint.y) / 2;

      this.context.ctx.moveTo(currentPoint.x, currentPoint.y);
      this.path2d.moveTo(currentPoint.x, currentPoint.y);

      this.context.ctx.lineTo(nextPoint.x, nextPoint.y);
      this.path2d.lineTo(nextPoint.x, nextPoint.y);

      if (!this.state.selected) continue;

      this.context.ctx.moveTo(nextVirtualPoint.x, nextVirtualPoint.y);
      this.path2d.moveTo(nextVirtualPoint.x, nextVirtualPoint.y);

      this.context.ctx.arc(nextVirtualPoint.x, nextVirtualPoint.y, POLYLINE_POINT_RADIUS, 0, 2 * Math.PI);
      this.path2d.arc(nextVirtualPoint.x, nextVirtualPoint.y, POLYLINE_POINT_RADIUS, 0, 2 * Math.PI);

      if (i + 2 === points.length - 1) continue;

      this.context.ctx.moveTo(nextPoint.x, nextPoint.y);
      this.path2d.moveTo(nextPoint.x, nextPoint.y);

      this.context.ctx.arc(nextPoint.x, nextPoint.y, POLYLINE_POINT_RADIUS, 0, 2 * Math.PI);
      this.path2d.arc(nextPoint.x, nextPoint.y, POLYLINE_POINT_RADIUS, 0, 2 * Math.PI);
    }
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
      connectionComponents: { [PolylineConnectionIs]: PolylineConnection },
    });

    toaster.add({
      isClosable: true,
      title: "Polyline connections",
      name: "polylineConnections",
      content: "Just select connection and drag the intermediate point on it",
      autoHiding: false,
      type: "info",
    });

    return () => toaster.remove("polylineConnections");
  }, []);

  return (
    <ThemeProvider theme={"light"}>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/PolylineConnection",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
