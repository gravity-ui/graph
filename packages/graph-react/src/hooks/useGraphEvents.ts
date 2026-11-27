import { useLayoutEffect, useRef } from "react";

import type { Graph, GraphEventListener, GraphEventName, GraphEventOptions } from "@gravity-ui/graph";
import isEqual from "lodash/isEqual";

import { GraphCallbacksMap, TGraphEventCallbacks } from "../events";

/** Runs during core dispatch so propagation, default actions and drag claims are still live. */
export function useGraphEvent<K extends GraphEventName>(
  graph: Graph | null,
  name: K,
  callback: GraphEventListener<NoInfer<K>>,
  options?: GraphEventOptions
): void {
  const latest = useRef(callback);
  const levels = useRef(options?.inScale);
  const { capture = false, once = false, signal } = options ?? {};
  const inScale = isEqual(levels.current, options?.inScale) ? levels.current : options?.inScale;

  useLayoutEffect(() => {
    latest.current = callback;
    levels.current = inScale;
  }, [callback, inScale]);
  useLayoutEffect(
    () => graph?.on(name, (event) => latest.current(event), { capture, once, signal, inScale }),
    [graph, name, capture, once, signal, inScale]
  );
}

type CallbackName = keyof TGraphEventCallbacks;
const callbackNames = Object.keys(GraphCallbacksMap) as CallbackName[];

export function useGraphEvents(graph: Graph | null, callbacks: Partial<TGraphEventCallbacks>): void {
  const latest = useRef(callbacks);
  const subscriptions = useRef(new Map<CallbackName, () => void>());

  useLayoutEffect(() => {
    const current = subscriptions.current;
    return () => {
      current.forEach((off) => off());
      current.clear();
    };
  }, [graph]);

  useLayoutEffect(() => {
    latest.current = callbacks;
    if (!graph) return;
    const subscribe = <K extends CallbackName>(key: K) =>
      graph.on(GraphCallbacksMap[key], (event) => latest.current[key]?.(event));

    for (const key of callbackNames) {
      const off = subscriptions.current.get(key);
      if (callbacks[key] && !off) subscriptions.current.set(key, subscribe(key));
      if (!callbacks[key] && off) {
        off();
        subscriptions.current.delete(key);
      }
    }
  });
}
