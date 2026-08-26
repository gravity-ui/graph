import { useLayoutEffect, useMemo, useRef } from "react";

import { Graph } from "../../graph";
import { GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "../../graphEvents";
import { ESchedulerPriority } from "../../lib";
import { debounce } from "../../utils/utils/schedule";
import { GraphCallbacksMap, TGraphEventCallbacks } from "../events";
import { useFn } from "../utils/hooks/useFn";

type TDebouncedFn = (() => void) & {
  cancel?: () => void;
};

type TEventNameForCallback<K extends keyof TGraphEventCallbacks> = (typeof GraphCallbacksMap)[K];
type TEventForCallback<K extends keyof TGraphEventCallbacks> = UnwrapGraphEvents<TEventNameForCallback<K>>;
type TEventDetailForCallback<K extends keyof TGraphEventCallbacks> = UnwrapGraphEventsDetail<TEventNameForCallback<K>>;

export function useGraphEvent<Event extends keyof GraphEventsDefinitions>(
  graph: Graph | null,
  event: Event,
  cb: (data: UnwrapGraphEventsDetail<Event>, event: UnwrapGraphEvents<Event>) => void,
  debounceParams?: {
    priority?: ESchedulerPriority;
    frameInterval?: number;
    frameTimeout?: number;
  }
): void {
  const lastEventRef = useRef<UnwrapGraphEvents<Event> | null>(null);
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
  const onEvent = useFn((e: UnwrapGraphEvents<Event>) => {
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

    const unsubscribe = [];
    const subscribe = <K extends keyof TGraphEventCallbacks>(
      key: K,
      cb: (data: TEventDetailForCallback<K>, event: TEventForCallback<K>) => void
    ): (() => void) => {
      const eventName = GraphCallbacksMap[key];
      return graph.on(eventName, (event: TEventForCallback<K>) => {
        cb(event.detail, event);
      });
    };
    const eventKeys = Object.keys(events) as Array<keyof TGraphEventCallbacks>;
    eventKeys.forEach(<K extends keyof TGraphEventCallbacks>(key: K) => {
      const cb = events[key];
      if (!cb) {
        return;
      }
      unsubscribe.push(subscribe(key, cb));
    });
    return () => {
      unsubscribe.forEach((unsubscribe) => unsubscribe());
    };
  }, [graph, events]);
}
