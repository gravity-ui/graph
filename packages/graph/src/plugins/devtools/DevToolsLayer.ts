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

import "./devtools-layer.css"; // Import the CSS file after type imports

/**
 * DevToolsLayer: Provides rulers and crosshairs for precise positioning and measurement.
 * Uses two HTML divs with backdrop-filter for ruler background and blur.
 */
export class DevToolsLayer extends Layer<TDevToolsLayerProps, LayerContext, TDevToolsLayerState> {
  public state = INITIAL_DEVTOOLS_LAYER_STATE;

  // HTML elements for ruler backgrounds
  private horizontalRulerBgEl: HTMLDivElement | null = null;
  private verticalRulerBgEl: HTMLDivElement | null = null;

  constructor(props: TDevToolsLayerProps) {
    const finalProps = { ...DEFAULT_DEVTOOLS_LAYER_PROPS, ...props };
    super({
      canvas: {
        zIndex: 150, // Canvas (ticks, text) above HTML background
        classNames: ["devtools-layer-canvas", "no-pointer-events"],
        respectPixelRatio: true,
        transformByCameraPosition: false,
        ...(props.canvas ?? {}),
      },
      html: {
        zIndex: 149, // HTML backgrounds below the canvas
        classNames: ["devtools-layer-html", "no-pointer-events"], // Keep base class for container
        transformByCameraPosition: false, // Fixed to viewport
        ...(props.html ?? {}),
      },
      ...finalProps,
    });
  }

  protected propsChanged(nextProps: TDevToolsLayerProps): void {
    super.propsChanged(nextProps); // Always call super

    const htmlContainer = this.getHTML();
    if (!htmlContainer) return;

    // Update CSS variables on the container (used by devtools-layer.css)
    if (this.props.rulerBackgroundColor !== nextProps.rulerBackgroundColor) {
      const bgColorValue = nextProps.rulerBackgroundColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackgroundColor;
      htmlContainer.style.setProperty("--devtools-ruler-bg-color", bgColorValue);
    }

    if (this.props.rulerBackdropBlur !== nextProps.rulerBackdropBlur) {
      const blurValue = nextProps.rulerBackdropBlur ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackdropBlur;
      htmlContainer.style.setProperty("--devtools-ruler-blur", `${blurValue}px`);
    }

    // Rerender still needed if ruler size or visibility changes to update div positions/display
    if (this.props.rulerSize !== nextProps.rulerSize) {
      const sizeValue = nextProps.rulerSize ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize;
      htmlContainer.style.setProperty("--devtools-ruler-size", `${sizeValue}px`);
    }

    if (this.props.showRuler !== nextProps.showRuler) {
      htmlContainer.style.setProperty("--devtools-ruler-display", nextProps.showRuler ? "block" : "none");
    }
  }

  protected afterInit(): void {
    this.onGraphEvent("camera-change", () => this.performRender());
    this.onRootEvent(
      "mousemove",
      (event: MouseEvent): void => {
        const canvas = this.context.graphCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        this.setState({
          mouseX: event.clientX - rect.left,
          mouseY: event.clientY - rect.top,
          isMouseInside: true,
        });
      },
      { capture: true }
    );
    this.onRootEvent("mouseenter", (): void => {
      this.setState({ isMouseInside: true });
    });
    this.onRootEvent("mouseleave", (): void => {
      this.setState({ isMouseInside: false, mouseX: null, mouseY: null });
    });

    // Create HTML elements for ruler backgrounds if showRuler is initially true
    const htmlContainer = this.getHTML();
    if (htmlContainer) {
      // Set initial CSS variables on the container (can still be useful)
      const initialBlur = this.props.rulerBackdropBlur ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackdropBlur;
      const initialSize = this.props.rulerSize ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize;
      const initialBgColor = this.props.rulerBackgroundColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerBackgroundColor;
      const initialDisplay = this.props.showRuler ? "block" : "none";
      htmlContainer.style.setProperty("--devtools-ruler-blur", `${initialBlur}px`);
      htmlContainer.style.setProperty("--devtools-ruler-bg-color", initialBgColor);
      htmlContainer.style.setProperty("--devtools-ruler-size", `${initialSize}px`);
      htmlContainer.style.setProperty("--devtools-ruler-display", initialDisplay);
      // Create the divs
      this.horizontalRulerBgEl = document.createElement("div");
      this.verticalRulerBgEl = document.createElement("div");

      // Style using CSS variables defined on the parent
      // Removed commonStyle and style.cssText assignment
      // const commonStyle = `...`;
      // this.horizontalRulerBgEl.style.cssText = commonStyle;
      this.horizontalRulerBgEl.classList.add("devtools-ruler-bg", "devtools-ruler-bg-h");

      // this.verticalRulerBgEl.style.cssText = commonStyle;
      this.verticalRulerBgEl.classList.add("devtools-ruler-bg", "devtools-ruler-bg-v");

      htmlContainer.appendChild(this.horizontalRulerBgEl);
      htmlContainer.appendChild(this.verticalRulerBgEl);
    }

    super.afterInit();
  }

  protected render(): void {
    if (!this.context.ctx || !this.context.graphCanvas) {
      return;
    }

    this.resetTransform(); // Clears canvas & applies base transform

    const { ctx, camera, graphCanvas } = this.context;
    const cameraState = camera.getCameraState();
    const dpr = this.getDRP();
    const rulerSize = this.props.rulerSize ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize;
    const viewWidth = graphCanvas.width / dpr; // Logical width
    const viewHeight = graphCanvas.height / dpr; // Logical height

    // Draw ruler ticks/text if enabled
    if (this.props.showRuler) {
      const tickInfo = this.calculateTickInfo(cameraState.scale);
      this.drawHorizontalRuler(ctx, cameraState, tickInfo, rulerSize, viewWidth);
      this.drawVerticalRuler(ctx, cameraState, tickInfo, rulerSize, viewHeight);
    }

    // Draw crosshair if enabled and mouse is inside graph area (not over rulers)
    if (
      this.props.showCrosshair &&
      this.state.isMouseInside &&
      this.state.mouseX !== null &&
      this.state.mouseY !== null
    ) {
      const logicalMouseX = this.state.mouseX;
      const logicalMouseY = this.state.mouseY;
      const isOverRuler = this.props.showRuler && (logicalMouseX < rulerSize || logicalMouseY < rulerSize);

      if (!isOverRuler) {
        this.drawCrosshair(ctx, logicalMouseX, logicalMouseY, rulerSize, viewWidth, viewHeight);
      }
    }
  }

  // --- Drawing Helpers ---

  private calculateTickInfo(scale: number): TickInfo {
    const minMajorTickDistance = this.props.minMajorTickDistance ?? DEFAULT_DEVTOOLS_LAYER_PROPS.minMajorTickDistance;
    const minWorldStep = minMajorTickDistance / scale;
    const majorTickStep = calculateNiceNumber(minWorldStep);

    let minorTickStep: number;
    let minorTicksPerMajor: number;

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
    rulerSize: number,
    viewWidth: number
  ): void {
    ctx.save();

    const { scale, x: worldOriginScreenX } = cameraState;
    const { minorTickStep, minorTicksPerMajor, precision } = tickInfo;

    const worldViewLeft = (rulerSize - worldOriginScreenX) / scale;
    const worldViewRight = (viewWidth - worldOriginScreenX) / scale;

    const firstMinorTickWorldX = Math.floor(worldViewLeft / minorTickStep) * minorTickStep;

    const currentFont = this.props.rulerTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextFont;
    ctx.strokeStyle = this.props.rulerTickColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor;
    ctx.fillStyle = this.props.rulerTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor;
    ctx.font = currentFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const minorTickLength = MAJOR_TICK_LENGTH * MINOR_TICK_LENGTH_FACTOR;
    const majorTickLength = MAJOR_TICK_LENGTH;
    // Calculate padding based on font size
    const fontSize = parseInt(currentFont, 10) || 14; // Default to 14 if parse fails
    const padding = Math.max(10, fontSize * 0.6); // Proportional padding (e.g., 40% of font size, min 2px)
    const textOffsetY = rulerSize - padding;

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

    ctx.restore();
  }

  private drawVerticalRuler(
    ctx: CanvasRenderingContext2D,
    cameraState: TCameraState,
    tickInfo: TickInfo,
    rulerSize: number,
    viewHeight: number
  ): void {
    ctx.save();

    const { scale, y: worldOriginScreenY } = cameraState;
    const { minorTickStep, minorTicksPerMajor, precision } = tickInfo;

    const worldViewTop = (rulerSize - worldOriginScreenY) / scale;
    const worldViewBottom = (viewHeight - worldOriginScreenY) / scale;

    const firstMinorTickWorldY = Math.floor(worldViewTop / minorTickStep) * minorTickStep;

    const currentFont = this.props.rulerTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextFont;
    ctx.strokeStyle = this.props.rulerTickColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTickColor;
    ctx.fillStyle = this.props.rulerTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.rulerTextColor;
    ctx.font = currentFont;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const minorTickLength = MAJOR_TICK_LENGTH * MINOR_TICK_LENGTH_FACTOR;
    const majorTickLength = MAJOR_TICK_LENGTH;
    // Calculate padding based on font size
    const fontSize = parseInt(currentFont, 10) || 14; // Default to 14 if parse fails
    const padding = Math.max(4, fontSize * 0.6); // Proportional padding
    // Text offset is from ruler edge minus tick length minus padding
    const textOffsetX = rulerSize - majorTickLength - padding;

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
          // Set textAlign to center *after* rotation for centering
          ctx.textAlign = "center";
          ctx.fillText(currentWorldY.toFixed(precision), 0, 0);
          ctx.restore();
        }
      }
      currentWorldY += minorTickStep;
      tickCount++;
    }
    ctx.stroke();

    ctx.restore();
  }

  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    logicalMouseX: number,
    logicalMouseY: number,
    rulerSize: number,
    viewWidth: number,
    viewHeight: number
  ): void {
    const camera = this.context.camera;
    if (!camera) return;

    const [worldX, worldY] = camera.applyToPoint(logicalMouseX, logicalMouseY);

    // Draw Lines
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

    // Draw Coordinate Text
    const coordText = `X: ${worldX.toFixed(1)}, Y: ${worldY.toFixed(1)}`;
    const currentFont = this.props.crosshairTextFont ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextFont;
    ctx.font = currentFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const logicalTextWidth = measureText(coordText, currentFont);
    const logicalFontSize = parseInt(ctx.font, 10);
    const logicalTextHeight = logicalFontSize;
    const logicalPadding = 4;

    const textRectX = rulerSize + logicalPadding;
    const textRectY = rulerSize + logicalPadding;
    const textRectWidth = logicalTextWidth + 2 * logicalPadding;
    const textRectHeight = logicalTextHeight + 2 * logicalPadding;

    ctx.fillStyle =
      this.props.crosshairTextBackgroundColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextBackgroundColor;
    ctx.fillRect(textRectX, textRectY, textRectWidth, textRectHeight);

    ctx.fillStyle = this.props.crosshairTextColor ?? DEFAULT_DEVTOOLS_LAYER_PROPS.crosshairTextColor;
    ctx.fillText(coordText, textRectX + logicalPadding, textRectY + logicalPadding);
  }
}
