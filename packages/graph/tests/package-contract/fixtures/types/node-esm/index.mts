import { ESchedulerPriority, Graph, debounce, schedule, throttle } from "@gravity-ui/graph";
import { GraphCanvas, useElk } from "@gravity-ui/graph/react";

const removeScheduledTask = schedule(() => undefined, {
  priority: ESchedulerPriority.LOWEST,
  frameInterval: 1,
  once: true,
});
const debounced = debounce((value: string) => void value, { priority: ESchedulerPriority.LOW });
const throttled = throttle((value: string) => void value, { priority: ESchedulerPriority.HIGH });

debounced("debounced");
debounced.isScheduled();
throttled("throttled");

void Graph;
void GraphCanvas;
void useElk;
void removeScheduledTask;
