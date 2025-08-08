import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Layer, LayerContext, LayerProps } from "../../services/Layer";
import { computeCssVariable, noop } from "../../utils/functions";
import { dragListener } from "../../utils/functions/dragListener";
import { EVENTS } from "../../utils/types/events";

export type TMiniMapLocation =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right">;

export type MiniMapLayerProps = LayerProps & {
  width?: number;
  height?: number;
  classNames?: string[];
  cameraBorderSize?: number;
  cameraBorderColor?: string;
  location?: TMiniMapLocation;
};

export type MiniMapLayerContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

export class MiniMapLayer extends Layer<MiniMapLayerProps, MiniMapLayerContext> {
  declare public context: Omit<TGraphLayerContext, "ownerDocument" | "root">;

  private minimapWidth: number;
  private minimapHeight: number;
  private relativeX: number;
  private relativeY: number;
  private scale: number;
  private cameraBorderSize: number;
  private cameraBorderColor: string;
  private unSubscribeUsableRectLoaded: typeof noop;

  constructor(props: MiniMapLayerProps) {
    const classNames = Array.isArray(props.classNames) ? props.classNames : [];
    classNames.push("graph-minimap");

    super({
      canvas: {
        zIndex: 300,
        classNames,
        transformByCameraPosition: false,
      },
      ...props,
    });

    this.minimapWidth = this.props.width || 200;
    this.minimapHeight = this.props.height || 200;
    this.cameraBorderSize = this.props.cameraBorderSize || 2;
    this.cameraBorderColor = this.props.cameraBorderColor || "rgba(255, 119, 0, 0.9)";
    this.relativeX = 0;
    this.relativeY = 0;
    this.scale = 1;
  }

  protected afterInit(): void {
    const minimapPosition = this.getPositionOfMiniMap(this.props.location);
    const style = document.createElement("style");
    style.innerHTML = `
      .layer.graph-minimap {
        top: ${minimapPosition.top};
        left: ${minimapPosition.left};
        bottom: ${minimapPosition.bottom};
        right: ${minimapPosition.right};
        width: ${this.props.width || 200}px;
        height: ${this.props.height || 200}px;
        border: 2px solid var(--g-color-private-cool-grey-1000-solid);
        background: lightgrey;
      }`;

    this.root.appendChild(style);

    // Set up event subscriptions here if usableRect is already loaded
    const usableRect = this.props.graph.api.getUsableRect();
    if (!(usableRect.height === 0 && usableRect.width === 0 && usableRect.x === 0 && usableRect.y === 0)) {
      this.calculateViewPortCoords();
      this.rerenderMapContent();

      // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
      this.onGraphEvent("camera-change", this.rerenderMapContent);
      this.onGraphEvent("colors-changed", this.rerenderMapContent);
      this.onGraphEvent("block-change", this.onBlockUpdated);

      // Use canvasOn wrapper method for DOM event listeners to ensure proper cleanup
      if (this.canvas) {
        this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
      }
    }
    this.onSignal(this.props.graph.hitTest.$usableRect, () => {
      this.onBlockUpdated();
      this.calculateViewPortCoords();
      this.rerenderMapContent();
    });

    super.afterInit();
  }

  protected updateCanvasSize(): void {
    this.rerenderMapContent();
  }

  private calculateViewPortCoords() {
    const usableRect = this.props.graph.api.getUsableRect();

    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;

    if (width > height) {
      this.scale = this.minimapWidth / width;
    } else {
      this.scale = this.minimapHeight / height;
    }

    // if minimap not rectangle
    if (height > this.minimapHeight / this.scale) this.scale = this.minimapHeight / height;
    if (width > this.minimapWidth / this.scale) this.scale = this.minimapWidth / width;

    this.relativeX = xPos + width / 2 - this.minimapWidth / this.scale / 2;
    this.relativeY = yPos + height / 2 - this.minimapHeight / this.scale / 2;
  }

  private drawCameraBorderFrame() {
    const cameraState = this.props.camera.getCameraState();

    const relativeXRight = this.relativeX + this.minimapWidth / this.scale;
    const relativeYBottom = this.relativeY + this.minimapHeight / this.scale;

    let width = cameraState.relativeWidth;
    let height = cameraState.relativeHeight;
    //camera inverted
    let xPos = -cameraState.relativeX;
    let yPos = -cameraState.relativeY;

    const scaledCameraBorderSize = this.cameraBorderSize / this.scale;

    if (xPos <= this.relativeX && xPos + width <= this.relativeX) {
      xPos = this.relativeX;
      width = scaledCameraBorderSize;
    } else if (xPos <= this.relativeX && xPos + width > this.relativeX && xPos + width <= relativeXRight) {
      width = width - (this.relativeX - xPos);
      xPos = this.relativeX;
    } else if (xPos <= this.relativeX && xPos + width > relativeXRight) {
      xPos = this.relativeX;
      width = this.minimapWidth / this.scale;
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width <= relativeXRight) {
      // do nothing
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width > relativeXRight) {
      width = this.minimapWidth / this.scale - (xPos - this.relativeX);
    } else if (xPos >= relativeXRight && xPos + width > relativeXRight) {
      xPos = relativeXRight - scaledCameraBorderSize;
      width = scaledCameraBorderSize;
    }

    if (yPos <= this.relativeY && yPos + height <= this.relativeY) {
      yPos = this.relativeY;
      height = scaledCameraBorderSize;
    } else if (yPos <= this.relativeY && yPos + height > this.relativeY && yPos + height <= relativeYBottom) {
      height = height - (this.relativeY - yPos);
      yPos = this.relativeY;
    } else if (yPos <= this.relativeY && yPos + height > relativeYBottom) {
      yPos = this.relativeY;
      height = this.minimapHeight / this.scale;
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height <= relativeYBottom) {
      // do nothing
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height > relativeYBottom) {
      height = this.minimapHeight / this.scale - (yPos - this.relativeY);
    } else if (yPos >= relativeYBottom && yPos + height > relativeYBottom) {
      yPos = relativeYBottom - scaledCameraBorderSize;
      height = scaledCameraBorderSize;
    }

    this.context.ctx.lineWidth = scaledCameraBorderSize;
    this.context.ctx.strokeStyle = computeCssVariable(this.cameraBorderColor);

    this.context.ctx.strokeRect(xPos, yPos, width, height);
  }

  protected getPositionOfMiniMap(
    location: TMiniMapLocation
  ): Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right"> {
    let position: Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right"> = {
      left: "unset",
      top: "unset",
      bottom: "unset",
      right: "unset",
    };

    if (!location || location === "topLeft") {
      position.top = "0px";
      position.left = "0px";
    }

    if (location === "topRight") {
      position.top = "0px";
      position.right = "0px";
    }

    if (location === "bottomRight") {
      position.bottom = "0px";
      position.right = "0px";
    }

    if (location === "bottomLeft") {
      position.bottom = "0px";
      position.left = "0px";
    }

    if (typeof location === "object") {
      position = location;
    }

    return position;
  }

  protected willRender(): void {
    if (this.firstRender) {
      const canvas = this.getCanvas();
      const dpr = this.getDRP();

      canvas.width = this.minimapWidth * dpr;
      canvas.height = this.minimapHeight * dpr;

      canvas.style.width = `${this.minimapWidth}px`;
      canvas.style.height = `${this.minimapHeight}px`;

      this.setContext({
        canvas,
        ctx: canvas.getContext("2d"),
        camera: this.props.camera,
        constants: this.props.graph.graphConstants,
        colors: this.props.graph.graphColors,
      });
    }
  }

  protected didRender(): void {
    if (this.firstRender) {
      this.unSubscribeUsableRectLoaded = this.props.graph.hitTest.onUsableRectUpdate((usableRect) => {
        if (usableRect.height === 0 && usableRect.width === 0 && usableRect.x === 0 && usableRect.y === 0) return;

        this.calculateViewPortCoords();
        this.rerenderMapContent();

        // If the layer is already attached, set up event subscriptions here
        if (this.root) {
          // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
          this.onGraphEvent("camera-change", this.rerenderMapContent);
          this.onGraphEvent("colors-changed", this.rerenderMapContent);
          this.onGraphEvent("block-change", this.onBlockUpdated);

          // Use canvasOn wrapper method for DOM event listeners to ensure proper cleanup
          if (this.canvas) {
            this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
          }
        }

        this.unSubscribeUsableRectLoaded?.();
      });
    }
  }

  private onBlockUpdated = () => {
    this.calculateViewPortCoords();
    this.rerenderMapContent();
  };

  private rerenderMapContent = () => {
    if (!this.context?.ctx) return;

    this.resetTransform();

    this.context.ctx.scale(this.scale, this.scale);
    this.context.ctx.translate(-this.relativeX, -this.relativeY);

    this.renderUsableRectBelow();
    this.renderBlocks();
    this.drawCameraBorderFrame();
  };

  private renderUsableRectBelow() {
    const usableRect = this.props.graph.api.getUsableRect();

    this.context.ctx.fillStyle = computeCssVariable(this.context.colors.canvas.layerBackground);
    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;

    this.context.ctx.fillRect(xPos, yPos, width, height);
  }

  private renderBlocks() {
    const blocks = this.props.graph.rootStore.blocksList.$blocks.value;

    blocks.forEach((block) => {
      const viewComponent = block.getViewComponent();

      viewComponent?.renderMinimalisticBlock(this.context.ctx);
    });
  }

  private onCameraDrag(event: MouseEvent) {
    const cameraState = this.props.camera.getCameraState();

    const x = -(this.relativeX + event.offsetX / this.scale) + cameraState.relativeWidth / 2;
    const y = -(this.relativeY + event.offsetY / this.scale) + cameraState.relativeHeight / 2;

    const dx = x * cameraState.scale - cameraState.x;
    const dy = y * cameraState.scale - cameraState.y;

    this.context.camera.move(dx, dy);
  }

  private handleMouseDownEvent = (rootEvent: MouseEvent) => {
    rootEvent.stopPropagation();
    this.onCameraDrag(rootEvent);

    dragListener(this.getCanvas(), true).on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.onCameraDrag(event));
  };
}
