import intersects from "intersects";

import { Graph } from "../../graph";
import { Emitter } from "../../utils/Emitter";
import { clamp } from "../../utils/functions/clamp";
import { TRect } from "../../utils/types/shapes";

export type TCameraState = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  scaleMin: number;
  scaleMax: number;
  relativeX: number;
  relativeY: number;
  relativeWidth: number;
  relativeHeight: number;
};

export enum ECameraScaleLevel {
  Minimalistic = 100,
  Schematic = 200,
  Detailed = 300,
}

export const getInitCameraState = (): TCameraState => {
  return {
    /**
     * Viewport of camera in canvas space
     * x,y - center of camera(may be negative)
     * width, height - size of viewport, equals to canvas w/h
     *  */
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    /**
     * Viewport of camera in camera space
     * relativeX, relativeY - center of camera
     * relativeWidth, relativeHeight - size of viewport
     *
     * In easy words, it's a scale-aware viewport
     */
    relativeX: 0,
    relativeY: 0,
    relativeWidth: 0,
    relativeHeight: 0,
    scale: 0.5,
    scaleMax: 1,
    scaleMin: 0.01,
  };
};

export type ICamera = Interface<CameraService>;

export class CameraService extends Emitter {
  constructor(
    protected graph: Graph,
    protected state: TCameraState = getInitCameraState()
  ) {
    super();
  }

  public resize(newState: Partial<TCameraState>) {
    const diffX = newState.width - this.state.width;
    const diffY = newState.height - this.state.height;
    this.set(newState);
    this.move(diffX, diffY);
  }

  public set(newState: Partial<TCameraState>) {
    this.graph.executеDefaultEventAction("camera-change", Object.assign({}, this.state, newState), () => {
      this.state = Object.assign(this.state, newState);
      this.updateRelative();
    });
  }

  private updateRelative() {
    this.state.relativeX = this.getRelative(this.state.x) | 0;
    this.state.relativeY = this.getRelative(this.state.y) | 0;
    this.state.relativeWidth = this.getRelative(this.state.width) | 0;
    this.state.relativeHeight = this.getRelative(this.state.height) | 0;
  }

  public getCameraRect(): TRect {
    const { x, y, width, height } = this.state;
    return { x, y, width, height };
  }

  public getCameraScale() {
    return this.state.scale;
  }

  public getCameraBlockScaleLevel(cameraScale = this.getCameraScale()) {
    const scales = this.graph.graphConstants.block.SCALES;
    let scaleLevel = ECameraScaleLevel.Minimalistic;
    if (cameraScale >= scales[1]) {
      scaleLevel = ECameraScaleLevel.Schematic;
    }
    if (cameraScale >= scales[2]) {
      scaleLevel = ECameraScaleLevel.Detailed;
    }

    return scaleLevel;
  }

  public getCameraState(): TCameraState {
    return this.state;
  }

  public move(dx = 0, dy = 0) {
    const x = (this.state.x + dx) | 0;
    const y = (this.state.y + dy) | 0;

    this.set({
      x,
      y,
    });
  }

  public getRelative(n: number, scale: number = this.state.scale): number {
    return n / scale;
  }

  public getRelativeXY(x: number, y: number) {
    return [(x - this.state.x) / this.state.scale, (y - this.state.y) / this.state.scale];
  }

  /**
   * Converts relative coordinate to absolute (screen space)
   * Inverse of getRelative
   */
  public getAbsolute(n: number, scale: number = this.state.scale): number {
    return n * scale;
  }

  /**
   * Converts relative coordinates to absolute (screen space)
   * Inverse of getRelativeXY
   */
  public getAbsoluteXY(x: number, y: number) {
    return [x * this.state.scale + this.state.x, y * this.state.scale + this.state.y];
  }

  /**
   * Zoom to point
   *  */
  public zoom(x: number, y: number, scale: number) {
    const normalizedScale = clamp(scale, this.state.scaleMin, this.state.scaleMax);

    const dx = this.getRelative(x - this.state.x);
    const dy = this.getRelative(y - this.state.y);

    const dxInNextScale = this.getRelative(x - this.state.x, normalizedScale);
    const dyInNextScale = this.getRelative(y - this.state.y, normalizedScale);

    const nextX = this.state.x + (dxInNextScale - dx) * normalizedScale;
    const nextY = this.state.y + (dyInNextScale - dy) * normalizedScale;

    console.log("apply zoom", nextX, nextY, normalizedScale);
    this.set({
      scale: normalizedScale,
      x: nextX,
      y: nextY,
    });
  }

  public getScaleRelativeDimensionsBySide(size: number, axis: "width" | "height") {
    return clamp(Number(this.state[axis] / size), this.state.scaleMin, this.state.scaleMax);
  }

  public getScaleRelativeDimensions(width: number, height: number) {
    return Math.min(
      this.getScaleRelativeDimensionsBySide(width, "width"),
      this.getScaleRelativeDimensionsBySide(height, "height")
    );
  }

  public getXYRelativeCenterDimensions(dimensions: TRect, scale: number) {
    const x = 0 - dimensions.x * scale - (dimensions.width / 2) * scale + this.state.width / 2;
    const y = 0 - dimensions.y * scale - (dimensions.height / 2) * scale + this.state.height / 2;

    return { x, y };
  }

  public isRectVisible(x: number, y: number, w: number, h: number) {
    return intersects.boxBox(
      x + this.state.relativeX,
      y + this.state.relativeY,
      w,
      h,
      0,
      0,
      this.state.relativeWidth,
      this.state.relativeHeight
    );
  }

  public isLineVisible(x1: number, y1: number, x2: number, y2: number) {
    // because the camera coordinates are inverted
    return intersects.lineBox(
      -x1,
      -y1,
      -x2,
      -y2,
      this.state.relativeX - this.state.relativeWidth,
      this.state.relativeY - this.state.relativeHeight,
      this.state.relativeWidth,
      this.state.relativeHeight
    );
  }

  public applyToPoint(x: number, y: number): [number, number] {
    return [(this.getRelative(x) - this.state.relativeX) | 0, (this.getRelative(y) - this.state.relativeY) | 0];
  }

  public applyToRect(...arg: number[]): number[];

  public applyToRect(x: number, y: number, w: number, h: number): number[] {
    return this.applyToPoint(x, y).concat(Math.floor(this.getRelative(w)), Math.floor(this.getRelative(h)));
  }
}
