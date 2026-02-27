import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { Layer, LayerContext, LayerProps } from "../../services/Layer";
import { computeCssVariable } from "../../utils/functions";

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

export class MiniMapLayer extends Layer<MiniMapLayerProps> {
  public declare context: Omit<TGraphLayerContext, "ownerDocument" | "root">;

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

    this.minimapWidth = this.props.width ?? 200;
    this.minimapHeight = this.props.height ?? 200;
    this.cameraBorderSize = this.props.cameraBorderSize ?? 2;
    this.cameraBorderColor = this.props.cameraBorderColor ?? "rgba(255, 119, 0, 0.9)";
    this.relativeX = 0;
    this.relativeY = 0;
    this.scale = 1;
  }

  protected afterInit(): void {
    this.injectPositionStyle();

    // Fires immediately with the current value — initialises scale/relativeX/Y before the first render.
    // Also fires on every subsequent usableRect change (blocks moved/resized/added/removed).
    this.onSignal(this.props.graph.hitTest.$usableRect, () => {
      this.calculateViewPortCoords();
      this.performRender();
    });

    this.onGraphEvent("camera-change", () => this.performRender());
    this.onGraphEvent("colors-changed", () => this.performRender());

    // block-change recalculates coords: blocks may change size/position
    // without the usableRect bounding box itself changing.
    this.onGraphEvent("block-change", () => {
      this.calculateViewPortCoords();
      this.performRender();
    });

    if (this.canvas) {
      this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
    }

    super.afterInit();
  }

  protected updateCanvasSize(): void {
    const dpr = this.getDRP();
    this.canvas.width = this.minimapWidth * dpr;
    this.canvas.height = this.minimapHeight * dpr;
  }

  protected willRender(): void {
    if (this.firstRender) {
      this.canvas.style.width = `${this.minimapWidth}px`;
      this.canvas.style.height = `${this.minimapHeight}px`;
    }
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

  private injectPositionStyle(): void {
    const minimapPosition = this.getPositionOfMiniMap(this.props.location);
    const style = document.createElement("style");
    style.innerHTML = `
      .layer.graph-minimap {
        top: ${minimapPosition.top};
        left: ${minimapPosition.left};
        bottom: ${minimapPosition.bottom};
        right: ${minimapPosition.right};
        width: ${this.minimapWidth}px;
        height: ${this.minimapHeight}px;
        border: 2px solid var(--g-color-private-cool-grey-1000-solid);
        background: lightgrey;
      }`;
    this.root.appendChild(style);
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
