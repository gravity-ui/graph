import { useLayoutEffect } from "react";

import { Graph } from "../../graph";
import { GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "../../graphEvents";
import { useFn } from "../../utils/hooks/useFn";
import { GraphCallbacksMap, TGraphEventCallbacks } from "../events";

export function useGraphEvent<Event extends keyof GraphEventsDefinitions>(
  graph: Graph | null,
  event: Event,
  cb: (data: UnwrapGraphEventsDetail<Event>, event: UnwrapGraphEvents<Event>) => void
) {
  const onEvent = useFn((e: UnwrapGraphEvents<Event>) => {
    cb(e.detail, e);
  });
  useLayoutEffect(() => {
    if (!graph) return;
    return graph.on(event, onEvent);
  }, [graph, event, onEvent]);
}

export function useGraphEvents(graph: Graph | null, events: Partial<TGraphEventCallbacks>) {
  useLayoutEffect(() => {
    if (!graph) return;

    const unsubscribe = [];
    const fn = (cb: TGraphEventCallbacks[keyof TGraphEventCallbacks]) => (event: CustomEvent) => {
      cb(event.detail, event);
    };
    Array.from(Object.entries(events)).reduce((acc, [key, cb]) => {
      if (GraphCallbacksMap[key as keyof TGraphEventCallbacks]) {
        unsubscribe.push(
          graph.on(
            GraphCallbacksMap[key as keyof TGraphEventCallbacks],
            fn(cb as TGraphEventCallbacks[keyof TGraphEventCallbacks])
          )
        );
      }
      return acc;
    }, {} as Partial<TGraphEventCallbacks>);
    return () => {
      unsubscribe.forEach((unsubscribe) => unsubscribe());
    };
  }, [graph, events]);
}
