import { IRect, Rect, TRect } from "../../../../utils/types/shapes";
import { PointerGrid } from "./PointerGrid";
import { BlockListStore } from "../../../../store/block/BlocksList";
import { TBelowLayerContext } from "./BelowLayer";
import { Component } from "../../../../../lib/lib/Component";

export class Background extends Component {
  private extendedUsableRect: IRect = new Rect(0, 0, 0, 0);

  private blocksStore: BlockListStore;

  protected readonly unsubscribe: () => void;

  public declare context: TBelowLayerContext;

  public constructor(props: {}, context: TBelowLayerContext) {
    super(props, context);

    this.unsubscribe = this.subscribe();
  }

  public render() {
    const cameraState = this.context.camera.getCameraState();

    this.context.ctx.fillStyle = this.context.colors.canvas.belowLayerBackground;
    this.context.ctx.fillRect(
      -cameraState.relativeX,
      -cameraState.relativeY,
      cameraState.relativeWidth,
      cameraState.relativeHeight
    );

    this.context.ctx.lineWidth = Math.floor(3 / cameraState.scale);
    this.context.ctx.strokeStyle = this.context.colors.canvas.border;
    this.context.ctx.strokeRect(
      this.extendedUsableRect.x,
      this.extendedUsableRect.y,
      this.extendedUsableRect.width,
      this.extendedUsableRect.height
    );

    this.context.ctx.fillStyle = this.context.colors.canvas.layerBackground;

    this.context.ctx.fillRect(
      this.extendedUsableRect.x,
      this.extendedUsableRect.y,
      this.extendedUsableRect.width,
      this.extendedUsableRect.height
    );

    this.context.ctx.fillStyle = "black";
    this.context.ctx.font = "48px serif";
    return;
  }

  protected subscribe() {
    this.blocksStore = this.context.graph.rootStore.blocksList;

    return this.blocksStore.$usableRect.subscribe((usableRect) => {
      this.setupExtendedUsableRect(usableRect);

      this.performRender();
    });
  }

  private setupExtendedUsableRect(usableRect: TRect) {
    this.extendedUsableRect.x = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    this.extendedUsableRect.y = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    this.extendedUsableRect.width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    this.extendedUsableRect.height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe();
  }

  public updateChildren() {
    return [PointerGrid.create(this.extendedUsableRect)];
  }
}
