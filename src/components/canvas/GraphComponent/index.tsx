import { Signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { HitBox, HitBoxData } from "../../../services/HitTest";
import { PortState, TPortId } from "../../../store/connection/port/Port";
import { getXY } from "../../../utils/functions";
import { dragListener } from "../../../utils/functions/dragListener";
import { EVENTS } from "../../../utils/types/events";
import { EventedComponent } from "../EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type GraphComponentContext = TComponentContext &
  TGraphLayerContext & {
    graph: Graph;
    affectsUsableRect?: boolean;
  };

export type TGraphComponentProps = TComponentProps & {
  interactive?: boolean;
  affectsUsableRect?: boolean;
};

export class GraphComponent<
  Props extends TGraphComponentProps = TGraphComponentProps,
  State extends TComponentState = TComponentState,
  Context extends GraphComponentContext = GraphComponentContext,
> extends EventedComponent<Props, State, Context> {
  public hitBox: HitBox;

  private unsubscribe: (() => void)[] = [];

  protected ports: Map<TPortId, PortState> = new Map();

  public getEntityId(): number | string {
    throw new Error("GraphComponent.getEntityId() is not implemented");
  }

  public get affectsUsableRect() {
    return this.props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
  }

  constructor(props: Props, parent: Component) {
    super(props, parent);

    // Determine affectsUsableRect value: explicit prop > parent context > default (true)
    this.hitBox = new HitBox(this, this.context.graph.hitTest);
    const affectsUsableRect = props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }

  public createPort(id: TPortId) {
    const port = this.context.graph.rootStore.connectionsList.claimPort(id, this);
    this.ports.set(id, port);
    return port;
  }

  public getPort(id: TPortId): PortState {
    if (!this.ports.has(id)) {
      return this.createPort(id);
    }
    return this.ports.get(id);
  }

  protected setAffectsUsableRect(affectsUsableRect: boolean) {
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }

  protected propsChanged(_nextProps: Props): void {
    if (this.affectsUsableRect !== _nextProps.affectsUsableRect) {
      this.hitBox.setAffectsUsableRect(_nextProps.affectsUsableRect);
      this.setContext({ affectsUsableRect: _nextProps.affectsUsableRect });
    }
    super.propsChanged(_nextProps);
  }

  protected contextChanged(_nextContext: Context): void {
    // If affectsUsableRect changed in context and there's no explicit prop override
    if (
      this.firstRender ||
      (this.context.affectsUsableRect !== _nextContext.affectsUsableRect && this.props.affectsUsableRect === undefined)
    ) {
      this.hitBox.setAffectsUsableRect(_nextContext.affectsUsableRect);
    }
    super.contextChanged(_nextContext);
  }

  public onChange(cb: (v: this) => void) {
    return this.addEventListener("graph-component-change", () => {
      cb(this);
    });
  }

  protected checkData() {
    if (super.checkData()) {
      this.dispatchEvent(new Event("graph-component-change"));
      return true;
    }
    return false;
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
          this.context.graph.getGraphLayer().captureEvents(this);
          this.context.graph.lockCursor("grabbing");
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
          this.context.graph.getGraphLayer().releaseCapture();
          this.context.graph.unlockCursor();
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
    this.ports.forEach((port) => {
      this.context.graph.rootStore.connectionsList.releasePort(port.id, this);
    });
    this.ports.clear();
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
