import { Layer, LayerContext } from "../../services/Layer";
import { TCameraState } from "../../services/camera/CameraService";
import { calculateNiceNumber } from "../../utils/functions";
import { measureText } from "../../utils/functions/text";

import {
  DEFAULT_DEVTOOLS_LAYER_PROPS,
  INITIAL_DEVTOOLS_LAYER_STATE,
  MAJOR_TICK_LENGTH,
  MINOR_TICK_LENGTH_FACTOR,
} from "./constants";
import { TDevToolsLayerProps, TDevToolsLayerState, TickInfo } from "./types";

/**
 * DevToolsLayer: Provides rulers and crosshairs for precise positioning and measurement.
 */
export class DevToolsLayer extends Layer<TDevToolsLayerProps, LayerContext, TDevToolsLayerState> {
  public state = INITIAL_DEVTOOLS_LAYER_STATE;
  private mouseMoveListener = this.handleMouseMove.bind(this);
  private mouseEnterListener = this.handleMouseEnter.bind(this);
  private mouseLeaveListener = this.handleMouseLeave.bind(this);
  protected cameraSubscription: (() => void) | null = null;

  constructor(props: TDevToolsLayerProps) {
    const finalProps = { ...DEFAULT_DEVTOOLS_LAYER_PROPS, ...props };
    super({
      canvas: {
        zIndex: 150, // Ensure it's above most other layers
        classNames: ["devtools-layer-canvas", "no-pointer-events"], // Visual only
        respectPixelRatio: true,
        transformByCameraPosition: false, // Rulers/Crosshair are fixed to viewport
        ...(props.canvas ?? {}), // Allow overriding canvas props
      },
      ...finalProps, // Pass merged props, including graph, camera etc.
    });
  }

  protected afterInit(): void {
    super.afterInit();
    // Listen to camera changes to redraw
    // Ensure graph instance exists in context before subscribing
    if (this.context.graph) {
      this.cameraSubscription = this.context.graph.on("camera-change", () => this.performRender());
    } else {
      console.error("DevToolsLayer: Graph instance not found in context during afterInit.");
    }

    // Listen to mouse events on the graph's root layer element
    // Changed from getGraphHTML() to layers.$root
    const graphRoot = this.props.graph?.layers?.$root; // Use optional chaining
    if (graphRoot) {
      graphRoot.addEventListener("mousemove", this.mouseMoveListener);
      graphRoot.addEventListener("mouseenter", this.mouseEnterListener);
      graphRoot.addEventListener("mouseleave", this.mouseLeaveListener);
    } else {
      console.error("DevToolsLayer: Graph root layer element ($root) not found.");
    }

    this.performRender();
  }

  protected unmount(): void {
    this.cameraSubscription?.();
    this.cameraSubscription = null;

    // Changed from getGraphHTML() to layers.$root
    const graphRoot = this.props.graph?.layers?.$root; // Use optional chaining
    if (graphRoot) {
      graphRoot.removeEventListener("mousemove", this.mouseMoveListener);
      graphRoot.removeEventListener("mouseenter", this.mouseEnterListener);
      graphRoot.removeEventListener("mouseleave", this.mouseLeaveListener);
    }

    super.unmount(); // Clean up canvas etc.
  }

  // --- Event Handlers ---

  private handleMouseMove(event: MouseEvent) {
    // Use context.graphCanvas which should be set in afterInit
    const canvas = this.context.graphCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.setState({
      mouseX: event.clientX - rect.left,
      mouseY: event.clientY - rect.top,
      isMouseInside: true, // Ensure inside flag is true on move
    });
  }

  private handleMouseEnter() {
    this.setState({ isMouseInside: true });
  }

  private handleMouseLeave() {
    this.setState({ isMouseInside: false, mouseX: null, mouseY: null });
  }

  // --- State Update ---

  protected stateChanged(): void {
    // Only re-render if crosshair is visible and mouse position changed
    if (this.props.showCrosshair) {
      this.performRender();
    }
  }

  // --- Rendering Logic ---

  protected render(): void {
    if (!this.context.ctx || !this.context.graphCanvas) {
      return;
    }

    // Use resetTransform which handles DPR scaling because respectPixelRatio=true
    // and transformByCameraPosition=false
    this.resetTransform();

    const { ctx, camera, graphCanvas } = this.context;
    const cameraState = camera.getCameraState();
    const dpr = this.getDRP(); // We still need DPR for some calculations, but not for ctx drawing coords

    // Use LOGICAL size for calculations passed to ctx
    const rulerSize = this.props.rulerSize ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize;
    // graphCanvas width/height are physical pixels, divide by dpr for logical viewport size
    const viewWidth = graphCanvas.width / dpr;
    const viewHeight = graphCanvas.height / dpr;

    // Draw rulers if enabled
    if (this.props.showRuler) {
      this.drawRulerBackground(ctx, rulerSize, viewWidth, viewHeight);
      const tickInfo = this.calculateTickInfo(cameraState.scale);
      this.drawHorizontalRuler(ctx, cameraState, tickInfo, rulerSize, viewWidth);
      this.drawVerticalRuler(ctx, cameraState, tickInfo, rulerSize, viewHeight);
    }

    // Draw crosshair if enabled and mouse is inside graph area (not over rulers)
    if (
      this.props.showCrosshair &&
      this.state.isMouseInside &&
      this.state.mouseX !== null && // mouseX/Y from state are LOGICAL coords
      this.state.mouseY !== null
    ) {
      const logicalMouseX = this.state.mouseX;
      const logicalMouseY = this.state.mouseY;
      const isOverRuler = this.props.showRuler && (logicalMouseX < rulerSize || logicalMouseY < rulerSize);

      if (!isOverRuler) {
        // Pass logical coords to drawCrosshair, remove dpr
        this.drawCrosshair(ctx, logicalMouseX, logicalMouseY, rulerSize, viewWidth, viewHeight);
      }
    }
  }

  // --- Drawing Helpers ---

  private drawRulerBackground(
    ctx: CanvasRenderingContext2D,
    rulerSize: number,
    viewWidth: number, // Now logical width
    viewHeight: number // Now logical height
  ): void {
    ctx.fillStyle = this.props.rulerBackgroundColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackgroundColor;
    // Draw using logical coords
    ctx.fillRect(0, 0, rulerSize, rulerSize);
    ctx.fillRect(rulerSize, 0, viewWidth - rulerSize, rulerSize);
    ctx.fillRect(0, rulerSize, rulerSize, viewHeight - rulerSize);
  }

  // Pass DPR needed for minMajorTickDistance calculation
  private calculateTickInfo(scale: number): TickInfo {
    // minMajorTickDistance is logical, scale by DPR for physical comparison if needed, or adjust world step calc
    const minMajorTickDistance = this.props.minMajorTickDistance ?? DEFAULT_DEVTOOLS_LAYER_PROPS.minMajorTickDistance;
    // World step needed to cover the logical screen distance
    const minWorldStep = minMajorTickDistance / scale;
    const majorTickStep = calculateNiceNumber(minWorldStep);

    let minorTickStep: number;
    let minorTicksPerMajor: number;

    // This logic uses world steps, independent of DPR
    if (majorTickStep / 5 >= minWorldStep / 4) {
      minorTickStep = majorTickStep / 5;
      minorTicksPerMajor = 5;
    } else if (majorTickStep / 2 >= minWorldStep / 4) {
      minorTickStep = majorTickStep / 2;
      minorTicksPerMajor = 2;
    } else {
      minorTickStep = majorTickStep;
      minorTicksPerMajor = 1;
    }

    const precision = Math.max(0, -Math.floor(Math.log10(minorTickStep) + 1e-9));

    return { majorTickStep, minorTickStep, minorTicksPerMajor, precision };
  }

  private drawHorizontalRuler(
    ctx: CanvasRenderingContext2D,
    cameraState: TCameraState,
    tickInfo: TickInfo,
    rulerSize: number, // Logical
    viewWidth: number // Logical
  ): void {
    ctx.save(); // Save context state

    const { scale, x: worldOriginScreenX } = cameraState;
    const { minorTickStep, minorTicksPerMajor, precision } = tickInfo;

    const worldViewLeft = (rulerSize - worldOriginScreenX) / scale;
    const worldViewRight = (viewWidth - worldOriginScreenX) / scale;

    const firstMinorTickWorldX = Math.floor(worldViewLeft / minorTickStep) * minorTickStep;

    // Set styles within save/restore block
    ctx.strokeStyle = this.props.rulerTickColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor;
    ctx.fillStyle = this.props.rulerTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor;
    ctx.font = this.props.rulerTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const minorTickLength = MAJOR_TICK_LENGTH * MINOR_TICK_LENGTH_FACTOR;
    const majorTickLength = MAJOR_TICK_LENGTH;
    const textOffsetY = rulerSize - 5;

    ctx.beginPath();
    let currentWorldX = firstMinorTickWorldX;
    let tickCount = Math.round(currentWorldX / minorTickStep);

    while (currentWorldX <= worldViewRight + minorTickStep) {
      const logicalScreenX = currentWorldX * scale + worldOriginScreenX;
      if (logicalScreenX >= rulerSize) {
        const isMajorTick = Math.abs(tickCount % minorTicksPerMajor) < 1e-9;
        const tickLength = isMajorTick ? majorTickLength : minorTickLength;
        const tickStartY = rulerSize - tickLength;
        ctx.moveTo(logicalScreenX, tickStartY);
        ctx.lineTo(logicalScreenX, rulerSize);
        if (isMajorTick) {
          ctx.fillText(currentWorldX.toFixed(precision), logicalScreenX, textOffsetY);
        }
      }
      currentWorldX += minorTickStep;
      tickCount++;
    }
    ctx.stroke();

    ctx.restore(); // Restore context state
  }

  private drawVerticalRuler(
    ctx: CanvasRenderingContext2D,
    cameraState: TCameraState,
    tickInfo: TickInfo,
    rulerSize: number, // Logical
    viewHeight: number // Logical
  ): void {
    ctx.save(); // Save context state

    const { scale, y: worldOriginScreenY } = cameraState;
    const { minorTickStep, minorTicksPerMajor, precision } = tickInfo;

    const worldViewTop = (rulerSize - worldOriginScreenY) / scale;
    const worldViewBottom = (viewHeight - worldOriginScreenY) / scale;

    const firstMinorTickWorldY = Math.floor(worldViewTop / minorTickStep) * minorTickStep;

    ctx.strokeStyle = this.props.rulerTickColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor;
    ctx.fillStyle = this.props.rulerTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor;
    ctx.font = this.props.rulerTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const minorTickLength = MAJOR_TICK_LENGTH * MINOR_TICK_LENGTH_FACTOR;
    const majorTickLength = MAJOR_TICK_LENGTH;
    const textOffsetX = rulerSize - majorTickLength - 5;

    ctx.beginPath();
    let currentWorldY = firstMinorTickWorldY;
    let tickCount = Math.round(currentWorldY / minorTickStep);

    while (currentWorldY <= worldViewBottom + minorTickStep) {
      const logicalScreenY = currentWorldY * scale + worldOriginScreenY;
      if (logicalScreenY >= rulerSize) {
        const isMajorTick = Math.abs(tickCount % minorTicksPerMajor) < 1e-9;
        const tickLength = isMajorTick ? majorTickLength : minorTickLength;
        const tickStartX = rulerSize - tickLength;

        ctx.moveTo(tickStartX, logicalScreenY);
        ctx.lineTo(rulerSize, logicalScreenY);

        if (isMajorTick) {
          ctx.save();
          ctx.translate(textOffsetX, logicalScreenY);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(currentWorldY.toFixed(precision), 0, 0);
          ctx.restore();
        }
      }
      currentWorldY += minorTickStep;
      tickCount++;
    }
    ctx.stroke();

    ctx.restore(); // Restore context state
  }

  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    logicalMouseX: number,
    logicalMouseY: number,
    rulerSize: number, // Logical
    viewWidth: number, // Logical
    viewHeight: number // Logical
  ): void {
    const camera = this.context.camera;
    if (!camera) return;

    const [worldX, worldY] = camera.applyToPoint(logicalMouseX, logicalMouseY);

    // --- Draw Lines (Using Logical Coords) ---
    ctx.strokeStyle = this.props.crosshairColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(logicalMouseX, rulerSize);
    ctx.lineTo(logicalMouseX, viewHeight);
    ctx.moveTo(rulerSize, logicalMouseY);
    ctx.lineTo(viewWidth, logicalMouseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Draw Coordinate Text ---
    const coordText = `X: ${worldX.toFixed(1)}, Y: ${worldY.toFixed(1)}`;
    const currentFont = this.props.crosshairTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextFont;
    ctx.font = currentFont; // Set font before measuring
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Use measureText helper - it returns LOGICAL width
    const logicalTextWidth = measureText(coordText, currentFont);

    // Use logical font size for height calculation
    const logicalFontSize = parseInt(ctx.font, 10);
    const logicalTextHeight = logicalFontSize; // Use parsed size directly
    const logicalPadding = 4; // Logical padding

    // Position text box using LOGICAL coordinates
    const textRectX = rulerSize + logicalPadding;
    const textRectY = rulerSize + logicalPadding;
    // Size text box using LOGICAL dimensions
    const textRectWidth = logicalTextWidth + 2 * logicalPadding;
    const textRectHeight = logicalTextHeight + 2 * logicalPadding;

    // Draw background rect using logical coordinates
    ctx.fillStyle =
      this.props.crosshairTextBackgroundColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextBackgroundColor;
    ctx.fillRect(textRectX, textRectY, textRectWidth, textRectHeight);

    // Draw text using logical coordinates
    ctx.fillStyle = this.props.crosshairTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextColor;
    ctx.fillText(coordText, textRectX + logicalPadding, textRectY + logicalPadding);
  }
}
