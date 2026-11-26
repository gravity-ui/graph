import type { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { CameraPoint } from "../camera/CameraPoint";
import type { TSceneLevel } from "../scene/types";

import type { GraphDragOperation } from "./press";

type Offer = { operation: GraphDragOperation; signals: readonly AbortSignal[] };

/** One physical press, including the target and scene level at which the gesture began. */
export class PressSession {
  public phase: "pressed" | "held" | "navigation" | "dragging" | "released" | "cancelled" = "pressed";
  public readonly lifetime = new AbortController();
  public allowDefaults = true;
  public clickEligible = true;
  public owner?: Offer;
  public defaultDrag?: "camera" | "component";
  public latest: PointerEvent;
  private holdTimer?: ReturnType<typeof setTimeout>;
  private readonly offers: Offer[] = [];

  constructor(
    public readonly down: PointerEvent,
    public readonly start: CameraPoint,
    public readonly hit: GraphComponent | undefined,
    public readonly path: readonly EventedComponent[],
    public readonly level: TSceneLevel,
    private readonly threshold: number,
    private readonly clickTolerance: number,
    public readonly touchPolicy: "page" | "editor"
  ) {
    this.latest = down;
  }

  public waitForHold(duration: number, notify: () => void): void {
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
      this.phase = "held";
      this.clickEligible = false;
      notify();
    }, duration);
  }

  public clearHold(): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  public distance(event: PointerEvent): number {
    return Math.hypot(event.clientX - this.down.clientX, event.clientY - this.down.clientY);
  }

  /** The first physical sample that crosses the threshold, including an excursion inside a merged move. */
  public advance(event: PointerEvent): PointerEvent | undefined {
    if (this.phase !== "pressed") return undefined;
    const crossing =
      event.getCoalescedEvents?.().find((sample) => this.crossesThreshold(sample)) ??
      (this.crossesThreshold(event) ? event : undefined);
    if (crossing) {
      this.clearHold();
      this.phase = "dragging";
      this.clickEligible = false;
    }
    return crossing;
  }

  private crossesThreshold(sample: PointerEvent): boolean {
    const distance = this.distance(sample);
    if (this.clickEligible && distance > this.clickTolerance) {
      this.clickEligible = false;
      this.clearHold();
    }
    return distance > 0 && distance >= this.threshold;
  }

  public acceptsClick(up: PointerEvent): boolean {
    return (
      this.phase === "pressed" &&
      this.clickEligible &&
      this.down.button === 0 &&
      this.distance(up) <= this.clickTolerance
    );
  }

  public readonly claim = (operation: GraphDragOperation, subscriberSignals: readonly AbortSignal[]): (() => void) => {
    const cancellation = new AbortController();
    this.offers.push({ operation, signals: [cancellation.signal, ...subscriberSignals] });
    return () => cancellation.abort();
  };

  /** A conflict suppresses the drag, including its default action. */
  public chooseOwner(): boolean {
    const active = this.offers.filter(({ signals }) => !signals.some((signal) => signal.aborted));
    if (active.length > 1) {
      console.warn(
        "Conflicting graph drag claims:",
        active
          .map(({ operation }) => operation.owner)
          .sort()
          .join(", ")
      );
      return false;
    }
    this.owner = active[0];
    return true;
  }
}
