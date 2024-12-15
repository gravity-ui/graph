import debounce from "lodash/debounce";
import RBush from "rbush";

import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { IPoint } from "../utils/types/shapes";

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

  public load(items: HitBox[]) {
    this.tree.load(items);
  }

  protected scheduledItems = new Set<HitBox>();

  public clear() {
    this.scheduledItems.clear();
    this.tree.clear();
  }

  public add(item: HitBox, force = false) {
    this.scheduledItems.add(item);
    this.scheduleLoad();
    if (force) {
      this.scheduleLoad.flush();
    }
  }

  protected scheduleLoad = debounce(() => {
    this.tree.load(Array.from(this.scheduledItems));
    this.scheduledItems.clear();
    this.emitUpdate();
  }, 50);

  public remove(item: HitBox, silent = false) {
    this.scheduledItems.delete(item);
    this.tree.remove(item);
    if (!silent) {
      this.emitUpdate();
    }
  }

  protected emitUpdate = debounce(() => {
    this.emit("update", this);
  }, 50);

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

  private rect: [number, number, number, number];

  constructor(
    public item: { zIndex: number } & Component & IWithHitTest,
    protected hitTest: HitTest
  ) {}

  public update = (minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void => {
    if (this.destroyed) return;
    if (minX === this.minX && minY === this.minY && maxX === this.maxX && maxY === this.maxY && !force) return;
    if (this.minX !== undefined) {
      this.hitTest.remove(this, true);
    }

    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    this.rect = [this.minX, this.minY, this.maxX - this.minX, this.maxY - this.minY];
    this.hitTest.add(this, Boolean(force));
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
