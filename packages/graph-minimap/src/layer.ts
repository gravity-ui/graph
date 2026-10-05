import { Layer, LayerContext, LayerProps, TCameraState, computeCssVariable } from "@gravity-ui/graph";

export type TMiniMapLocation =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | Partial<Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right">>;

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
  private readonly minimapCanvas: HTMLCanvasElement;
  private minimapWidth: number;
  private minimapHeight: number;
  private relativeX: number;
  private relativeY: number;
  private scale: number;
  private cameraBorderSize: number;
  private cameraBorderColor: string;

  constructor(props: MiniMapLayerProps) {
    const classNames = [...(Array.isArray(props.classNames) ? props.classNames : []), "graph-minimap"];

    super({
      canvas: {
        zIndex: 300,
        classNames,
        transformByCameraPosition: false,
      },
      ...props,
    });

    this.minimapCanvas = this.requireCanvas();

    this.minimapWidth = this.props.width ?? 200;
    this.minimapHeight = this.props.height ?? 200;
    this.cameraBorderSize = this.props.cameraBorderSize ?? 2;
    this.cameraBorderColor = this.props.cameraBorderColor ?? "rgba(255, 119, 0, 0.9)";
    this.relativeX = 0;
    this.relativeY = 0;
    this.scale = 1;
  }

  protected afterInit(): void {
    this.applyPositionStyle();

    // Fires immediately with the current value — initialises scale/relativeX/Y before the first render.
    // Also fires on every subsequent usableRect change (blocks moved/resized/added/removed).
    this.onSignal(this.props.graph.hitTest.$usableRect, () => {
      this.calculateViewPortCoords();
      this.performRender();
    });

    this.onGraphEvent("colors-changed", () => this.performRender());

    // block-change / batched geometry during drag — recalculate coords when blocks move
    const onBlocksMoved = () => {
      this.calculateViewPortCoords();
      this.performRender();
    };
    this.onGraphEvent("block-change", onBlocksMoved);
    this.onGraphEvent("blocks-geometry-change", onBlocksMoved);

    this.onCanvasEvent("mousedown", this.handleMouseDownEvent);

    super.afterInit();
  }

  protected onCameraChange(_camera: TCameraState): void {
    this.performRender();
  }

  protected updateCanvasSize(): void {
    const canvas = this.minimapCanvas;
    const dpr = this.getDRP();
    canvas.width = this.minimapWidth * dpr;
    canvas.height = this.minimapHeight * dpr;
  }

  protected render(): void {
    if (!this.context?.ctx) return;

    const usableRect = this.props.graph.api.getUsableRect();
    if (usableRect.width === 0 && usableRect.height === 0) {
      this.resetTransform();
      return;
    }

    this.resetTransform();
    this.context.ctx.scale(this.scale, this.scale);
    this.context.ctx.translate(-this.relativeX, -this.relativeY);

    this.renderUsableRectBelow();
    this.renderBlocks();
    this.drawCameraBorderFrame();
  }

  private applyPositionStyle(): void {
    const canvas = this.minimapCanvas;
    Object.assign(canvas.style, this.getPositionOfMiniMap(this.props.location), {
      width: `${this.minimapWidth}px`,
      height: `${this.minimapHeight}px`,
    });
  }

  private calculateViewPortCoords(): void {
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

  // eslint-disable-next-line complexity
  private drawCameraBorderFrame(): void {
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
    location: TMiniMapLocation = "topLeft"
  ): Pick<CSSStyleDeclaration, "top" | "left" | "bottom" | "right"> {
    const offsets =
      typeof location === "string"
        ? {
            topLeft: { top: "0px", left: "0px" },
            topRight: { top: "0px", right: "0px" },
            bottomLeft: { bottom: "0px", left: "0px" },
            bottomRight: { bottom: "0px", right: "0px" },
          }[location]
        : location;
    return {
      top: "top" in offsets ? offsets.top ?? "unset" : "unset",
      left: "left" in offsets ? offsets.left ?? "unset" : "unset",
      bottom: "bottom" in offsets ? offsets.bottom ?? "unset" : "unset",
      right: "right" in offsets ? offsets.right ?? "unset" : "unset",
    };
  }

  private renderUsableRectBelow(): void {
    const usableRect = this.props.graph.api.getUsableRect();

    this.context.ctx.fillStyle = computeCssVariable(this.context.colors.canvas.layerBackground);
    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;

    this.context.ctx.fillRect(xPos, yPos, width, height);
  }

  private renderBlocks(): void {
    const blocks = this.props.graph.rootStore.blocksList.$blocks.value;

    blocks.forEach((block) => {
      const viewComponent = block.getViewComponent();

      viewComponent?.renderMinimalisticBlock(this.context.ctx);
    });
  }

  private onCameraDrag(event: MouseEvent): void {
    const cameraState = this.props.camera.getCameraState();

    const x = -(this.relativeX + event.offsetX / this.scale) + cameraState.relativeWidth / 2;
    const y = -(this.relativeY + event.offsetY / this.scale) + cameraState.relativeHeight / 2;

    const dx = x * cameraState.scale - cameraState.x;
    const dy = y * cameraState.scale - cameraState.y;

    this.context.camera.move(dx, dy);
  }

  private handleMouseDownEvent = (rootEvent: MouseEvent): void => {
    rootEvent.stopPropagation();
    this.onCameraDrag(rootEvent);

    this.context.graph.dragService.startDrag(
      { onUpdate: (event: MouseEvent) => this.onCameraDrag(event) },
      { stopOnMouseLeave: true, autopanning: false, cursor: "move" }
    );
  };
}
