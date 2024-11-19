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
  HitBoxData,
  TBlock,
  TConnectionProps,
  isPointInStroke,
  useGraph,
  useGraphEvents,
} from "../../../index";

import {
  ASTAR_BLOCK_MARGIN,
  ASTAR_CHANGE_DIRECTION_RATIO,
  ASTAR_LINE_MARGIN,
  ASTAR_LINE_OCCUPIED_RATIO,
  ASTAR_SEARCH_THRESHOLD,
  ASTAR_STEP,
  AstarBlockIs,
  AstarConnectionIs,
  config,
} from "./definitions";
import {
  BinaryHeap,
  getHeuristicValueByManhattanFunction,
  getOrCreateNeighbors,
  parseLinkedListToPath,
  removeIntermediatePoints,
} from "./utils";

import "@gravity-ui/uikit/styles/styles.css";

type TAstarSearchProps = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  blockMargin: number;
  step: number;
  searchThreshold: number;
  isBlockOccupied(point: GridNode, blockMargin: number): boolean;
  isLineOccupied(point: GridNode, lineMargin: number): boolean;
};

export class GridNode {
  public x: number;
  public y: number;
  public weight = 1;
  public f = 0;
  public gScore = 0;
  public heuristicValue = 0;
  public visited = false;
  public closed = false;
  public parent: GridNode | null = null;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

// http://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html#breaking-ties
// eslint-disable-next-line complexity
function aStarSearchPath({
  startX,
  startY,
  endX,
  endY,
  blockMargin,
  step,
  searchThreshold,
  isBlockOccupied,
  isLineOccupied,
}: TAstarSearchProps) {
  const gridsMap = new Map<string, GridNode>();
  const start = new GridNode(startX + blockMargin + 1, startY);
  const end = new GridNode(endX - blockMargin - 1, endY);

  if (isBlockOccupied(start, blockMargin)) return [];
  if (isBlockOccupied(end, blockMargin)) return [];

  let noPathTries = 0;
  let astarPath: GridNode[] = [];

  gridsMap.set(`${start.x}-${start.y}`, start);
  gridsMap.set(`${end.x}-${end.y}`, end);

  const openHeap = new BinaryHeap<GridNode>((node) => node.f);

  start.heuristicValue = getHeuristicValueByManhattanFunction(start, end);

  openHeap.push(start);

  while (openHeap.size() > 0) {
    noPathTries++;

    if (noPathTries > searchThreshold) {
      astarPath = [];
      break;
    }

    const currentNode = openHeap.pop();

    if (currentNode === end) {
      astarPath = parseLinkedListToPath(currentNode);
      break;
    }

    if (step !== 1) {
      const x = end.x - step * 2;
      const y = end.y - step * 2;
      const width = step * 4;
      const height = step * 4;
      // const isNear = isPointInRect(currentNode.x, currentNode.y, { x, y, width, height }, 0);
      const isNear = intersects.pointBox(currentNode.x, currentNode.y, x, y, width, height);

      if (isNear) {
        astarPath = parseLinkedListToPath(currentNode);
        break;
      }
    }

    currentNode.closed = true;

    const neighbors = getOrCreateNeighbors(gridsMap, currentNode, step);

    for (let i = 0; i < neighbors.length; ++i) {
      const neighbor = neighbors[i];

      if (neighbor.closed || isBlockOccupied(neighbor, blockMargin)) continue;

      const gScore = currentNode.gScore + neighbor.weight;
      const beenVisited = neighbor.visited;

      if (beenVisited && gScore >= neighbor.gScore) continue;

      const changedXDirection =
        neighbor.x !== currentNode.x || !currentNode.parent || neighbor.x !== currentNode.parent.x;
      const changedYDirection =
        neighbor.y !== currentNode.y || !currentNode.parent || neighbor.y !== currentNode.parent.y;
      const changedDirection = changedXDirection && changedYDirection;

      const changedDirRatio = changedDirection ? ASTAR_CHANGE_DIRECTION_RATIO : 1;
      const lineOccupiedRatio = isLineOccupied(neighbor, ASTAR_LINE_MARGIN) ? ASTAR_LINE_OCCUPIED_RATIO : 0;

      neighbor.parent = currentNode;
      neighbor.gScore = gScore;
      neighbor.heuristicValue = neighbor.heuristicValue || getHeuristicValueByManhattanFunction(neighbor, end);
      neighbor.f = neighbor.gScore + neighbor.heuristicValue + changedDirRatio + lineOccupiedRatio;

      if (!beenVisited) openHeap.push(neighbor);
      else openHeap.rescoreElement(neighbor);

      if (!neighbor.visited) neighbor.visited = true;
    }
  }

  const optimizedAstarPath = removeIntermediatePoints(astarPath);

  return optimizedAstarPath;
}

export class AstarConnection extends CanvasConnection {
  public readonly isLine = true;

  private linePath: GridNode[] = [];

  constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);
    this.updateHitBox();
    const r1 = this.sourceBlock.connectedState.$geometry.subscribe((nextGeometry) => {
      this.recalculatePath(nextGeometry, this.targetBlock.state);
    });
    const r2 = this.targetBlock.connectedState.$geometry.subscribe((nextGeometry) => {
      this.recalculatePath(this.sourceBlock.state, nextGeometry);
    });
    this.unsubscribe.push(r1, r2);

    this.context.graph.hitTest.once("update", () => {
      this.recalculatePath();
    });
  }

  private computeMinMaxConnectionPoints() {
    const points = [
      { x: this.geometry.x1, y: this.geometry.y1 },
      ...this.linePath,
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

    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT * 2;

    const isPointInPath = isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT);

    return isPointInPath;
  }

  private isBlockOccupied(point: GridNode, blockMargin: number): boolean {
    const components = this.context.graph.hitTest.testBox({
      minX: point.x - blockMargin,
      minY: point.y - blockMargin,
      maxX: point.x + blockMargin,
      maxY: point.y + blockMargin,
    });
    return components.some((component) => (component as AstarBlock)?.isBlock);
  }

  private isLineOccupied(point: GridNode, lineMargin: number): boolean {
    const components = this.context.graph.hitTest.testBox({
      minX: point.x - lineMargin,
      minY: point.y - lineMargin,
      maxX: point.x + lineMargin,
      maxY: point.y + lineMargin,
    });
    return components.some((component) => (component as AstarConnection)?.isLine);
  }

  public recalculatePath(
    sourceBlockGeometry: { x: number; y: number; width: number; height: number } = this.sourceBlock.state,
    targetBlockGeometry: { x: number; y: number; width: number; height: number } = this.targetBlock.state
  ) {
    const isBlockOccupied = this.isBlockOccupied.bind(this);
    const isLineOccupied = this.isLineOccupied.bind(this);
    const startX = sourceBlockGeometry.x + sourceBlockGeometry.width;
    const startY = sourceBlockGeometry.y + sourceBlockGeometry.height / 2;
    const endX = targetBlockGeometry.x;
    const endY = targetBlockGeometry.y + targetBlockGeometry.height / 2;

    this.linePath = aStarSearchPath({
      startX,
      startY,
      endX,
      endY,
      blockMargin: ASTAR_BLOCK_MARGIN,
      step: ASTAR_STEP,
      searchThreshold: ASTAR_SEARCH_THRESHOLD,
      isBlockOccupied,
      isLineOccupied,
    });

    this.addInRenderOrder(this.props, this.state);
  }

  public override render() {
    const startX = this.sourceBlock.state.x + this.sourceBlock.state.width;
    const startY = this.sourceBlock.state.y + this.sourceBlock.state.height / 2;
    const endX = this.targetBlock.state.x;
    const endY = this.targetBlock.state.y + this.targetBlock.state.height / 2;

    this.path2d = new Path2D();

    if (!this.linePath.length) {
      this.context.ctx.moveTo(startX, startY);
      this.path2d.moveTo(startX, startY);

      this.context.ctx.lineTo(endX, endY);
      this.path2d.lineTo(endX, endY);

      return;
    }

    this.context.ctx.moveTo(startX, startY);
    this.path2d.moveTo(startX, startY);

    this.context.ctx.lineTo(startX + ASTAR_BLOCK_MARGIN, startY);
    this.path2d.lineTo(startX + ASTAR_BLOCK_MARGIN, startY);

    for (let i = 0; i < this.linePath.length; i++) {
      this.context.ctx.lineTo(this.linePath[i].x, this.linePath[i].y);
      this.path2d.lineTo(this.linePath[i].x, this.linePath[i].y);
    }

    this.context.ctx.lineTo(this.linePath[this.linePath.length - 1].x, endY);
    this.path2d.lineTo(this.linePath[this.linePath.length - 1].x, endY);

    this.context.ctx.lineTo(endX, endY);
    this.path2d.lineTo(endX, endY);
  }
}

export class AstarBlock extends CanvasBlock {
  protected override onDragEnd(event: MouseEvent) {
    super.onDragEnd(event);

    // force update without batching waiting
    this.updateHitBox(this.state, true);

    const components = this.context.graph.hitTest.testBox({
      minX: this.state.x,
      minY: this.state.y,
      maxX: this.state.x + this.state.width,
      maxY: this.state.y + this.state.height,
    });

    const lineComponents = components.filter((component) => component instanceof AstarConnection);

    lineComponents.forEach((lineComponent) => {
      lineComponent.recalculatePath();
    });
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
      connectionComponents: { [AstarConnectionIs]: AstarConnection },
      blockComponents: { [AstarBlockIs]: AstarBlock },
    });

    toaster.add({
      isClosable: true,
      title: "A-star connections",
      name: "astarConnections",
      content: "Just drag blocks - connections will try to bypass the obstacles.",
      autoHiding: false,
      type: "info",
    });

    return () => toaster.remove("astarConnections");
  }, []);

  return (
    <ThemeProvider theme={"light"}>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/AstarConnection",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;
