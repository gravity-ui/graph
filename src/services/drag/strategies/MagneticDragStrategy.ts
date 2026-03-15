import { signal } from "@preact/signals-core";

import type { GraphComponent } from "../../../components/canvas/GraphComponent";
import type { Graph } from "../../../graph";
import type { DragContext, DragDiff } from "../types";

import type { DragStrategy, MagneticDragStrategyOptions, MagneticSnapLine, MagneticUpdateDetail } from "./types";

declare module "../../../graphEvents" {
  interface GraphEventsDefinitions {
    "magnetic-start": (event: CustomEvent<{ strategy: MagneticDragStrategy }>) => void;
    "magnetic-end": (event: CustomEvent<{ strategy: MagneticDragStrategy }>) => void;
  }
}

type Rect = { x: number; y: number; width: number; height: number };

type SnapCandidate = {
  axis: "x" | "y";
  diff: number;
  distance: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  targetEdge: "left" | "right" | "top" | "bottom";
  targetEdgeRect: { x: number; y: number; width: number; height: number };
};

const DEFAULT_OPTIONS: Required<MagneticDragStrategyOptions> = {
  minDistanceToSnap: 15,
  maxDistanceToSnap: 25,
  hysteresisDistance: 45,
  neighborTypes: [],
  gridSize: 1,
  neighborSearchPadding: 50,
};

/**
 * Interface for components that expose drag start position (used by MagneticDragStrategy).
 * Block implements this via getDragStartPosition().
 */
export interface IWithDragStartPosition {
  getDragStartPosition(): [number, number] | undefined;
}

function getDragStartPosition(component: GraphComponent): [number, number] | undefined {
  if ("getDragStartPosition" in component && typeof component.getDragStartPosition === "function") {
    return component.getDragStartPosition();
  }
  return undefined;
}

function euclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Magnetic snapping strategy. Snaps block to neighbors by edges, centers, and edge midpoints.
 * Uses Euclidean distance for priority, drag direction for ties, and hysteresis to avoid jumping.
 */
export class MagneticDragStrategy implements DragStrategy {
  private magneticStarted = false;

  private graph: Graph | null = null;

  /** Last snapped position (for hysteresis). Null when not snapped. */
  private lastSnap: { diffX: number; diffY: number } | null = null;

  /** Signal with current snap data. Subscribe for visualization updates. Null when no snap. */
  public readonly $snapData = signal<MagneticUpdateDetail | null>(null);

  private readonly options: Required<MagneticDragStrategyOptions>;

  constructor(options: MagneticDragStrategyOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  public apply(diff: DragDiff, context: DragContext, component: GraphComponent): void {
    const graph = component.context?.graph;
    if (!graph) return;

    const startPos = getDragStartPosition(component);
    if (!startPos) {
      this.applyGridFallback(diff);
      return;
    }

    const [startX, startY] = startPos;
    const hitBox = component.getHitBox();
    const [blockX, blockY, width, height] = hitBox;

    // Use block geometry: proposed position = current block position + delta (not mouse coords)
    const proposedRect: Rect = {
      x: blockX + diff.deltaX,
      y: blockY + diff.deltaY,
      width,
      height,
    };

    const neighbors = this.getNeighborRects(graph, component, proposedRect);
    const { minDistanceToSnap, maxDistanceToSnap, hysteresisDistance } = this.options;

    // Hysteresis: compare block geometry - release when block moves away from snap position
    if (this.lastSnap !== null) {
      const blockMovement = euclideanDistance(0, 0, diff.deltaX, diff.deltaY);
      if (blockMovement < hysteresisDistance) {
        diff.diffX = this.lastSnap.diffX;
        diff.diffY = this.lastSnap.diffY;
        return;
      }
      this.lastSnap = null;
    }

    const deltaX = diff.deltaX;
    const deltaY = diff.deltaY;
    const dragDirection = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";

    const xCandidates = this.collectXSnapCandidates(
      proposedRect,
      neighbors,
      startX,
      minDistanceToSnap,
      maxDistanceToSnap
    );
    const yCandidates = this.collectYSnapCandidates(
      proposedRect,
      neighbors,
      startY,
      minDistanceToSnap,
      maxDistanceToSnap
    );

    let bestX: SnapCandidate | null = this.pickBestCandidate(xCandidates);
    let bestY: SnapCandidate | null = this.pickBestCandidate(yCandidates);

    // When both at same distance: prefer horizontal over vertical (by drag direction)
    if (bestX && bestY && Math.abs(bestX.distance - bestY.distance) < 0.001) {
      if (dragDirection === "vertical") {
        bestX = null;
      } else {
        bestY = null;
      }
    }

    const snapLines: MagneticSnapLine[] = [];
    let newDiffX = diff.diffX;
    let newDiffY = diff.diffY;

    if (bestX !== null) {
      newDiffX = bestX.diff;
      snapLines.push({
        axis: "x",
        from: bestX.to,
        to: bestX.from,
        targetEdge: bestX.targetEdge,
        targetEdgeRect: bestX.targetEdgeRect,
      });
    }
    if (bestY !== null) {
      newDiffY = bestY.diff;
      snapLines.push({
        axis: "y",
        from: bestY.to,
        to: bestY.from,
        targetEdge: bestY.targetEdge,
        targetEdgeRect: bestY.targetEdgeRect,
      });
    }

    if (snapLines.length > 0) {
      this.lastSnap = { diffX: newDiffX, diffY: newDiffY };
      if (!this.magneticStarted) {
        this.magneticStarted = true;
        this.graph = graph;
        graph.emit("magnetic-start", { strategy: this });
      }
      this.$snapData.value = {
        proposedRect: { ...proposedRect },
        snapLines,
      };
    } else {
      this.$snapData.value = null;
      if (this.options.gridSize > 0) {
        newDiffX = Math.round(newDiffX / this.options.gridSize) * this.options.gridSize;
        newDiffY = Math.round(newDiffY / this.options.gridSize) * this.options.gridSize;
      }
    }

    diff.diffX = newDiffX;
    diff.diffY = newDiffY;
  }

  private pickBestCandidate(candidates: SnapCandidate[]): SnapCandidate | null {
    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => a.distance - b.distance);
    return sorted[0];
  }

  private collectXSnapCandidates(
    proposed: Rect,
    neighbors: Rect[],
    startX: number,
    minDist: number,
    maxDist: number
  ): SnapCandidate[] {
    const candidates: SnapCandidate[] = [];
    const ourLeft = proposed.x;
    const ourRight = proposed.x + proposed.width;
    const ourCenterX = proposed.x + proposed.width / 2;
    const midY = proposed.y + proposed.height / 2;
    const GLOW = 3;

    for (const n of neighbors) {
      const nLeft = n.x;
      const nRight = n.x + n.width;
      const nCenterX = n.x + n.width / 2;
      const nMidY = n.y + n.height / 2;

      // Edge to edge: left-left
      const dLL = Math.abs(ourLeft - nLeft);
      if (dLL >= minDist && dLL <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nLeft - startX,
          distance: dLL,
          from: { x: ourLeft, y: midY },
          to: { x: nLeft, y: midY },
          targetEdge: "left",
          targetEdgeRect: { x: nLeft - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Edge to edge: right-right
      const dRR = Math.abs(ourRight - nRight);
      if (dRR >= minDist && dRR <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nRight - startX - proposed.width,
          distance: dRR,
          from: { x: ourRight, y: midY },
          to: { x: nRight, y: midY },
          targetEdge: "right",
          targetEdgeRect: { x: nRight - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Edge to edge: left-right
      const dLR = Math.abs(ourLeft - nRight);
      if (dLR >= minDist && dLR <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nRight - startX,
          distance: dLR,
          from: { x: ourLeft, y: midY },
          to: { x: nRight, y: midY },
          targetEdge: "right",
          targetEdgeRect: { x: nRight - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Edge to edge: right-left
      const dRL = Math.abs(ourRight - nLeft);
      if (dRL >= minDist && dRL <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nLeft - startX - proposed.width,
          distance: dRL,
          from: { x: ourRight, y: midY },
          to: { x: nLeft, y: midY },
          targetEdge: "left",
          targetEdgeRect: { x: nLeft - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Center to center
      const dCC = Math.abs(ourCenterX - nCenterX);
      if (dCC >= minDist && dCC <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nCenterX - startX - proposed.width / 2,
          distance: dCC,
          from: { x: ourCenterX, y: midY },
          to: { x: nCenterX, y: midY },
          targetEdge: "left",
          targetEdgeRect: { x: nCenterX - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Center to midpoint of neighbor's left edge
      const dCL = Math.abs(ourCenterX - nLeft);
      if (dCL >= minDist && dCL <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nLeft - startX - proposed.width / 2,
          distance: dCL,
          from: { x: ourCenterX, y: midY },
          to: { x: nLeft, y: nMidY },
          targetEdge: "left",
          targetEdgeRect: { x: nLeft - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
      // Center to midpoint of neighbor's right edge
      const dCR = Math.abs(ourCenterX - nRight);
      if (dCR >= minDist && dCR <= maxDist) {
        candidates.push({
          axis: "x",
          diff: nRight - startX - proposed.width / 2,
          distance: dCR,
          from: { x: ourCenterX, y: midY },
          to: { x: nRight, y: nMidY },
          targetEdge: "right",
          targetEdgeRect: { x: nRight - GLOW, y: n.y, width: GLOW * 2, height: n.height },
        });
      }
    }
    return candidates;
  }

  private collectYSnapCandidates(
    proposed: Rect,
    neighbors: Rect[],
    startY: number,
    minDist: number,
    maxDist: number
  ): SnapCandidate[] {
    const candidates: SnapCandidate[] = [];
    const ourTop = proposed.y;
    const ourBottom = proposed.y + proposed.height;
    const ourCenterY = proposed.y + proposed.height / 2;
    const midX = proposed.x + proposed.width / 2;

    const GLOW = 3;

    for (const n of neighbors) {
      const nTop = n.y;
      const nBottom = n.y + n.height;
      const nCenterY = n.y + n.height / 2;
      const nMidX = n.x + n.width / 2;

      // Edge to edge: top-top
      const dTT = Math.abs(ourTop - nTop);
      if (dTT >= minDist && dTT <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nTop - startY,
          distance: dTT,
          from: { x: midX, y: ourTop },
          to: { x: midX, y: nTop },
          targetEdge: "top",
          targetEdgeRect: { x: n.x, y: nTop - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Edge to edge: bottom-bottom
      const dBB = Math.abs(ourBottom - nBottom);
      if (dBB >= minDist && dBB <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nBottom - startY - proposed.height,
          distance: dBB,
          from: { x: midX, y: ourBottom },
          to: { x: midX, y: nBottom },
          targetEdge: "bottom",
          targetEdgeRect: { x: n.x, y: nBottom - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Edge to edge: top-bottom
      const dTB = Math.abs(ourTop - nBottom);
      if (dTB >= minDist && dTB <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nBottom - startY,
          distance: dTB,
          from: { x: midX, y: ourTop },
          to: { x: midX, y: nBottom },
          targetEdge: "bottom",
          targetEdgeRect: { x: n.x, y: nBottom - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Edge to edge: bottom-top
      const dBT = Math.abs(ourBottom - nTop);
      if (dBT >= minDist && dBT <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nTop - startY - proposed.height,
          distance: dBT,
          from: { x: midX, y: ourBottom },
          to: { x: midX, y: nTop },
          targetEdge: "top",
          targetEdgeRect: { x: n.x, y: nTop - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Center to center
      const dCC = Math.abs(ourCenterY - nCenterY);
      if (dCC >= minDist && dCC <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nCenterY - startY - proposed.height / 2,
          distance: dCC,
          from: { x: midX, y: ourCenterY },
          to: { x: midX, y: nCenterY },
          targetEdge: "top",
          targetEdgeRect: { x: n.x, y: nCenterY - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Center to midpoint of neighbor's top edge
      const dCT = Math.abs(ourCenterY - nTop);
      if (dCT >= minDist && dCT <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nTop - startY - proposed.height / 2,
          distance: dCT,
          from: { x: midX, y: ourCenterY },
          to: { x: nMidX, y: nTop },
          targetEdge: "top",
          targetEdgeRect: { x: n.x, y: nTop - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
      // Center to midpoint of neighbor's bottom edge
      const dCB = Math.abs(ourCenterY - nBottom);
      if (dCB >= minDist && dCB <= maxDist) {
        candidates.push({
          axis: "y",
          diff: nBottom - startY - proposed.height / 2,
          distance: dCB,
          from: { x: midX, y: ourCenterY },
          to: { x: nMidX, y: nBottom },
          targetEdge: "bottom",
          targetEdgeRect: { x: n.x, y: nBottom - GLOW, width: n.width, height: GLOW * 2 },
        });
      }
    }
    return candidates;
  }

  /** Reset state when drag ends. Emits magnetic-end. Called by DragService. */
  public reset(): void {
    if (this.magneticStarted && this.graph) {
      this.graph.emit("magnetic-end", { strategy: this });
    }
    this.magneticStarted = false;
    this.graph = null;
    this.lastSnap = null;
    this.$snapData.value = null;
  }

  private getNeighborRects(graph: Graph, excludeComponent: GraphComponent, hitboxRect: Rect): Rect[] {
    const { neighborTypes, neighborSearchPadding } = this.options;
    const filter = neighborTypes.length > 0 ? neighborTypes : undefined;

    const searchRect = {
      x: hitboxRect.x - neighborSearchPadding,
      y: hitboxRect.y - neighborSearchPadding,
      width: hitboxRect.width + neighborSearchPadding * 2,
      height: hitboxRect.height + neighborSearchPadding * 2,
    };

    const elements = filter ? graph.getElementsOverRect(searchRect, filter) : graph.getElementsOverRect(searchRect);

    const rects: Rect[] = [];
    for (const el of elements) {
      if (el === excludeComponent) continue;
      if (typeof el.getHitBox !== "function") continue;

      const hb = el.getHitBox();
      rects.push({
        x: hb[0],
        y: hb[1],
        width: hb[2],
        height: hb[3],
      });
    }
    return rects;
  }

  private applyGridFallback(diff: DragDiff): void {
    const { gridSize } = this.options;
    if (gridSize <= 0) return;

    diff.diffX = Math.round(diff.diffX / gridSize) * gridSize;
    diff.diffY = Math.round(diff.diffY / gridSize) * gridSize;
  }
}
