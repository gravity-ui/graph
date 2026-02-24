import { Component } from "@gravity-ui/graph-canvas-core";
import { TRect } from "../../../../utils/types/shapes";

import { Background } from "./Background";
import { TBelowLayerContext } from "./BelowLayer";

export class PointerGrid extends Component<TRect, TBelowLayerContext> {
  public declare props: TRect;

  public declare context: TBelowLayerContext;

  private fakeCanvasContext?: CanvasRenderingContext2D;

  private pattern: {
    normal: CanvasPattern;
    simple: CanvasPattern;
  };

  private activePattern: CanvasPattern;

  // need to understand when should remake pattern
  private currentDotsColor: string;

  constructor(props: TRect, parent: Background) {
    super(props, parent as Component);

    this.props = props;

    this.shouldUpdateChildren = false;
    this.shouldRenderChildren = false;
    this.currentDotsColor = this.context.colors.canvas.dots;

    this.initPattern();
  }

  public render() {
    if (this.currentDotsColor !== this.context.colors.canvas.dots) {
      this.initPattern();
      this.currentDotsColor = this.context.colors.canvas.dots;
    }

    this.context.ctx.fillStyle = this.activePattern;
    this.context.ctx.fillRect(this.props.x, this.props.y, this.props.width, this.props.height);
    return;
  }

  public willIterate() {
    super.willIterate();

    const cameraState = this.context.camera.getCameraState();

    this.shouldRender = cameraState.scale >= this.context.constants.block.SCALES[0];

    if (this.shouldRender) {
      this.activePattern =
        cameraState.scale > this.context.constants.block.SCALES[2] ? this.pattern.normal : this.pattern.simple;
    }
  }

  private initPattern() {
    this.fakeCanvasContext = this.createFakeCanvasContext();

    this.pattern = {
      normal: this.createPattern(false, this.fakeCanvasContext),
      simple: this.createPattern(true, this.fakeCanvasContext),
    };

    this.activePattern = this.pattern.normal;

    this.fakeCanvasContext = undefined;
  }

  private createPattern(simple: boolean, fakeCtx: CanvasRenderingContext2D) {
    const size = 2;
    const bigSize = simple ? size * 3 : size * 2;
    const rows = 5;
    const cols = 5;
    const canvasWidth = rows * this.context.constants.system.GRID_SIZE;
    const canvasHeight = cols * this.context.constants.system.GRID_SIZE;
    const GRID_SIZE = this.context.constants.system.GRID_SIZE;

    fakeCtx.canvas.width = canvasWidth;
    fakeCtx.canvas.height = canvasHeight;
    fakeCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    fakeCtx.fillStyle = this.context.colors.canvas.dots;
    for (let i = -1; i < rows + 1; i += 1) {
      for (let j = -1; j < cols + 1; j += 1) {
        if (i % 5 === 0 && j % 5 === 0) {
          fakeCtx.fillRect(i * GRID_SIZE - bigSize / 2, j * GRID_SIZE - bigSize / 2, bigSize, bigSize);
        } else if (!simple) {
          fakeCtx.fillRect(i * GRID_SIZE - size / 2, j * GRID_SIZE - size / 2, size, size);
        }
      }
    }

    return this.context.ctx.createPattern(fakeCtx.canvas, "repeat");
  }

  private createFakeCanvasContext(): CanvasRenderingContext2D {
    return document.createElement("canvas").getContext("2d");
  }
}
