import { Signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { HitBox, HitBoxData } from "../../../services/HitTest";
import { getXY } from "../../../utils/functions";
import { dragListener } from "../../../utils/functions/dragListener";
import { EVENTS } from "../../../utils/types/events";
import { EventedComponent } from "../EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type GraphComponentContext = TComponentContext &
  TGraphLayerContext & {
    graph: Graph;
  };

export class GraphComponent<
  Props extends TComponentProps = TComponentProps,
  State extends TComponentState = TComponentState,
  Context extends GraphComponentContext = GraphComponentContext,
> extends EventedComponent<Props, State, Context> {
  public hitBox: HitBox;

  private unsubscribe: (() => void)[] = [];

  constructor(props: Props, parent: Component) {
    super(props, parent);
    this.hitBox = new HitBox(this, this.context.graph.hitTest);
  }

  protected onDrag({
    onDragStart,
    onDragUpdate,
    onDrop,
    isDraggable,
  }: {
    onDragStart?: (_event: MouseEvent) => void | boolean;
    onDragUpdate?: (
      diff: {
        prevCoords: [number, number];
        currentCoords: [number, number];
        diffX: number;
        diffY: number;
      },
      _event: MouseEvent
    ) => void;
    onDrop?: (_event: MouseEvent) => void;
    isDraggable?: (event: MouseEvent) => boolean;
  }) {
    let startDragCoords: [number, number];
    return this.addEventListener("mousedown", (event: MouseEvent) => {
      if (!isDraggable?.(event)) {
        return;
      }
      event.stopPropagation();
      dragListener(this.context.ownerDocument)
        .on(EVENTS.DRAG_START, (event: MouseEvent) => {
          if (onDragStart?.(event) === false) {
            return;
          }
          const xy = getXY(this.context.canvas, event);
          startDragCoords = this.context.camera.applyToPoint(xy[0], xy[1]);
        })
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => {
          if (!startDragCoords.length) return;

          const [canvasX, canvasY] = getXY(this.context.canvas, event);
          const currentCoords = this.context.camera.applyToPoint(canvasX, canvasY);

          const diffX = (startDragCoords[0] - currentCoords[0]) | 0;
          const diffY = (startDragCoords[1] - currentCoords[1]) | 0;

          onDragUpdate?.({ prevCoords: startDragCoords, currentCoords, diffX, diffY }, event);
          startDragCoords = currentCoords;
        })
        .on(EVENTS.DRAG_END, (_event: MouseEvent) => {
          startDragCoords = undefined;
          onDrop?.(_event);
        });
    });
  }

  protected subscribeSignal<T>(signal: Signal<T>, cb: (v: T) => void) {
    this.unsubscribe.push(signal.subscribe(cb));
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
    this.destroyHitBox();
  }

  public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean) {
    this.hitBox.update(minX, minY, maxX, maxY, force);
  }

  protected willIterate(): void {
    super.willIterate();
    if (!this.firstIterate) {
      this.shouldRender = this.isVisible();
    }
  }

  protected isVisible() {
    return this.context.camera.isRectVisible(...this.getHitBox());
  }

  public getHitBox() {
    return this.hitBox.getRect();
  }

  public removeHitBox() {
    this.hitBox.remove();
  }

  public destroyHitBox() {
    this.hitBox.destroy();
  }

  public onHitBox(_: HitBoxData) {
    return this.isIterated();
  }
}
