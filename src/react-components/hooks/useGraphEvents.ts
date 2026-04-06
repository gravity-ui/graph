import { useLayoutEffect, useMemo, useRef } from "react";

import { Graph } from "../../graph";
import type { GraphEventListener, GraphEventsDefinitions } from "../../graphEvents";
import { UnwrapGraphEvents, UnwrapGraphEventsDetail } from "../../graphEvents";
import { ESchedulerPriority } from "../../lib";
import { debounce } from "../../utils/utils/schedule";
import { GraphCallbacksMap, TGraphEventCallbacks } from "../events";
import { useFn } from "../utils/hooks/useFn";

type TDebouncedFn = (() => void) & {
  cancel?: () => void;
};

function bindReactGraphCallback<K extends keyof TGraphEventCallbacks>(
  graph: Graph,
  key: K,
  cb: TGraphEventCallbacks[K]
): () => void {
  type EvName = (typeof GraphCallbacksMap)[K];
  const eventName = GraphCallbacksMap[key];
  const listener: GraphEventListener<EvName> = (event) => {
    cb(event.detail, event);
  };
  return graph.on(eventName, listener);
}

export function useGraphEvent<EvName extends keyof GraphEventsDefinitions>(
  graph: Graph | null,
  event: EvName,
  cb: (data: UnwrapGraphEventsDetail<EvName>, graphEvent: UnwrapGraphEvents<EvName>) => void,
  debounceParams?: {
    priority?: ESchedulerPriority;
    frameInterval?: number;
    frameTimeout?: number;
  }
): void {
  const lastEventRef = useRef<UnwrapGraphEvents<EvName> | null>(null);
  const fn = useMemo<TDebouncedFn>(() => {
    const invoke = () => {
      const lastEvent = lastEventRef.current;
      if (!lastEvent) {
        return;
      }
      cb(lastEvent.detail, lastEvent);
    };
    if (!debounceParams) {
      return invoke;
    }
    return debounce(invoke, {
      priority: ESchedulerPriority.MEDIUM,
      frameInterval: 1,
      frameTimeout: 0,
      ...debounceParams,
    });
  }, [cb, debounceParams]);
  const onEvent = useFn<[UnwrapGraphEvents<EvName>], void>((e) => {
    lastEventRef.current = e;
    fn();
  });
  useLayoutEffect(() => {
    if (!graph) return undefined;
    return graph.on(event, onEvent);
  }, [graph, event, onEvent]);

  useLayoutEffect(() => {
    return () => {
      fn.cancel?.();
    };
  }, [fn]);
}

export function useGraphEvents(graph: Graph | null, events: Partial<TGraphEventCallbacks>): void {
  useLayoutEffect(() => {
    if (!graph) return undefined;

    const unsubscribeFns: Array<() => void> = [];
    const eventKeys = Object.keys(events) as Array<keyof TGraphEventCallbacks>;
    for (const key of eventKeys) {
      const cb = events[key];
      if (cb) {
        unsubscribeFns.push(bindReactGraphCallback(graph, key, cb));
      }
    }
    return () => {
      unsubscribeFns.forEach((unsub) => unsub());
    };
  }, [graph, events]);
}
