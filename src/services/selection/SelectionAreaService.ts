import { Emitter } from "../../utils/Emitter";
import { EVENTS } from "../../utils/types/events";
import { Block } from "../../components/canvas/blocks/Block";
import { getXY, isBlock, isMetaKeyEvent } from "../../utils/functions";
import { Graph } from "../../graph";
import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../graphEvents";
import { selectBlockList } from "../../store/block/selectors";
import { dragListener } from "../../utils/functions/dragListener";
import { Anchor } from "../../components/canvas/anchors";
import { Component } from "../../../lib/lib/Component";

function getSelectionRect(sx: number, sy: number, ex: number, ey: number): number[] {
  if (sx > ex) [sx, ex] = [ex, sx];
  if (sy > ey) [sy, ey] = [ey, sy];
  return [sx, sy, ex - sx, ey - sy];
}

export class SelectionAreaService extends Emitter {
  protected selectionStartPoint?: [number, number];

  protected unmountCbs = [];

  constructor(protected graph: Graph) {
    super();

    this.unmountCbs.push(this.graph.on("mousedown", this.handleMouseDown, { capture: true }));
  }

  public unmount() {
    this.unmountCbs?.forEach((cb) => cb?.());
  }

  public startAreaSelection(event: MouseEvent) {
    this.selectionStartPoint = getXY(this.getGraphCanvas(), event);
    this.emit(EVENTS.SELECTION_START, event);
  }

  public updateAreaSelection(event: MouseEvent) {
    this.emit(EVENTS.SELECTION_UPDATE, event);
  }

  public endAreaSelection(event: MouseEvent) {
    if (!this.selectionStartPoint) return;

    const xy = getXY(this.getGraphCanvas(), event);
    const start = this.selectionStartPoint;
    const selectionRect = getSelectionRect(start[0], start[1], xy[0], xy[1]);
    const cameraRect = this.graph.cameraService.applyToRect(...selectionRect);

    this.emit(EVENTS.SELECTION_END, event);
    this.applySelectedAreaByAction(...cameraRect);
    this.selectionStartPoint = undefined;
  }

  public applySelectedAreaByAction(...args: number[]): void;

  public applySelectedAreaByAction(x: number, y: number, w: number, h: number) {
    const foundComponents: Component[] = this.graph.hitTest.testHitBox({
      minX: x,
      minY: y,
      maxX: x + w,
      maxY: y + h,
      x,
      y,
    });

    const blocks = foundComponents.filter((component: Component) => isBlock(component));
    const blocksIds = blocks.map((component: Block) => component.state.id);

    selectBlockList(this.graph).updateBlocksSelection(blocksIds, !!blocks.length);
  }

  protected getGraphCanvas() {
    return this.graph.getGraphCanvas();
  }

  protected getOwnerDocument() {
    return this.graph.getGraphHTML().ownerDocument;
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (target instanceof Anchor || target instanceof Block) {
      return;
    }
    if (event && isMetaKeyEvent(event)) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.getOwnerDocument())
        .on(EVENTS.DRAG_START, (event: MouseEvent) => this.startAreaSelection(event))
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.updateAreaSelection(event))
        .on(EVENTS.DRAG_END, (event: MouseEvent) => this.endAreaSelection(event));
    }
  };
}
