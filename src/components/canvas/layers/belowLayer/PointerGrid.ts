import { Background } from "./Background";
import { TBelowLayerContext } from "./BelowLayer";
import { TRect } from "../../../../utils/types/shapes";
import { Component } from "../../../../../lib/lib/Component";

export class PointerGrid extends Component {
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

  public constructor(props: TRect, parent: Background) {
    super(props, parent);

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

    const GRID_SIZE = this.context.constants.system.GRID_SIZE;
    const x1 = ((this.props.x / GRID_SIZE) | 0) * GRID_SIZE;
    const y1 = ((this.props.y / GRID_SIZE) | 0) * GRID_SIZE;
    const x2 = (((this.props.x + this.props.width) / GRID_SIZE) | 0) * GRID_SIZE;
    const y2 = (((this.props.y + this.props.height) / GRID_SIZE) | 0) * GRID_SIZE;

    this.context.ctx.fillStyle = this.activePattern;
    this.context.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
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
