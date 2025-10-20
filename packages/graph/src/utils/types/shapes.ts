import isObject from "lodash/isObject";

export type TPoint = {
  x: number;
  y: number;
};

export interface IPoint extends TPoint {
  toArray(): number[];
  toObject(): { x: number; y: number };

  origPoint?: {
    x: number;
    y: number;
  };
}

export class Point implements IPoint {
  public x: number;

  public y: number;

  public origPoint?: {
    x: number;
    y: number;
  };

  constructor(
    x: number,
    y: number,
    origPoint?: {
      x: number;
      y: number;
    }
  ) {
    this.x = x;
    this.y = y;
    this.origPoint = origPoint || {
      x,
      y,
    };
  }

  public toArray() {
    return [this.x, this.y];
  }

  public toObject() {
    return { x: this.x, y: this.y };
  }
}

export type TRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isTRect(rect: unknown): rect is TRect {
  return (
    isObject(rect) &&
    "x" in rect &&
    typeof rect.x === "number" &&
    "y" in rect &&
    typeof rect.y === "number" &&
    "width" in rect &&
    typeof rect.width === "number" &&
    "height" in rect &&
    typeof rect.height === "number"
  );
}

export interface IRect extends TRect {
  toArray(): number[];
  toObject(): { x: number; y: number; width: number; height: number };
}

export class Rect implements IRect {
  public x: number;

  public y: number;

  public width: number;

  public height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  public toArray() {
    return [this.x, this.y, this.width, this.height];
  }

  public toObject() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
}
