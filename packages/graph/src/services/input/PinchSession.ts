import type { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "../../graph";

import type { PressSession } from "./PressSession";
import { dispatchGesture } from "./press";
import type { GraphPinchEvent } from "./press";

/** One fixed route and two contacts, independent of the geometry underneath the moving fingers. */
export class PinchSession {
  private readonly path: readonly EventedComponent[];
  private readonly level;
  private baseline;
  private closed = false;
  public allowCamera: boolean;

  constructor(
    private readonly graph: Graph,
    private readonly first: PressSession,
    private readonly second: PressSession
  ) {
    const common = first.path.findIndex((node) => node.isInteractive() && second.path.includes(node));
    this.path = common < 0 ? [] : first.path.slice(common);
    this.level = graph.scene.$level.peek();
    this.allowCamera = first.allowDefaults && second.allowDefaults;
    this.baseline = { ...this.geometry(), camera: graph.$camera.peek() };
  }

  private geometry() {
    const a = this.first.latest;
    const b = this.second.latest;
    const rect = this.graph.getGraphCanvas().getBoundingClientRect();
    return {
      center: { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top },
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    };
  }

  public deliver(phase: GraphPinchEvent["phase"], event: PointerEvent): void {
    if (this.closed) return;
    const { center, distance } = this.geometry();
    if (phase === "end" || phase === "cancel") this.closed = true;
    const notification = dispatchGesture(
      this.graph,
      this.path,
      event,
      this.graph.cameraService.createCameraPoint(center, "canvas"),
      this.level,
      {
        type: "pinch",
        phase,
        pointers: [this.first.latest, this.second.latest],
        distance,
      }
    );
    if (phase === "start" && notification.defaultPrevented) this.allowCamera = false;
    if (phase !== "update" || this.closed || !this.allowCamera) return;
    if (notification.defaultPrevented || !this.graph.cameraService.applyPinch(this.baseline, center, distance)) {
      this.baseline = { center, distance, camera: this.graph.$camera.peek() };
    }
  }
}
