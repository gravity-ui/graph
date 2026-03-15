import { Graph } from "../graph";
import { ESchedulerPriority, globalScheduler } from "../lib/Scheduler";

/** Interface implemented by components that can receive visible-child registrations. */
export interface ICullingAwareParent {
  registerVisibleChild(child: object): void;
}

/**
 * SpatialCullingService — a high-priority scheduler that runs before the main tree walk each frame.
 *
 * Responsibilities:
 *  1. Listen for events that change which components are visible (camera-change, hitTest update).
 *  2. When dirty, query HitTest RBush for the current viewport — O(log n + k).
 *  3. Call markVisibleThisFrame() on each visible component so it can register itself
 *     with its culling-aware parent (e.g. Blocks).
 *
 * The main tree walk (MEDIUM priority) then only walks the registered children,
 * reducing iteration from O(n) to O(k).
 */
export class SpatialCullingService {
  private dirty = true;

  /** Components that were marked visible in the last pass; used for resetting. */
  private visibleSet = new Set<IMarkableComponent>();

  private removeFromScheduler: () => void;

  constructor(private graph: Graph) {
    this.removeFromScheduler = globalScheduler.addScheduler(this, ESchedulerPriority.HIGHEST);

    graph.on("camera-change", this.markDirty);
    graph.hitTest.on("update", this.markDirty);
  }

  private markDirty = (): void => {
    this.dirty = true;
  };

  public performUpdate = (): void => {
    if (!this.dirty) return;
    this.dirty = false;

    // Reset marks from previous frame
    for (const comp of this.visibleSet) {
      comp.visibleThisFrame = false;
    }
    this.visibleSet.clear();

    const state = this.graph.cameraService.getCameraState();
    const margin = 200;

    // World-space viewport rectangle for RBush query
    const viewport = {
      minX: -state.relativeX - margin,
      minY: -state.relativeY - margin,
      maxX: -state.relativeX + state.relativeWidth + margin,
      maxY: -state.relativeY + state.relativeHeight + margin,
    };

    const visible = this.graph.hitTest.testBox(viewport);

    for (const comp of visible) {
      const markable = comp as unknown as IMarkableComponent;
      if (typeof markable.markVisibleThisFrame === "function") {
        markable.markVisibleThisFrame();
        this.visibleSet.add(markable);
      }
    }
  };

  public destroy(): void {
    // this.graph.off("camera-change", this.markDirty);
    // this.graph.hitTest.off("update", this.markDirty);
    this.removeFromScheduler();
  }
}

/** Minimal interface for components that support per-frame visibility marking. */
interface IMarkableComponent {
  visibleThisFrame: boolean;
  markVisibleThisFrame(): void;
}
