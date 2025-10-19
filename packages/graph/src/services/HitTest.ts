import { signal } from "@preact/signals-core";
import RBush from "rbush";

import { Graph } from "../graph";
import { ESchedulerPriority } from "../lib";
import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { noop } from "../utils/functions";
import { IPoint, TRect } from "../utils/types/shapes";
import { debounce } from "../utils/utils/schedule";

import { IncrementalBoundingBoxTracker } from "./IncrementalBoundingBoxTracker";

export interface IWithHitTest {
  hitBox: IHitBox;
  zIndex: number;
  setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void;
  onHitBox(shape: HitBoxData): boolean;
  removeHitBox(): void;
}

export type HitBoxData = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  x: number;
  y: number;
};

export interface IHitBox extends HitBoxData {
  update(minX: number, minY: number, maxX: number, maxY: number): void;
  destroy(): void;
  getRect(): [number, number, number, number];
}

/**
 * Hit Testing system with dual architecture for performance optimization:
 *
 * 1. interactiveTree (RBush) - for fast spatial search of elements on click/hover
 * 2. usableRectTracker (IncrementalBoundingBoxTracker) - for optimized calculation of overall bbox
 *
 * This solution allows:
 * - Avoid circular dependencies with boundary elements (affectsUsableRect: false)
 * - Optimize performance for different types of operations
 * - Efficiently handle high-frequency updates (drag operations up to 120fps)
 *
 * Performance benchmark results:
 * - Multiple blocks drag: +62% faster than naive approach 🏆
 * - Single block drag: equal performance
 * - Solution to the problem of recalculating usableRect on every change
 */
export class HitTest extends Emitter {
  // RBush tree for interactive elements (spatial search)
  private interactiveTree = new RBush<HitBox>(9);

  // Incremental tracker for elements affecting usableRect
  private usableRectTracker = new IncrementalBoundingBoxTracker<HitBox>();

  public readonly $usableRect = signal<TRect>({ x: 0, y: 0, width: 0, height: 0 });

  // Single queue replaces all complex state tracking
  protected queue = new Map<HitBox, HitBoxData | null>();

  constructor(protected graph: Graph) {
    super();
  }

  /**
   * Check if graph has any elements (blocks or connections)
   * @returns true if graph has elements, false if empty
   */
  private hasGraphElements(): boolean {
    if (!this.graph) {
      return false;
    }
    return (
      this.graph.rootStore.blocksList.$blocks.value.length > 0 ||
      this.graph.rootStore.connectionsList.$connections.value.length > 0
    );
  }

  public get isUnstable() {
    const hasProcessingQueue = this.processQueue.isScheduled() || this.queue.size > 0;
    const hasZeroUsableRect =
      this.$usableRect.value.height === 0 &&
      this.$usableRect.value.width === 0 &&
      this.$usableRect.value.x === 0 &&
      this.$usableRect.value.y === 0;

    // If graph has no elements, it's stable even with zero usableRect
    if (hasZeroUsableRect && !this.hasGraphElements()) {
      return hasProcessingQueue;
    }

    return hasProcessingQueue || hasZeroUsableRect;
  }

  /**
   * Load array of HitBox items
   * @param items Array of HitBox items to load
   * @returns void
   */
  public load(items: HitBox[]): void {
    // For usableRectTracker use incremental addition (optimal)
    this.usableRectTracker.clear();
    for (const item of items) {
      if (item.affectsUsableRect) {
        this.usableRectTracker.add(item);
      }
    }

    this.interactiveTree.load(items);
  }

  // Optimized debounced processing with incremental updates for drag operations
  protected processQueue = debounce(
    () => {
      const interactiveItems = [];

      for (const [item, bbox] of this.queue) {
        this.interactiveTree.remove(item);

        if (bbox) {
          let shouldUpdate = true;
          if (item.affectsUsableRect) {
            if (this.usableRectTracker.has(item)) {
              this.usableRectTracker.update(item, bbox);
            } else {
              item.updateRect(bbox);
              shouldUpdate = false;
              this.usableRectTracker.add(item);
            }
          } else {
            this.usableRectTracker.remove(item);
          }
          if (shouldUpdate) {
            item.updateRect(bbox);
          }
          interactiveItems.push(item);
        } else {
          this.usableRectTracker.remove(item);
        }
      }

      this.interactiveTree.load(interactiveItems);

      this.queue.clear();
      this.updateUsableRect();
      this.emit("update", this);
    },
    {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 1, // run every scheduled lowest frame
    }
  );

  /**
   * Update HitBox item with new bounds
   * @param item HitBox item to update
   * @param bbox New bounds data
   * @param _force Force update flag
   * @returns void
   */
  public update(item: HitBox, bbox: HitBoxData, _force = false): void {
    this.queue.set(item, bbox);
    this.processQueue();
  }

  /**
   * Clear all HitBox items and reset state
   */
  public clear(): void {
    this.processQueue.cancel();
    this.queue.clear();
    this.interactiveTree.clear();
    this.usableRectTracker.clear();
    this.updateUsableRect();
  }

  /**
   * Add new HitBox item
   * @param item HitBox item to add
   */
  public add(item: HitBox): void {
    if (item.destroyed) {
      return;
    }
    this.queue.set(item, item);
    this.processQueue();
  }

  /**
   * Wait for usableRect to become stable and then call callback
   * @param callback Function to call when usableRect becomes stable
   * @returns Unsubscribe function
   */
  public waitUsableRectUpdate(callback: (rect: TRect) => void): () => void {
    // For empty graphs, immediately call callback with current usableRect
    if (!this.hasGraphElements()) {
      callback(this.$usableRect.value);
      return noop;
    }

    if (this.isUnstable) {
      const removeListener = this.$usableRect.subscribe(() => {
        if (!this.isUnstable) {
          removeListener();
          callback(this.$usableRect.value);
          return;
        }
        return;
      });
      return removeListener;
    }
    callback(this.$usableRect.value);
    return noop;
  }

  protected updateUsableRect() {
    // Use optimized tracker for elements affecting usableRect
    const rect = this.usableRectTracker.toJSON();
    const usableRect = {
      x: Number.isFinite(rect.minX) ? rect.minX : 0,
      y: Number.isFinite(rect.minY) ? rect.minY : 0,
      width: Number.isFinite(rect.maxX) ? rect.maxX - rect.minX : 0,
      height: Number.isFinite(rect.maxY) ? rect.maxY - rect.minY : 0,
    };
    if (
      usableRect.x === this.$usableRect.value.x &&
      usableRect.y === this.$usableRect.value.y &&
      usableRect.width === this.$usableRect.value.width &&
      usableRect.height === this.$usableRect.value.height
    ) {
      return;
    }
    this.$usableRect.value = usableRect;
  }

  /**
   * Remove HitBox item
   * @param item HitBox item to remove
   */
  public remove(item: HitBox): void {
    this.queue.set(item, null);
    this.processQueue();
  }

  /**
   * Test hit at specific point
   * @param point Point to test
   * @param pixelRatio Pixel ratio for coordinate conversion
   * @returns Array of hit components
   */
  public testPoint(point: IPoint, pixelRatio: number): Component[] {
    return this.testHitBox({
      minX: point.x - 1,
      minY: point.y - 1,
      maxX: point.x + 1,
      maxY: point.y + 1,
      x: point.origPoint?.x * pixelRatio,
      y: point.origPoint?.y * pixelRatio,
    });
  }

  /**
   * Test hit box intersection with interactive elements
   * @param item Hit box data to test
   * @returns Array of hit components
   */
  public testBox(item: Omit<HitBoxData, "x" | "y">): Component[] {
    // Use interactive elements tree for hit testing
    return this.interactiveTree.search(item).map((hitBox) => hitBox.item);
  }

  /**
   * Subscribe to usableRect updates
   * @param callback Function to call when usableRect changes
   * @returns Unsubscribe function
   */
  public onUsableRectUpdate(callback: (rect: TRect) => void): () => void {
    return this.$usableRect.subscribe(callback);
  }

  /**
   * Get current usableRect value
   * @returns Current usableRect
   */
  public getUsableRect(): TRect {
    return this.$usableRect.value;
  }

  /*
   * Destroy HitTest system, clears all items and stops processing queue
   * @returns void
   */
  public destroy(): void {
    this.clear();
    super.destroy();
  }

  /**
   * Test hit box intersection with interactive elements and sort by z-index
   * @param item Hit box data to test
   * @returns Array of hit components sorted by z-index
   */
  /**
   * Test hit box intersection with interactive elements and sort by z-index
   * @param item Hit box data to test
   * @returns Array of hit components sorted by z-index
   */
  public testHitBox(item: HitBoxData): Component[] {
    // Use interactive elements tree for hit testing
    const hitBoxes = this.interactiveTree.search(item);
    const result = [];

    for (let i = 0; i < hitBoxes.length; i++) {
      if (hitBoxes[i].item.onHitBox(item)) {
        result.push(hitBoxes[i].item);
      }
    }

    const res = result.sort((a, b) => {
      const aZIndex = typeof a.zIndex === "number" ? a.zIndex : -1;
      const bZIndex = typeof b.zIndex === "number" ? b.zIndex : -1;
      if (aZIndex !== bZIndex) {
        return bZIndex - aZIndex;
      }
      return 0;
    });

    return res;
  }
}

export class HitBox implements IHitBox {
  public destroyed = false;

  public maxX: number;

  public maxY: number;

  public minX: number;

  public minY: number;

  public x: number;

  public y: number;

  /**
   * AffectsUsableRect flag uses to determine if the element affects the usableRect
   * If true, the element will be added to the usableRect tracker
   * if false, the element wont affect the usableRect
   */
  public affectsUsableRect = true;

  private rect: [number, number, number, number] = [0, 0, 0, 0];

  protected unstable = true;

  constructor(
    public item: { affectsUsableRect?: boolean } & { zIndex: number } & Component & IWithHitTest,
    protected hitTest: HitTest
  ) {
    this.affectsUsableRect = true;
  }

  /**
   * Update HitBox rectangle data
   * @param rect New rectangle data
   */
  public updateRect(rect: HitBoxData): void {
    this.minX = rect.minX;
    this.minY = rect.minY;
    this.maxX = rect.maxX;
    this.maxY = rect.maxY;
    this.x = rect.x;
    this.y = rect.y;
    this.rect = [this.minX, this.minY, this.maxX - this.minX, this.maxY - this.minY];
    this.unstable = false;
  }

  /**
   * Update HitBox bounds
   * @param minX Minimum X coordinate
   * @param minY Minimum Y coordinate
   * @param maxX Maximum X coordinate
   * @param maxY Maximum Y coordinate
   * @param force Force update even if bounds haven't changed
   */
  public update = (minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void => {
    if (this.destroyed) return;
    if (minX === this.minX && minY === this.minY && maxX === this.maxX && maxY === this.maxY && !force) return;
    this.unstable = true;
    this.rect = [minX, minY, maxX - minX, maxY - minY];
    this.hitTest.update(this, { minX, minY, maxX, maxY, x: this.x, y: this.y }, force);
  };

  /**
   * Get HitBox rectangle as array [x, y, width, height]
   * @returns Rectangle array [x, y, width, height]
   */
  public getRect(): [number, number, number, number] {
    return this.rect;
  }

  /**
   * Remove HitBox from hit testing
   */
  public remove(): void {
    this.hitTest.remove(this);
  }

  /**
   * Destroy HitBox and remove from hit testing
   */
  public destroy(): void {
    this.destroyed = true;
    this.hitTest.remove(this);
  }

  public setAffectsUsableRect(affectsUsableRect: boolean) {
    this.affectsUsableRect = affectsUsableRect;
    if (this.unstable) {
      return;
    }
    this.hitTest.update(this, {
      minX: this.minX,
      minY: this.minY,
      maxX: this.maxX,
      maxY: this.maxY,
      x: this.x,
      y: this.y,
    });
  }
}
