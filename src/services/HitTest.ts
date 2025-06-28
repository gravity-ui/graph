import { signal } from "@preact/signals-core";
import RBush from "rbush";

import { ESchedulerPriority, scheduler } from "../lib";
import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { IPoint, TRect } from "../utils/types/shapes";
import { schedule } from "../utils/utils/schedule";

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

// type OptionsHitTest = {
//   noSort?: boolean;
// };

export interface IHitBox extends HitBoxData {
  update(minX: number, minY: number, maxX: number, maxY: number): void;
  destroy(): void;
  getRect(): [number, number, number, number];
}

export class HitTest extends Emitter {
  private tree = new RBush<HitBox>(16);

  protected empty = true;

  public usableRect = signal<TRect>({ x: 0, y: 0, width: 0, height: 0 });

  protected scheduledItems = new Map<HitBox, HitBoxData>();
  protected scheduledRemoveItems = new Set<HitBox>();

  protected needEmitUpdate = false;

  public load(items: HitBox[]) {
    this.tree.load(items);
  }

  protected removeSchedulersFns: (() => void)[] = [];

  constructor() {
    super();
    this.removeSchedulersFns = [
      schedule(
        () => {
          let needUpdateUsableRect = false;
          let needEmitUpdate = false;
          if (this.scheduledRemoveItems.size > 0) {
            needEmitUpdate = true;
            this.scheduledRemoveItems.forEach((item) => {
              this.tree.remove(item);
            });
            this.scheduledRemoveItems.clear();
          }
          if (this.scheduledItems.size > 0) {
            needEmitUpdate = true;
            const items = Array.from(this.scheduledItems);
            items.forEach(([item, bbox]) => {
              this.tree.remove(item);
              item.updateRect(bbox);
            });
            const boxes = Array.from(this.scheduledItems.keys());
            this.tree.load(boxes);
            this.scheduledItems.clear();

            const { minX, minY, maxX, maxY } = this.getBBox(boxes);
            if (
              minX !== this.usableRect.value.x ||
              minY !== this.usableRect.value.y ||
              maxX !== this.usableRect.value.width ||
              maxY !== this.usableRect.value.height
            ) {
              needUpdateUsableRect = true;
            }
          }
          if (needUpdateUsableRect) {
            this.updateUsableRect();
          }
          if (needEmitUpdate) {
            this.emit("update", this);
          }
        },
        {
          priority: ESchedulerPriority.LOWEST,
          frameInterval: 10,
        }
      ),
    ];
  }

  public update(item: HitBox, bbox: HitBoxData) {
    this.scheduledItems.set(item, bbox);
  }

  public clear() {
    this.scheduledRemoveItems.clear();
    this.scheduledItems.clear();
    this.tree.clear();
  }

  public add(item: HitBox) {
    this.scheduledItems.set(item, item);
  }

  protected getBBox(items: HitBox[]) {
    return items.reduce(
      (acc, item) => {
        if (Number.isFinite(item.minX)) {
          acc.minX = Math.min(acc.minX, item.minX);
        }
        if (Number.isFinite(item.minY)) {
          acc.minY = Math.min(acc.minY, item.minY);
        }
        if (Number.isFinite(item.maxX)) {
          acc.maxX = Math.max(acc.maxX, item.maxX);
        }
        if (Number.isFinite(item.maxY)) {
          acc.maxY = Math.max(acc.maxY, item.maxY);
        }
        return acc;
      },
      { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    );
  }

  protected updateUsableRect() {
    const { minX, minY, maxX, maxY } = this.getBBox(this.tree.all());
    this.usableRect.value = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  public remove(item: HitBox) {
    this.scheduledRemoveItems.add(item);
  }

  protected emitUpdate = () => {
    this.needEmitUpdate = true;
  };

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

  public destroy(): void {
    super.destroy();
    this.removeSchedulersFns.forEach((removeScheduler) => removeScheduler());
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
    this.hitTest.update(this, { minX, minY, maxX, maxY, x: this.x, y: this.y });
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
