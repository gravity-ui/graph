import { batch, computed, effect } from "@preact/signals-core";

import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import type { TGraphHoverDetail } from "../../components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "../../graph";
import type { GraphHoverEvents } from "../../graphEvents";
import type { CoreComponent } from "../../lib/CoreComponent";
import { ECanDrag } from "../../store/settings";
import type { TGraphSettingsConfig } from "../../store/settings";
import { GRAPH_ROOT_CLASS_NAME } from "../../utils/graphInstance";
import type { CameraPoint } from "../camera/CameraPoint";

import { PinchSession } from "./PinchSession";
import { PressSession } from "./PressSession";
import { SceneHover } from "./SceneHover";
import { holdsMouseButton, watchPointers } from "./pointerStream";
import { dispatchGesture } from "./press";

function belongsToGraph(target: EventTarget | null, root: HTMLElement): target is Element {
  return target instanceof Element && target.closest(`.${GRAPH_ROOT_CLASS_NAME}`) === root;
}

function releasedInGraph(event: PointerEvent, root: HTMLElement): boolean {
  const path = event.composedPath();
  const tree = root.getRootNode();
  if (tree instanceof ShadowRoot && !path.includes(tree)) {
    // A closed shadow ancestor hides the true release target from document capture.
    for (let shadow: Node = tree; shadow instanceof ShadowRoot; shadow = shadow.host.getRootNode()) {
      if (path.includes(shadow.host)) return belongsToGraph(tree.elementFromPoint(event.clientX, event.clientY), root);
    }
    return false;
  }
  return path.find((node) => node instanceof Element && node.classList.contains(GRAPH_ROOT_CLASS_NAME)) === root;
}

function hasHover(event: PointerEvent): boolean {
  return event.pointerType === "mouse" || event.pointerType === "pen";
}

export class PointerInput {
  private controller?: AbortController;
  private readonly activePresses = new Map<number, PressSession>();
  private readonly ignoredContacts = new Set<number>();
  private pinch?: PinchSession;
  private unhandledDown = false;
  private lastClick?: {
    target?: EventedComponent;
    hasLiveTarget: () => boolean;
    type: string;
    x: number;
    y: number;
    time: number;
    policy: TGraphSettingsConfig["clickPolicy"];
  };
  private pendingClick?: { target?: EventedComponent; timer: ReturnType<typeof setTimeout>; deliver: () => void };

  public readonly hover: SceneHover;
  public readonly $hoveredComponent: SceneHover["$hoveredComponent"];

  constructor(private readonly graph: Graph) {
    this.hover = new SceneHover(graph, (previous, next, event) => {
      const camera = graph.getGraphLayer().$.camera;
      batch(() => {
        this.dispatchHover("pointerleave", previous, next === camera ? undefined : next, event);
        this.dispatchHover("pointerout", previous, next === camera ? undefined : next, event);
        this.dispatchHover("pointerenter", next, previous === camera ? undefined : previous, event);
        this.dispatchHover("pointerover", next, previous === camera ? undefined : previous, event);
      });
    });
    this.$hoveredComponent = this.hover.$hoveredComponent;
  }

  /** @internal Only a change of the world-to-canvas transform moves the scene under the pointer. */
  public onCameraMove(handler: () => void): () => void {
    let previous = this.graph.$camera.peek();
    return this.graph.$camera.subscribe((next) => {
      const moved = next.x !== previous.x || next.y !== previous.y || next.scale !== previous.scale;
      previous = next;
      if (moved) handler();
    });
  }

  public forgetComponent(component: EventedComponent): void {
    if (this.lastClick?.target === component) this.lastClick = undefined;
    if (this.pendingClick?.target === component) this.takePendingClick();
    for (const session of this.activePresses.values()) {
      if (session.hit === component) this.cancel(session);
    }
    this.hover.forgetComponent(component);
  }

  public attach(root: HTMLElement): void {
    this.detach();
    this.controller = new AbortController();
    const { signal } = this.controller;
    this.hover.attach(signal);
    const policy = computed(() => this.graph.rootStore.settings.$settings.value.touchPolicy);
    const stopPolicy = effect(() => {
      if (policy.value === "editor") {
        const previous = root.style.touchAction;
        root.style.touchAction = "none";
        return () => {
          root.style.touchAction = previous;
        };
      }
      return undefined;
    });
    signal.addEventListener("abort", stopPolicy, { once: true });
    signal.addEventListener(
      "abort",
      this.onCameraMove(() => this.hover.cameraMoved()),
      { once: true }
    );
    const acceptsHover = (event: PointerEvent) =>
      hasHover(event) &&
      !this.ignoredContacts.has(event.pointerId) &&
      (!this.activePresses.size || this.activePresses.has(event.pointerId));
    const hover = (event: PointerEvent) => {
      if (acceptsHover(event) && belongsToGraph(event.target, root)) this.hover.move(event);
    };
    root.addEventListener("pointerenter", hover, { signal });
    root.addEventListener("pointermove", hover, { signal });
    root.addEventListener(
      "pointerleave",
      (event) => {
        if (acceptsHover(event)) this.hover.leave(event);
      },
      { signal }
    );
    root.addEventListener("pointerdown", this.press, { signal });

    watchPointers(
      root.ownerDocument,
      (sample, event) => {
        if (!event) {
          if (sample === "cancel") this.cancelAll();
          return;
        }
        if (sample === "down") {
          // A control or another surface may keep this second down from reaching our root.
          for (const press of this.activePresses.values()) {
            press.clearHold();
            press.clickEligible = false;
          }
          if (this.activePresses.size || this.unhandledDown) this.lastClick = undefined;
          this.unhandledDown = true;
        }
        if (sample === "up" || sample === "cancel" || sample === "down") this.ignoredContacts.delete(event.pointerId);
        const session = this.activePresses.get(event.pointerId);
        if (!session) return;
        if (sample === "move") this.move(session, event);
        else if (sample === "up") this.release(session, event);
        else if (sample === "cancel" || sample === "lostcapture" || sample === "down") this.cancel(session, event);
      },
      signal
    );
  }

  private press = (event: PointerEvent): void => {
    const root = this.graph.layers.$root;
    if (!root || event.defaultPrevented || !belongsToGraph(event.target, root)) return;
    if (event.button !== 0 && event.button !== 1) return;
    const control = event.target.closest("button,input,select,textarea,a[href]");
    if ((control && root.contains(control)) || event.target.matches(":read-write")) return;
    const first = this.activePresses.values().next().value;
    if (first && !this.canPair(first, event)) {
      this.ignoredContacts.add(event.pointerId);
      return;
    }
    this.unhandledDown = false;
    const session = this.beginPress(event, first?.touchPolicy);
    if (!this.current(session)) return;
    if (first) {
      if (this.current(first)) this.startPinch(first, session);
    } else {
      this.waitForHold(session);
    }
  };

  private beginPress(event: PointerEvent, touchPolicy?: PressSession["touchPolicy"]): PressSession {
    const point = this.graph.getPointInCameraSpace(event);
    const hit = this.graph.getElementOverPoint(point);
    const path: EventedComponent[] = [];
    const camera = this.graph.getGraphLayer().$.camera;
    for (let node: CoreComponent | undefined = hit; node && node !== camera; node = node.getParent()) {
      if (node instanceof EventedComponent) path.push(node);
    }
    const settings = this.graph.rootStore.settings.$settings.peek();
    const session = new PressSession(
      event,
      point,
      hit,
      path,
      this.graph.scene.$level.peek(),
      settings.dragThreshold,
      settings.clickTolerance,
      touchPolicy ?? settings.touchPolicy,
      hit && this.graph.rootStore.settings.getCanDrag(event.pointerType) === ECanDrag.ONLY_SELECTED
        ? this.graph.selectionService.$selectedComponents.peek()
        : undefined
    );
    this.activePresses.set(event.pointerId, session);
    if (hasHover(event)) this.hover.press(event, hit);
    else this.hover.leave();
    if (!this.current(session)) return session;
    const press = dispatchGesture(this.graph, path, event, point, session.level, "press");
    session.allowDefaults &&= !press.defaultPrevented && !event.defaultPrevented;
    if (session.allowDefaults && settings.canDragCamera && event.button === 1) event.preventDefault();
    return session;
  }

  private waitForHold(session: PressSession): void {
    const { down, start, path, level } = session;
    if (
      (down.pointerType !== "touch" && down.pointerType !== "pen") ||
      session.phase !== "pressed" ||
      !session.clickEligible
    )
      return;
    session.waitForHold(this.graph.rootStore.settings.getConfigFlag("longPressDuration"), () => {
      if (!this.live(session)) return;
      this.lastClick = undefined;
      dispatchGesture(this.graph, path, down, start, level, "longpress");
    });
  }

  private canPair(first: PressSession, event: PointerEvent): boolean {
    return (
      this.activePresses.size === 1 &&
      first.touchPolicy === "editor" &&
      first.down.pointerType === "touch" &&
      event.pointerType === "touch" &&
      first.phase !== "held" &&
      !first.owner &&
      first.defaultDrag !== "component"
    );
  }

  private startPinch(first: PressSession, second: PressSession): void {
    if (first.defaultDrag === "camera") {
      first.defaultDrag = undefined;
      first.lifetime.abort();
      // Keep the first finger's implicit capture when the one-finger pan gives it up.
      const target = first.down.target;
      if (first.down.isTrusted && target instanceof Element && target.isConnected)
        target.setPointerCapture(first.down.pointerId);
    }
    first.phase = second.phase = "navigation";
    first.clickEligible = second.clickEligible = false;
    this.pinch = new PinchSession(this.graph, first, second);
    this.pinch.deliver("start", second.down);
  }

  private navigate(session: PressSession, event: PointerEvent): void {
    const previous = session.latest;
    session.latest = event;
    if (event.clientX === previous.clientX && event.clientY === previous.clientY) return;
    if (this.pinch) this.pinch.deliver("update", event);
    else if (session.allowDefaults && this.graph.rootStore.settings.getConfigFlag("canDragCamera")) {
      this.graph.cameraService.move(event.clientX - previous.clientX, event.clientY - previous.clientY);
    }
  }

  private move(session: PressSession, event: PointerEvent): void {
    if (!holdsMouseButton(event, session.down.button)) {
      if (event.button === session.down.button) this.release(session, event);
      else this.cancel(session);
      return;
    }
    if (session.phase === "navigation") {
      this.navigate(session, event);
      return;
    }
    session.latest = event;
    const crossing = session.advance(event);
    if (!crossing || !this.live(session)) return;
    this.lastClick = undefined;
    if (!session.allowDefaults || (event.pointerType === "touch" && session.touchPolicy === "page")) return;
    const point = this.graph.getPointInCameraSpace(crossing);
    const result = dispatchGesture(this.graph, session.path, crossing, point, session.level, {
      start: session.start,
      pressEvent: session.down,
      claim: session.claim,
    });
    if (!this.live(session) || session.phase !== "dragging" || !session.allowDefaults || !session.chooseOwner()) return;
    const { down, owner, start } = session;
    const move = { event, crossing };
    if (owner) {
      this.graph.dragService.startClaimedDrag(
        owner.operation,
        down,
        move,
        start,
        session.lifetime.signal,
        ...owner.signals
      );
    } else if (!result.defaultPrevented && !(down.button === 0 && down.altKey && down.shiftKey)) {
      session.defaultDrag = this.graph.dragService.startDefaultDrag(
        session.hit,
        down,
        move,
        start,
        session.lifetime.signal,
        session.selectedAtPress
      );
    }
  }

  private release(session: PressSession, event: PointerEvent): void {
    const root = this.graph.layers.$root;
    if (!root) return;
    const controller = this.controller;
    session.clearHold();
    if (session.phase === "navigation") {
      this.navigate(session, event);
      if (!this.current(session)) return;
      const pinch = this.pinch;
      this.pinch = undefined;
      if (pinch) {
        for (const press of this.activePresses.values()) press.allowDefaults &&= pinch.allowCamera;
        pinch.deliver("end", event);
        if (!this.current(session)) return;
      }
    }
    if (hasHover(event)) this.hover.releaseAt(event);
    const point = this.graph.getPointInCameraSpace(event);
    const eligible = session.acceptsClick(event) && releasedInGraph(event, root);
    session.phase = "released";
    this.activePresses.delete(event.pointerId);
    const release = session.hasLiveTarget()
      ? dispatchGesture(this.graph, session.path, event, point, session.level, "release")
      : undefined;
    if (!release || !session.hasLiveTarget()) {
      // A release listener may remove the source before the drag executor receives this sample.
      session.lifetime.abort();
      this.lastClick = undefined;
      return;
    }
    if (
      controller !== this.controller ||
      release.defaultPrevented ||
      !eligible ||
      this.graph.getElementOverPoint(point) !== session.hit
    ) {
      this.lastClick = undefined;
      return;
    }
    this.activate(session, event, point);
  }

  private activate(session: PressSession, event: PointerEvent, point: CameraPoint): void {
    const { path, hit, level } = session;
    const previous = this.lastClick;
    const time = event.timeStamp;
    const { clickPolicy, doubleClickInterval, doubleClickDistance } = this.graph.rootStore.settings.$settings.peek();
    const twice =
      previous &&
      previous.policy === clickPolicy &&
      previous.target === hit &&
      previous.hasLiveTarget() &&
      previous.type === event.pointerType &&
      time - previous.time <= doubleClickInterval &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= doubleClickDistance;
    this.lastClick = twice
      ? undefined
      : {
          target: hit,
          hasLiveTarget: session.hasLiveTarget,
          type: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          time,
          policy: clickPolicy,
        };
    const lifetime = this.controller;
    const isLive = () => this.controller === lifetime && session.hasLiveTarget();
    const single = () => {
      if (isLive()) this.deliverClick(session, event, point, isLive);
    };
    const previousSingle = this.takePendingClick();
    if (!twice && clickPolicy === "exclusive") {
      const timer = setTimeout(() => {
        this.lastClick = undefined;
        this.pendingClick = undefined;
        single();
      }, doubleClickInterval);
      this.pendingClick = { target: hit, timer, deliver: single };
    }
    // An incompatible release confirms the earlier single before the new target takes its turn.
    if (!twice) previousSingle?.();
    if (clickPolicy === "immediate") single();
    if (twice && isLive()) dispatchGesture(this.graph, path, event, point, level, "dblclick");
  }

  private takePendingClick(): (() => void) | undefined {
    const pending = this.pendingClick;
    if (pending) {
      this.pendingClick = undefined;
      clearTimeout(pending.timer);
    }
    return pending?.deliver;
  }

  private deliverClick(session: PressSession, event: PointerEvent, point: CameraPoint, isLive: () => boolean): void {
    const { path, hit, level } = session;
    dispatchGesture(this.graph, path, event, point, level, "click", (click, delivered) => {
      if (!isLive()) return;
      for (let i = 0; i < delivered; i++) {
        if (path[i].isInteractive() && path[i].applyClickDefault(click)) return;
      }
      if (!hit) this.graph.getGraphLayer().$.camera?.handleBackgroundClick();
    });
  }

  private dispatchHover(
    type: keyof GraphHoverEvents,
    target?: EventedComponent,
    relatedTarget?: EventedComponent,
    sourceEvent?: PointerEvent
  ): void {
    if (!target) return;
    const detail: TGraphHoverDetail = {
      target,
      relatedTarget,
      sourceEvent,
      cause: sourceEvent ? "pointer" : "scene",
      pointerPressed: this.activePresses.size > 0,
    };
    const notification = this.graph.emit(type, detail);
    if (!notification.defaultPrevented && !notification.propagationStopped) target.dispatchEvent(notification);
  }

  /** A caller may cancel during press or dragstart before the selected operation exists. */
  public suppressPendingDrags(): void {
    for (const session of this.activePresses.values()) session.allowDefaults = false;
  }

  private current(session: PressSession): boolean {
    return this.activePresses.get(session.down.pointerId) === session;
  }

  private live(session: PressSession): boolean {
    if (!this.current(session)) return false;
    if (session.hasLiveTarget()) return true;
    this.cancel(session);
    return false;
  }

  private cancel(session: PressSession, event = session.latest): void {
    const pinch = this.pinch;
    if (pinch) {
      this.pinch = undefined;
      session.latest = event;
      for (const contact of this.activePresses.values()) this.cancel(contact);
      pinch.deliver("cancel", event);
      return;
    }
    session.clearHold();
    this.activePresses.delete(session.down.pointerId);
    session.phase = "cancelled";
    session.lifetime.abort();
    this.lastClick = undefined;
  }

  private cancelAll(): void {
    this.takePendingClick();
    for (const session of this.activePresses.values()) this.cancel(session);
    this.lastClick = undefined;
    this.ignoredContacts.clear();
    this.unhandledDown = false;
  }

  public detach(): void {
    this.cancelAll();
    this.controller?.abort();
    this.controller = undefined;
  }
}
