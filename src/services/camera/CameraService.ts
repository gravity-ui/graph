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
  /**
   * Insets of visible viewport inside the canvas area (in screen space, pixels)
   * Use these to specify drawers/side panels overlaying the canvas. All values are >= 0.
   */
  viewportInsets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
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
    viewportInsets: { left: 0, right: 0, top: 0, bottom: 0 },
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
    // Relative coordinates are based on full canvas viewport (ignore insets)
    this.state.relativeX = this.getRelative(this.state.x) | 0;
    this.state.relativeY = this.getRelative(this.state.y) | 0;
    this.state.relativeWidth = this.getRelative(this.state.width) | 0;
    this.state.relativeHeight = this.getRelative(this.state.height) | 0;
  }

  public getCameraRect(): TRect {
    const { x, y, width, height } = this.state;
    return { x, y, width, height };
  }

  /**
   * Returns the visible camera rect in screen space that accounts for the viewport insets.
   * @returns {TRect} Visible rectangle inside the canvas after applying insets
   */
  public getVisibleCameraRect(): TRect {
    const { x, y, width, height, viewportInsets } = this.state;
    const visibleWidth = Math.max(0, width - viewportInsets.left - viewportInsets.right);
    const visibleHeight = Math.max(0, height - viewportInsets.top - viewportInsets.bottom);
    return {
      x: x + viewportInsets.left,
      y: y + viewportInsets.top,
      width: visibleWidth,
      height: visibleHeight,
    };
  }

  /**
   * Returns camera viewport rectangle in camera-relative space.
   * By default returns full canvas-relative viewport (ignores insets).
   * When options.respectInsets is true, returns viewport of the visible area (with insets applied).
   * @param {Object} [options]
   * @param {boolean} [options.respectInsets]
   * @returns {TRect} Relative viewport rectangle
   */
  public getRelativeViewportRect(options?: { respectInsets?: boolean }): TRect {
    const useVisible = Boolean(options?.respectInsets);
    if (!useVisible) {
      return {
        x: this.getRelative(this.state.x) | 0,
        y: this.getRelative(this.state.y) | 0,
        width: this.getRelative(this.state.width) | 0,
        height: this.getRelative(this.state.height) | 0,
      };
    }

    const insets = this.state.viewportInsets;
    const visibleWidth = Math.max(0, this.state.width - insets.left - insets.right);
    const visibleHeight = Math.max(0, this.state.height - insets.top - insets.bottom);
    return {
      x: this.getRelative(this.state.x + insets.left) | 0,
      y: this.getRelative(this.state.y + insets.top) | 0,
      width: this.getRelative(visibleWidth) | 0,
      height: this.getRelative(visibleHeight) | 0,
    };
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
   * Converts relative coordinate to absolute (screen space).
   * Inverse of getRelative.
   * @param {number} n Relative coordinate
   * @param {number} [scale=this.state.scale] Scale to use for conversion
   * @returns {number} Absolute coordinate in screen space
   */
  public getAbsolute(n: number, scale: number = this.state.scale): number {
    return n * scale;
  }

  /**
   * Converts relative coordinates to absolute (screen space).
   * Inverse of getRelativeXY.
   * @param {number} x Relative x
   * @param {number} y Relative y
   * @returns {number[]} Absolute [x, y] in screen space
   */
  public getAbsoluteXY(x: number, y: number) {
    return [x * this.state.scale + this.state.x, y * this.state.scale + this.state.y];
  }

  /**
   * Zoom to a screen point.
   * @param {number} x Screen x where zoom anchors
   * @param {number} y Screen y where zoom anchors
   * @param {number} scale Target scale value
   * @returns {void}
   */
  public zoom(x: number, y: number, scale: number) {
    const normalizedScale = clamp(scale, this.state.scaleMin, this.state.scaleMax);

    const dx = this.getRelative(x - this.state.x);
    const dy = this.getRelative(y - this.state.y);

    const dxInNextScale = this.getRelative(x - this.state.x, normalizedScale);
    const dyInNextScale = this.getRelative(y - this.state.y, normalizedScale);

    const nextX = this.state.x + (dxInNextScale - dx) * normalizedScale;
    const nextY = this.state.y + (dyInNextScale - dy) * normalizedScale;

    this.set({
      scale: normalizedScale,
      x: nextX,
      y: nextY,
    });
  }

  public getScaleRelativeDimensionsBySide(
    size: number,
    axis: "width" | "height",
    options?: { respectInsets?: boolean }
  ) {
    const useVisible = Boolean(options?.respectInsets);
    const insets = this.state.viewportInsets;
    let viewportSize: number;
    if (axis === "width") {
      viewportSize = useVisible ? Math.max(0, this.state.width - insets.left - insets.right) : this.state.width;
    } else {
      viewportSize = useVisible ? Math.max(0, this.state.height - insets.top - insets.bottom) : this.state.height;
    }
    return clamp(Number(viewportSize / size), this.state.scaleMin, this.state.scaleMax);
  }

  public getScaleRelativeDimensions(width: number, height: number, options?: { respectInsets?: boolean }) {
    return Math.min(
      this.getScaleRelativeDimensionsBySide(width, "width", options),
      this.getScaleRelativeDimensionsBySide(height, "height", options)
    );
  }

  public getXYRelativeCenterDimensions(dimensions: TRect, scale: number, options?: { respectInsets?: boolean }) {
    const useVisible = Boolean(options?.respectInsets);
    const insets = this.state.viewportInsets;
    const centerX = useVisible
      ? insets.left + Math.max(0, this.state.width - insets.left - insets.right) / 2
      : this.state.width / 2;
    const centerY = useVisible
      ? insets.top + Math.max(0, this.state.height - insets.top - insets.bottom) / 2
      : this.state.height / 2;

    const x = 0 - dimensions.x * scale - (dimensions.width / 2) * scale + centerX;
    const y = 0 - dimensions.y * scale - (dimensions.height / 2) * scale + centerY;

    return { x, y };
  }

  public isRectVisible(x: number, y: number, w: number, h: number) {
    // Shift by relative viewport origin (full viewport, without insets). Insets are irrelevant for visibility.
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

  /**
   * Update viewport insets (screen-space paddings inside canvas) and optionally keep the
   * world point under the visible center unchanged.
   * @param {Object} insets Partial insets to update
   * @param {number} [insets.left]
   * @param {number} [insets.right]
   * @param {number} [insets.top]
   * @param {number} [insets.bottom]
   * @param {string} [maintain=center] Preserve visual anchor; allowed values: center or none. "center" keeps the
   * same world point under visible center
   * @returns {void}
   */
  public setViewportInsets(insets: Partial<TCameraState["viewportInsets"]>, params?: { maintain?: "center" }): void {
    const currentInsets = this.state.viewportInsets;
    const nextInsets = {
      left: insets.left ?? currentInsets.left,
      right: insets.right ?? currentInsets.right,
      top: insets.top ?? currentInsets.top,
      bottom: insets.bottom ?? currentInsets.bottom,
    };

    if (params?.maintain === "center") {
      const oldVisibleWidth = Math.max(0, this.state.width - currentInsets.left - currentInsets.right);
      const oldVisibleHeight = Math.max(0, this.state.height - currentInsets.top - currentInsets.bottom);
      const oldCenterX = currentInsets.left + oldVisibleWidth / 2;
      const oldCenterY = currentInsets.top + oldVisibleHeight / 2;
      const [anchorWorldX, anchorWorldY] = this.getRelativeXY(oldCenterX, oldCenterY);

      const newVisibleWidth = Math.max(0, this.state.width - nextInsets.left - nextInsets.right);
      const newVisibleHeight = Math.max(0, this.state.height - nextInsets.top - nextInsets.bottom);
      const newCenterX = nextInsets.left + newVisibleWidth / 2;
      const newCenterY = nextInsets.top + newVisibleHeight / 2;

      const nextX = newCenterX - anchorWorldX * this.state.scale;
      const nextY = newCenterY - anchorWorldY * this.state.scale;

      this.set({ viewportInsets: nextInsets, x: nextX, y: nextY });
      return;
    }

    this.set({ viewportInsets: nextInsets });
  }

  /**
   * Returns current viewport insets.
   * @returns {{left: number, right: number, top: number, bottom: number}} Current insets of visible viewport
   */
  public getViewportInsets(): TCameraState["viewportInsets"] {
    return this.state.viewportInsets;
  }
}
