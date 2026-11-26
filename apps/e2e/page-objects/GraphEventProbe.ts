import type { GraphEventMap, GraphEventName, GraphPressEvent } from "@gravity-ui/graph";
import type { Page } from "@playwright/test";

let listenerIdCounter = 0;

/**
 * Collected graph events stay in the browser so tests can inspect internal,
 * non-serializable event targets without making them part of the public PO.
 */
export class GraphEventListener<TEvent> {
  constructor(
    private readonly page: Page,
    private readonly storageKey: string
  ) {}

  public async analyze<TResult, TArgs extends unknown[]>(
    fn: (events: TEvent[], ...args: TArgs) => TResult,
    ...args: TArgs
  ): Promise<TResult> {
    return this.page.evaluate(
      ({ key, fnStr, args: browserArgs }) => {
        const events = (window as any)[key] ?? [];
        // eslint-disable-next-line no-new-func
        return new Function("events", "...args", `return (${fnStr})(events, ...args)`)(events, ...browserArgs);
      },
      { key: this.storageKey, fnStr: fn.toString(), args }
    );
  }

  public async stop(): Promise<void> {
    await this.page.evaluate((key) => {
      (window as any)[`${key}_stop`]?.();
      delete (window as any)[key];
      delete (window as any)[`${key}_stop`];
    }, this.storageKey);
  }
}

/** Repository-only access to graph event internals used by the E2E suite. */
export class GraphEventProbe {
  constructor(private readonly page: Page) {}

  /** Snapshot the active recipient during dispatch. currentTarget is cleared when delivery finishes. */
  public async traceChildPress(point: { x: number; y: number }): Promise<() => Promise<string[]>> {
    const trace = await this.page.evaluateHandle((world) => {
      const graph = window.graph;
      const child = graph.getElementOverPoint(world);
      const block = child?.getParent();
      if (!child || !(block instanceof window.GraphModule.CanvasBlock))
        throw new Error("Expected a hit on the block's child");
      const entries: string[] = [];
      const record = (name: string, recipient: GraphPressEvent["target"]) => (press: GraphPressEvent) => {
        if (press.target !== child || press.currentTarget !== recipient) throw new Error("Unexpected press target");
        entries.push(`${name}:${press.event.pointerType}`);
      };
      graph.on("press", record("capture", graph), { once: true, capture: true });
      child.on("press", record("child", child), { once: true });
      block.on("press", record("block", block), { once: true });
      graph.on("press", record("graph", graph), { once: true });
      return entries;
    }, point);
    return async () => {
      try {
        return await trace.jsonValue();
      } finally {
        await trace.dispose();
      }
    };
  }

  public async listen<K extends GraphEventName>(eventName: K): Promise<GraphEventListener<GraphEventMap[K]>> {
    const key = `__graphListener_${listenerIdCounter++}_${eventName}`;
    await this.page.evaluate(
      ({ key: storageKey, eventName: browserEventName }) => {
        const events: GraphEventMap[GraphEventName][] = [];
        (window as any)[storageKey] = events;
        (window as any)[`${storageKey}_stop`] = window.graph.on(browserEventName, (event) => events.push(event), {
          capture: true,
        });
      },
      { key, eventName }
    );
    return new GraphEventListener(this.page, key);
  }

  /** Project browser events to values Playwright can return to the test. */
  public async collect<K extends GraphEventName, TResult>(
    eventName: K,
    read: (events: GraphEventMap[K][]) => TResult
  ): Promise<() => Promise<TResult>> {
    const listener = await this.listen(eventName);
    return () => listener.analyze(read);
  }
}
