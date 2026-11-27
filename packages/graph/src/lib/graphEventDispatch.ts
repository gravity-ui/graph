import type { GraphEventContext, GraphEventOptions, GraphEventTarget } from "../graphEvents";
import type { TSceneLevel } from "../services/scene/types";
import { reportListenerError } from "../utils/eventListener";

export type EventObserver<E> = ((event: E) => void) | { handleEvent(event: E): void };
type NamedEvent = { readonly type: string };
type Entry = {
  listener: EventObserver<NamedEvent>;
  capture: boolean;
  once: boolean;
  signal?: AbortSignal;
  inScale?: readonly TSceneLevel[];
  detachedExplicitly?: boolean;
  ownership?: AbortController;
  detach(): void;
  remove(): void;
};

const listeners = new WeakMap<GraphEventTarget, Map<string, Set<Entry>>>();
type Delivery = { target: GraphEventTarget | null; entry?: Entry };
const deliveries = new WeakMap<object, Delivery>();

export function createGraphEvent<K extends string, T extends GraphEventTarget, P extends object>(
  type: K,
  target: T,
  payload: P,
  cancelable = true
): P & GraphEventContext<K, T> {
  const delivery: Delivery = { target: null };
  let prevented = false;
  let stopped = false;
  const event = {
    ...payload,
    type,
    target,
    cancelable,
    get currentTarget() {
      return delivery.target;
    },
    get defaultPrevented() {
      return prevented;
    },
    get propagationStopped() {
      return stopped;
    },
    preventDefault: () => {
      if (delivery.target && cancelable) prevented = true;
    },
    stopPropagation: () => {
      if (delivery.target) stopped = true;
    },
  };
  deliveries.set(event, delivery);
  return event;
}

/** Component hooks use the same synchronous decision window as registered listeners. */
export function withGraphEventTarget(event: NamedEvent, target: GraphEventTarget, cb: () => void): void {
  const delivery = deliveries.get(event);
  if (!delivery) throw new TypeError("Expected a graph event");
  const previous = delivery.target;
  delivery.target = target;
  try {
    return cb();
  } finally {
    delivery.target = previous;
  }
}

/** A drag is cancelled by an explicit unsubscribe or by the listener's external signal. */
export function graphEventListenerSignals(event: NamedEvent): readonly AbortSignal[] {
  const entry = deliveries.get(event)?.entry;
  if (!entry) return [];
  entry.ownership ??= new AbortController();
  if (entry.detachedExplicitly) entry.ownership.abort();
  return entry.signal ? [entry.ownership.signal, entry.signal] : [entry.ownership.signal];
}

export function listenGraphEvent<E extends NamedEvent>(
  target: GraphEventTarget,
  type: string,
  observer: EventObserver<E>,
  options: GraphEventOptions | boolean = {}
): () => void {
  const {
    capture = false,
    once = false,
    signal,
    inScale,
  } = typeof options === "boolean" ? { capture: options } : options;
  if (signal?.aborted) return () => {};
  const byName = listeners.get(target) ?? new Map<string, Set<Entry>>();
  const entries = byName.get(type) ?? new Set<Entry>();
  const listener = observer as EventObserver<NamedEvent>;
  for (const entry of entries) {
    if (entry.listener === listener && entry.capture === capture) return entry.remove;
  }
  const entry: Entry = { listener, capture, once, signal, inScale, detach, remove };
  function remove() {
    entry.detachedExplicitly = true;
    detach();
    entry.ownership?.abort();
  }
  function detach() {
    if (!entries.delete(entry)) return;
    if (!entries.size) byName.delete(type);
    signal?.removeEventListener("abort", remove);
  }
  entries.add(entry);
  byName.set(type, entries);
  listeners.set(target, byName);
  signal?.addEventListener("abort", remove, { once: true });
  return remove;
}

export function removeGraphEvent<E extends NamedEvent>(
  target: GraphEventTarget,
  type: string,
  listener: EventObserver<E>,
  options?: EventListenerOptions | boolean
): void {
  const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
  listeners
    .get(target)
    ?.get(type)
    ?.forEach((entry) => {
      if (entry.listener === listener && entry.capture === capture) entry.remove();
    });
}

export function hasGraphListener(target: GraphEventTarget, type: string): boolean {
  return listeners.get(target)?.has(type) ?? false;
}

export function clearGraphListeners(target: GraphEventTarget): void {
  listeners.get(target)?.forEach((entries) => entries.forEach((entry) => entry.remove()));
  listeners.delete(target);
}

export function deliverGraphEvent(
  target: GraphEventTarget,
  event: NamedEvent,
  capture: boolean,
  level?: TSceneLevel,
  options?: { rethrow: boolean }
): void {
  const entries = listeners.get(target)?.get(event.type);
  if (!entries?.size) return;
  const delivery = deliveries.get(event);
  if (!delivery) throw new TypeError("Expected a graph event");
  withGraphEventTarget(event, target, () => {
    for (const entry of [...entries]) {
      if (
        !entries.has(entry) ||
        entry.capture !== capture ||
        (entry.inScale && (!level || !entry.inScale.includes(level)))
      )
        continue;
      if (entry.once) entry.detach();
      const previous = delivery.entry;
      delivery.entry = entry;
      try {
        if (typeof entry.listener === "function") entry.listener.call(target, event);
        else entry.listener.handleEvent(event);
      } catch (error) {
        if (options?.rethrow) throw error;
        reportListenerError(error);
      } finally {
        delivery.entry = previous;
      }
    }
  });
}
