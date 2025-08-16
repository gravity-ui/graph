import Hammer from "hammerjs";

import { EventedComponent } from "../components/canvas/EventedComponent/EventedComponent";
import { Graph } from "../graph";
import { TPoint } from "../utils/types/shapes";

export interface IGestureEvent {
  target?: EventedComponent;
  sourceEvent: HammerInput;
  pointerPressed?: boolean;
  center?: TPoint;
  deltaX?: number;
  deltaY?: number;
  scale?: number;
  rotation?: number;
}

export type GestureEventNames =
  | "tap"
  | "hover"
  | "click"
  | "panstart"
  | "panmove"
  | "panend"
  | "pinchstart"
  | "pinchmove"
  | "pinchend";

export class GestureService {
  private hammer: HammerManager;
  private graph: Graph;
  private root: HTMLDivElement;
  private targetComponent?: EventedComponent;
  private pointerPressed = false;

  constructor(graph: Graph, root: HTMLDivElement) {
    this.graph = graph;
    this.root = root;
    this.hammer = new Hammer(root);
    this.setupHammer();
  }

  private setupHammer(): void {
    // Настройка распознавания жестов
    const pinch = this.hammer.get("pinch").set({ enable: true });
    const pan = this.hammer.get("pan").set({ direction: Hammer.DIRECTION_ALL });

    // pan.requireFailure(pinch);

    // Настройка событий
    this.hammer.on("tap", this.handleTap.bind(this));
    this.hammer.on("panstart", this.handlePanStart.bind(this));
    this.hammer.on("panmove", this.handlePanMove.bind(this));
    this.hammer.on("panend", this.handlePanEnd.bind(this));
    this.hammer.on("pinchstart", this.handlePinchStart.bind(this));
    this.hammer.on("pinchmove", this.handlePinchMove.bind(this));
    this.hammer.on("pinchend", this.handlePinchEnd.bind(this));

    // Обработка hover (mouseenter/mouseleave)
    this.setupHoverHandling();
  }

  private setupHoverHandling(): void {
    let currentTarget: EventedComponent | undefined;
    return;
    this.root.addEventListener("mousemove", (event: MouseEvent) => {
      const point = this.graph.getPointInCameraSpace(event);
      const newTarget = this.graph.getElementOverPoint(point) || this.graph.getGraphLayer().$.camera;

      if (newTarget !== currentTarget) {
        // Убираем hover с предыдущего элемента
        if (currentTarget) {
          this.emitGestureEvent("hover", {
            target: currentTarget,
            sourceEvent: event as any,
            pointerPressed: this.pointerPressed,
          });
        }

        // Устанавливаем hover на новый элемент
        currentTarget = newTarget;
        this.targetComponent = newTarget;

        this.emitGestureEvent("hover", {
          target: newTarget,
          sourceEvent: event as any,
          pointerPressed: this.pointerPressed,
        });
      }
    });

    this.root.addEventListener("mouseleave", () => {
      if (currentTarget) {
        this.emitGestureEvent("hover", {
          target: currentTarget,
          sourceEvent: new MouseEvent("mouseleave") as any,
          pointerPressed: this.pointerPressed,
        });
        currentTarget = undefined;
        this.targetComponent = undefined;
      }
    });
  }

  private handleTap(event: HammerInput): void {
    console.log("handleTap", event.eventType, event.pointers);
    this.emitGestureEvent("tap", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
    });
  }

  private handlePanStart(event: HammerInput): void {
    this.pointerPressed = true;
    this.emitGestureEvent("panstart", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  private handlePanMove(event: HammerInput): void {
    this.emitGestureEvent("panmove", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  private handlePanEnd(event: HammerInput): void {
    this.pointerPressed = false;
    this.emitGestureEvent("panend", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  }

  private handlePinchStart(event: HammerInput): void {
    this.emitGestureEvent("pinchstart", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      scale: event.scale,
      rotation: event.rotation,
    });
  }

  private handlePinchMove(event: HammerInput): void {
    this.emitGestureEvent("pinchmove", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      scale: event.scale,
      rotation: event.rotation,
    });
  }

  private handlePinchEnd(event: HammerInput): void {
    this.emitGestureEvent("pinchend", {
      target: this.targetComponent,
      sourceEvent: event,
      pointerPressed: this.pointerPressed,
      center: { x: event.center.x, y: event.center.y },
      scale: event.scale,
      rotation: event.rotation,
    });
  }

  private emitGestureEvent(type: GestureEventNames, detail: IGestureEvent): void {
    console.log("emitGestureEvent", type);
    this.graph.emit(type, detail);
  }

  public setTargetComponent(component?: EventedComponent): void {
    this.targetComponent = component;
  }

  public destroy(): void {
    if (this.hammer) {
      this.hammer.destroy();
    }
  }
}
