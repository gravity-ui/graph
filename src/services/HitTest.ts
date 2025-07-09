import { signal } from "@preact/signals-core";
import RBush from "rbush";

import { ESchedulerPriority } from "../lib";
import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { noop } from "../utils/functions";
import { IPoint, TRect } from "../utils/types/shapes";
import { debounce } from "../utils/utils/schedule";

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

export class HitTest extends Emitter {
  private tree = new RBush<HitBox>(9);

  public readonly $usableRect = signal<TRect>({ x: 0, y: 0, width: 0, height: 0 });

  // Single queue replaces all complex state tracking
  protected queue = new Map<HitBox, HitBoxData | null>();

  public get isUnstable() {
    return (
      this.processQueue.isScheduled() ||
      this.queue.size > 0 ||
      (this.$usableRect.value.height === 0 &&
        this.$usableRect.value.width === 0 &&
        this.$usableRect.value.x === 0 &&
        this.$usableRect.value.y === 0)
    );
  }

  public load(items: HitBox[]) {
    this.tree.load(items);
  }

  // Single debounced job replaces complex scheduler logic
  protected processQueue = debounce(
    () => {
      const items = [];
      for (const [item, bbox] of this.queue) {
        if (bbox === null) {
          // Remove operation
          this.tree.remove(item);
        } else {
          // Add/update operation
          this.tree.remove(item);
          // item.updateRect(bbox);
          items.push(item);
        }
      }
      this.tree.load(items);
      this.queue.clear();
      this.updateUsableRect();
      this.emit("update", this);
    },
    {
      priority: ESchedulerPriority.LOWEST,
      frameTimeout: 100,
    }
  );

  public update(item: HitBox, bbox: HitBoxData, _force = false) {
    this.queue.set(item, bbox);
    this.processQueue();
    // TODO: force update may be cause to unset unstable flag before graph is really made stable
    // Usually case: updateEntities update blocks and connections. In this case used force stategy, so every entity will be updated immediatelly, but async, so zoom will be unstable
    /* if (force) {
      this.processQueue.flush();
    } */
  }

  public clear() {
    this.processQueue.cancel();
    this.queue.clear();
    this.tree.clear();
    this.updateUsableRect();
  }

  public add(item: HitBox) {
    this.queue.set(item, {
      minX: item.minX,
      minY: item.minY,
      maxX: item.maxX,
      maxY: item.maxY,
      x: item.x,
      y: item.y,
    });
    this.processQueue();
  }

  public waitUsableRectUpdate(callback: (rect: TRect) => void) {
    if (this.isUnstable) {
      const fn = () => {
        this.waitUsableRectUpdate(callback);
      };
      this.once("update", fn);
      return () => this.off("update", fn);
    }
    callback(this.$usableRect.value);
    return noop;
  }

  protected updateUsableRect() {
    const rect = this.tree.toJSON();
    if (rect.length === 0) {
      this.$usableRect.value = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }
    this.$usableRect.value = {
      x: Number.isFinite(rect.minX) ? rect.minX : 0,
      y: Number.isFinite(rect.minY) ? rect.minY : 0,
      width: Number.isFinite(rect.maxX) ? rect.maxX - rect.minX : 0,
      height: Number.isFinite(rect.maxY) ? rect.maxY - rect.minY : 0,
    };
  }

  public remove(item: HitBox) {
    this.queue.set(item, null);
    this.processQueue();
  }

  public testPoint(point: IPoint, pixelRatio: number) {
    return this.testHitBox({
      minX: point.x - 1,
      minY: point.y - 1,
      maxX: point.x + 1,
      maxY: point.y + 1,
      x: point.origPoint?.x * pixelRatio,
      y: point.origPoint?.y * pixelRatio,
    });
  }

  public testBox(item: Omit<HitBoxData, "x" | "y">): Component[] {
    return this.tree.search(item).map((hitBox) => hitBox.item);
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

  public destroy(): void {
    super.destroy();
    this.processQueue.cancel();
  }

  public testHitBox(item: HitBoxData): Component[] {
    const hitBoxes = this.tree.search(item);
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
  private destroyed = false;

  public maxX: number;

  public maxY: number;

  public minX: number;

  public minY: number;

  public x: number;

  public y: number;

  private rect: [number, number, number, number] = [0, 0, 0, 0];

  constructor(
    public item: { zIndex: number } & Component & IWithHitTest,
    protected hitTest: HitTest
  ) {}

  public updateRect(rect: HitBoxData) {
    this.minX = rect.minX;
    this.minY = rect.minY;
    this.maxX = rect.maxX;
    this.maxY = rect.maxY;
    this.x = rect.x;
    this.y = rect.y;
    this.rect = [this.minX, this.minY, this.maxX - this.minX, this.maxY - this.minY];
  }

  public update = (minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void => {
    if (this.destroyed) return;
    if (minX === this.minX && minY === this.minY && maxX === this.maxX && maxY === this.maxY && !force) return;
    this.updateRect({ minX, minY, maxX, maxY, x: this.x, y: this.y });
    this.hitTest.update(this, { minX, minY, maxX, maxY, x: this.x, y: this.y }, force);
  };

  public getRect(): [number, number, number, number] {
    return this.rect;
  }

  public remove() {
    this.hitTest.remove(this);
  }

  public destroy(): void {
    this.destroyed = true;
    this.hitTest.remove(this);
  }
}
