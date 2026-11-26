import { signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";
import type { CoreComponent } from "../../lib/CoreComponent";

/**
 * How many graph frames a retarget hold lasts at most (`holdRetarget`): the end of the third frame releases it. An HTML
 * layer asks React for its views in the first graph frame after the level's change (graph-react's `BlocksList`, at the
 * highest priority), and React commits a default update in a task after that frame's callback, normally before the
 * next frame. The second frame is slack for a busy main thread; a commit that misses both (a suspended transition)
 * waits no longer.
 */
const RETARGET_HOLD_FRAMES = 3;

const MOTION_WINDOW_MS = 32;
const FAST_PATH_PX = 32;
const JUMP_PX = 48;
const SETTLE_MS = 60;

/** One `holdRetarget()`: the frame ends it may still wait through, and what to call when its bound releases it. */
type TRetargetHold = { framesLeft: number; readonly onExpire?: () => void };

/** The nearest graph component above `component` (a block above its anchor or child), if any. */
function graphComponentAbove(component: EventedComponent): GraphComponent | undefined {
  for (let node: CoreComponent | undefined = component.getParent(); node; node = node.getParent()) {
    if (node instanceof GraphComponent) return node;
  }
  return undefined;
}

/** Tracks the scene target across movement, capture, geometry and camera changes. */
export class SceneHover {
  private readonly hoveredComponent = signal<GraphComponent | undefined>(undefined);

  /**
   * The graph component under the pointer (or captured), `undefined` over the camera or empty space.
   * Written only by pointer handling; no tag follows it (components write their own `hoveredTag`).
   */
  public readonly $hoveredComponent: ReadonlySignal<GraphComponent | undefined> = this.hoveredComponent;

  public get target(): EventedComponent | undefined {
    return this.targetComponent;
  }

  private targetComponent?: EventedComponent;

  private capturedTargetComponent?: EventedComponent;
  private lastPointer?: PointerEvent;
  private pendingMove = false;
  private readonly motion: { event: PointerEvent; distance: number }[] = [];
  private firstMotion = 0;
  private settleAt?: number;
  private cameraMovedSinceFrame = false;
  private retargetRequested = false;

  /** The holds `holdRetarget()` handed out and not released: while there is one, a requested retarget waits. */
  private readonly retargetHolds = new Set<TRetargetHold>();

  /**
   * The nearest graph component above a target that unmounted (`forgetComponent`): the old side of the next target
   * change, so its hover ends when the pointer is not on it any more.
   */
  private lostTargetOwner?: GraphComponent;

  constructor(
    private readonly graph: Graph,
    private readonly dispatchChange: (
      previous: EventedComponent | undefined,
      next: EventedComponent | undefined,
      event?: PointerEvent
    ) => void
  ) {}

  public attach(signal: AbortSignal): void {
    const { scene, hitTest } = this.graph;
    const stopLevel = scene.$level.subscribe(() => this.requestRetarget());
    let waitingForIndex = false;
    const stopFrame = scene.onFrameEnd(() => {
      this.ageRetargetHolds();
      waitingForIndex = false;
      if (this.cameraMovedSinceFrame) {
        this.cameraMovedSinceFrame = false;
        return;
      }
      if (!this.retargetRequested && !this.pendingMove) return;
      if (hitTest.hasPendingUpdates()) waitingForIndex = true;
      else this.retargetAtPointer();
    });
    const onHitTestUpdate = () => {
      if (waitingForIndex && !this.cameraMovedSinceFrame) {
        waitingForIndex = false;
        this.retargetAtPointer();
      }
    };
    hitTest.on("update", onHitTestUpdate);
    signal.addEventListener(
      "abort",
      () => {
        stopLevel();
        stopFrame();
        hitTest.off("update", onHitTestUpdate);
        this.capturedTargetComponent = undefined;
        this.leave();
        this.retargetRequested = false;
        this.retargetHolds.clear();
        this.cameraMovedSinceFrame = false;
      },
      { once: true }
    );
  }

  /*
   * Capture element for future events
   * When element is captured, it will be used as target for future events
   * until releaseCapture is called
   * A graph component transparent to pointer events (`GraphComponent.transparentToEvents`) is not captured: the
   * pointer keeps its normal target.
   * @param component - element to capture
   */
  public captureEvents(component: EventedComponent) {
    if (component instanceof GraphComponent && component.isTransparentToEvents()) return;
    this.capturedTargetComponent = component;
    if (this.lastPointer) this.changeTargetTo(component, this.lastPointer);
  }

  public releaseCapture(): void {
    this.capturedTargetComponent = undefined;
    this.publishHovered();
    // What a still pointer hits may have changed during the gesture (a hold, the level, a move): find it again.
    if (this.lastPointer) this.requestRetarget();
    else this.changeTargetTo(undefined);
  }

  /** @internal Drops an unmounted component from the pointer state, so no later event targets or re-publishes it. */
  public forgetComponent(component: EventedComponent): void {
    const wasTarget = this.targetComponent === component;
    // The nearest graph component above an unmounted target takes its place as the old side of the next change. A
    // parent's unmount() runs after its children's (`CoreComponent.__unmount`), so a parent forgotten next passes the
    // place on up.
    if (wasTarget || this.lostTargetOwner === component) this.lostTargetOwner = graphComponentAbove(component);
    if (wasTarget) this.targetComponent = undefined;
    if (this.capturedTargetComponent === component) this.capturedTargetComponent = undefined;
    if (this.hoveredComponent.peek() === component) this.hoveredComponent.value = undefined;
    if (wasTarget) this.requestRetarget();
  }

  /**
   * @internal What a still pointer may hit changed: a component hidden or unmounted, a hit box that
   * was set before changed (`GraphComponent.setHitBox`, `removeHitBox`), a child's hit levels, an HTML hold, the
   * level. The target is found again at the last pointer position at the end of the frame, or at the release of a
   * capture.
   */
  public requestRetarget(): void {
    this.retargetRequested = this.lastPointer !== undefined;
  }

  /**
   * @internal Makes a requested retarget wait, until the returned release runs (once; later calls do nothing) or at
   * most `RETARGET_HOLD_FRAMES` graph frames: the end of the last of them releases the hold and calls `onExpire`. An
   * HTML layer holds it while the views of the detailed level mount (graph-react's `BlocksList`): until their holds
   * (`Block.delegateRender`) exist, a still pointer would lose what they show and take it back once they mount. The
   * request is kept meanwhile: the first frame's end after the last release finds the target again (a capture's
   * release waits as well). A commit that comes after the bound (a suspended transition) can still move the target
   * once more when its views mount: one late leave and enter.
   */
  public holdRetarget(onExpire?: () => void): () => void {
    const hold: TRetargetHold = { framesLeft: RETARGET_HOLD_FRAMES, onExpire };
    this.retargetHolds.add(hold);
    return (): void => {
      this.retargetHolds.delete(hold);
    };
  }

  /** At a frame's end: each hold has one frame less; those at their bound are released. */
  private ageRetargetHolds(): void {
    for (const hold of this.retargetHolds) {
      hold.framesLeft -= 1;
      if (hold.framesLeft > 0) continue;
      this.retargetHolds.delete(hold);
      hold.onExpire?.();
    }
  }

  private publishHovered(): void {
    const target = this.capturedTargetComponent ?? this.targetComponent;
    this.hoveredComponent.value = target instanceof GraphComponent ? target : undefined;
  }

  private changeTargetTo(next: EventedComponent | undefined, event?: PointerEvent): void {
    const lost = this.lostTargetOwner;
    if (next === this.targetComponent && lost === undefined) return;
    const previous = this.targetComponent ?? (lost === next ? undefined : lost);
    this.lostTargetOwner = undefined;
    this.targetComponent = next;
    this.publishHovered();
    this.dispatchChange(previous, next, event);
  }

  private retargetAtPointer(): void {
    if (!this.retargetRequested && !this.pendingMove) return;
    if (!this.lastPointer || this.capturedTargetComponent || this.retargetHolds.size > 0) return;
    if (this.settleAt !== undefined && performance.now() < this.settleAt) return;
    this.settleAt = undefined;
    this.retargetRequested = false;
    const event = this.pendingMove ? this.lastPointer : undefined;
    this.pendingMove = false;
    const point = this.graph.getPointInCameraSpace(this.lastPointer);
    this.changeTargetTo(this.graph.getElementOverPoint(point) ?? this.graph.getGraphLayer().$.camera, event);
  }

  private resetMotion(event?: PointerEvent): void {
    this.motion.length = 0;
    this.firstMotion = 0;
    if (event) this.motion.push({ event, distance: 0 });
  }

  /** Cumulative path counts both legs of a reversal. The window advances once over each physical sample. */
  private movingFast(event: PointerEvent): boolean {
    const samples = this.motion;
    const last = samples.at(-1);
    const step = last ? Math.hypot(event.clientX - last.event.clientX, event.clientY - last.event.clientY) : 0;
    if (step === 0 && last?.event.timeStamp === event.timeStamp) return false;
    const distance = (last?.distance ?? 0) + step;
    samples.push({ event, distance });

    const cutoff = event.timeStamp - MOTION_WINDOW_MS;
    while (samples[this.firstMotion + 1]?.event.timeStamp <= cutoff) this.firstMotion++;
    // Compact only when the expired prefix is at least half the array.
    if (this.firstMotion * 2 >= samples.length) {
      samples.splice(0, this.firstMotion);
      this.firstMotion = 0;
    }
    const first = samples[this.firstMotion];
    const second = samples[this.firstMotion + 1];
    let startDistance = first.distance;
    if (first.event.timeStamp < cutoff && second) {
      const fraction = (cutoff - first.event.timeStamp) / (second.event.timeStamp - first.event.timeStamp);
      startDistance += fraction * (second.distance - first.distance);
    }
    return step > JUMP_PX || distance - startDistance > FAST_PATH_PX;
  }

  /** The pointer left the graph's root: a captured gesture retains its target until release. */
  public leave(event?: PointerEvent): void {
    this.lastPointer = undefined;
    this.pendingMove = false;
    this.settleAt = undefined;
    this.resetMotion();
    this.retargetRequested = false;
    if (!this.capturedTargetComponent) this.changeTargetTo(undefined, event);
  }

  public cameraMoved(): void {
    if (!this.lastPointer || this.capturedTargetComponent) return;
    if (this.graph.rootStore.settings.getConfigFlag("retargetHoverOnCameraChange")) {
      this.cameraMovedSinceFrame = true;
      this.requestRetarget();
    }
  }

  /** Most recent physical mouse or pen position over this graph. A camera frame never writes it. */
  public get pointerPosition(): Pick<PointerEvent, "clientX" | "clientY"> | undefined {
    return this.lastPointer;
  }

  public move(event: PointerEvent): void {
    const previous = this.lastPointer;
    this.lastPointer = event;
    if (this.capturedTargetComponent) {
      this.changeTargetTo(this.capturedTargetComponent, event);
      return;
    }
    const fast = event.getCoalescedEvents?.().some((sample) => this.movingFast(sample)) || this.movingFast(event);
    if (!fast && previous?.clientX === event.clientX && previous.clientY === event.clientY) return;
    this.pendingMove = true;
    if (fast || this.settleAt !== undefined || this.graph.scene.$level.peek() === "minimalistic") {
      this.resetMotion(event);
      this.settleAt = performance.now() + SETTLE_MS;
      this.changeTargetTo(undefined, event);
    }
  }

  /** Capture can deliver an up outside the root, or at a new position without an intervening move. */
  public releaseAt(event: PointerEvent): void {
    if (!this.capturedTargetComponent) return;
    const root = this.graph.layers.$root;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (
      event.clientX >= rect.left &&
      event.clientX < rect.right &&
      event.clientY >= rect.top &&
      event.clientY < rect.bottom
    )
      this.lastPointer = event;
    else this.leave(event);
  }

  public press(event: PointerEvent, hit?: GraphComponent): void {
    this.lastPointer = event;
    this.resetMotion(event);
    this.pendingMove = false;
    this.retargetRequested = false;
    this.settleAt = undefined;
    this.changeTargetTo(this.capturedTargetComponent ?? hit ?? this.graph.getGraphLayer().$.camera, event);
  }
}
