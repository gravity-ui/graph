import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { CursorLayerCursorTypes } from "../../components/canvas/layers/cursorLayer/CursorLayer";
import { Graph } from "../../graph";
import { Emitter } from "../../utils/Emitter";
import { EVENTS } from "../../utils/types/events";
import { runEach } from "../drag/runEach";

import { holdsMouseButton, watchPointers } from "./pointerStream";

export type DragEvents = {
  [EVENTS.DRAG_START]: (event: PointerEvent) => void;
  [EVENTS.DRAG_UPDATE]: (event: PointerEvent, cause: "pointer" | "scene") => void;
  [EVENTS.DRAG_END]: (event: PointerEvent) => void;
  [EVENTS.DRAG_CANCEL]: (event: PointerEvent, fallbackToEnd: boolean) => void;
  cancel: (fallbackToEnd?: boolean) => void;
};
export type DragEmitter = Emitter<DragEvents>;

/** The dispatched move owns pointer capture and browser defaults. Its first threshold crossing can be coalesced. */
export type DragStartMove = { event: PointerEvent; crossing: PointerEvent };

export type DragSessionOptions = {
  stopOnPointerLeave?: boolean;
  graph?: Graph;
  cursor?: CursorLayerCursorTypes;
  component?: EventedComponent;
  autopanning?: boolean;
  /** Programmatic drags may wait for their own first movement. Recognized graph drags start explicitly. */
  startOnMove?: (event: PointerEvent) => boolean;
  initialEvent?: PointerEvent;
  /** @internal Signals owned by the layer or the claim. */
  signals?: readonly (AbortSignal | undefined)[];
  /**
   * Blocks browser text selection for the drag session (selectstart + temporary user-select).
   * @default true
   */
  suppressTextSelection?: boolean;
  /** Runs after listeners and drag resources are released, including for a press below the threshold. */
  onSessionEnd?: (cancelled: boolean) => void;
};

function getDragListenerDocument(node: Document | HTMLDivElement | HTMLCanvasElement): Document {
  return "defaultView" in node ? node : node.ownerDocument;
}

const textSelectionLocks = new WeakMap<HTMLElement, { count: number; previous: string }>();

/** Prevents browser text selection for the duration of a drag gesture. */
function installTextSelectionSuppression(doc: Document, graph?: Graph): () => void {
  const root = graph?.getGraphCanvas() ?? doc.documentElement;
  doc.defaultView?.getSelection()?.removeAllRanges();

  const onSelectStart = (event: Event): void => {
    event.preventDefault();
  };
  doc.addEventListener("selectstart", onSelectStart, { capture: true });

  let lock = textSelectionLocks.get(root);
  if (!lock) {
    lock = { count: 0, previous: root.style.userSelect };
    textSelectionLocks.set(root, lock);
    root.style.userSelect = "none";
  }
  lock.count++;

  return (): void => {
    doc.removeEventListener("selectstart", onSelectStart, { capture: true });
    if (--lock.count === 0) {
      root.style.userSelect = lock.previous;
      textSelectionLocks.delete(root);
    }
  };
}

function capturePointer(
  element: EventTarget | null | undefined,
  event: PointerEvent,
  doc: Document
): Element | undefined {
  if (!(element instanceof Element) || !event.isTrusted || !event.buttons) return undefined;
  if (!element.isConnected || element.ownerDocument !== doc) return undefined;
  element.setPointerCapture(event.pointerId);
  return element;
}

export function createDragSession(surface: Document | HTMLDivElement | HTMLCanvasElement, options: DragSessionOptions) {
  const {
    graph,
    component,
    cursor,
    initialEvent,
    autopanning = Boolean(graph),
    suppressTextSelection = true,
  } = options;
  const doc = getDragListenerDocument(surface);
  const camera = autopanning ? graph?.getGraphLayer().$.camera : undefined;
  const controller = new AbortController();
  const emitter = new Emitter<DragEvents>();
  const release: ((cancelled: boolean) => void)[] = [];
  if (options.onSessionEnd) release.push(options.onSessionEnd);
  release.push(
    () => emitter.destroy(),
    () => controller.abort()
  );

  let finished = false;
  let pointerId = initialEvent?.pointerId;
  let captured: Element | undefined;
  let lastEvent: PointerEvent | undefined;

  function finish(event?: PointerEvent, fallbackToEnd = true): void {
    if (finished) return;
    finished = true;
    try {
      if (lastEvent && event) emitter.emit(EVENTS.DRAG_END, event);
      else if (lastEvent) emitter.emit(EVENTS.DRAG_CANCEL, lastEvent, fallbackToEnd);
    } finally {
      runEach(release.reverse(), (dispose) => dispose(!event));
    }
  }

  const cancel = () => finish(undefined, false);
  function update(event: PointerEvent): void {
    if (finished) return;
    lastEvent = event;
    camera?.setAutoPanPointer(event);
    emitter.emit(EVENTS.DRAG_UPDATE, event, "pointer");
  }

  // Enabling a resource can synchronously abort the session through a graph subscriber.
  function defer(dispose: () => void): void {
    if (finished) dispose();
    else release.push(dispose);
  }

  function acquire(enable: () => void, disable: () => void): void {
    if (finished) return;
    try {
      enable();
    } finally {
      defer(disable);
    }
  }

  function acquireResources(event: PointerEvent): void {
    const id = event.pointerId;
    const element = capturePointer(initialEvent?.target, event, doc);
    if (element) {
      captured = element;
      defer(() => {
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      });
    }
    if (suppressTextSelection && !finished) {
      defer(installTextSelectionSuppression(doc, graph));
      event.preventDefault();
    }
    if (!graph) return;
    if (cursor) {
      acquire(
        () => graph.lockCursor(cursor),
        () => graph.unlockCursor()
      );
    }
    if (component) {
      acquire(
        () => graph.input.hover.captureEvents(component),
        () => graph.input.hover.releaseCapture()
      );
    }
    if (autopanning && !finished) {
      defer(
        graph.input.onCameraMove(() => {
          if (!finished && lastEvent) emitter.emit(EVENTS.DRAG_UPDATE, lastEvent, "scene");
        })
      );
      acquire(
        () => graph.cameraService.enableAutoPanning(),
        () => graph.cameraService.disableAutoPanning()
      );
    }
  }

  function start({ event, crossing }: DragStartMove): void {
    if (finished || lastEvent) return;
    try {
      acquireResources(event);
      if (!finished) {
        lastEvent = crossing;
        emitter.emit(EVENTS.DRAG_START, crossing);
        update(crossing);
        if (crossing.clientX !== event.clientX || crossing.clientY !== event.clientY) update(event);
      }
    } catch (error) {
      cancel();
      throw error;
    }
  }

  function onMove(event: PointerEvent): void {
    // A chord can release the initiating button via pointermove while another button stays held.
    if (initialEvent && !holdsMouseButton(event, initialEvent.button)) {
      if (event.button === initialEvent.button) finish(event);
      else cancel();
      return;
    }
    pointerId ??= event.pointerId;
    if (lastEvent) update(event);
    else if (options.startOnMove?.(event)) start({ event, crossing: event });
  }

  watchPointers(
    surface,
    (sample, event) => {
      if (finished || (event && pointerId !== undefined && event.pointerId !== pointerId)) return;
      switch (sample) {
        case "move":
          if (event) onMove(event);
          break;
        case "up":
          finish(event);
          break;
        case "lostcapture":
          if (captured && event?.target === captured) cancel();
          break;
        case "leave":
          if (options.stopOnPointerLeave && (event?.target === surface || event?.target === doc.documentElement))
            finish(event);
          break;
        default:
          cancel();
      }
    },
    controller.signal
  );
  for (const signal of options.signals ?? []) {
    signal?.addEventListener("abort", cancel, { signal: controller.signal });
  }
  emitter.on("cancel", (fallbackToEnd = false) => finish(undefined, fallbackToEnd));
  return Object.assign(emitter, { start });
}

export function stopDragListening(emitter: DragEmitter, fallbackToEnd = true) {
  emitter.emit("cancel", fallbackToEnd);
}
