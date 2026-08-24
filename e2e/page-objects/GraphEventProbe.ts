import type { Page } from "@playwright/test";

let listenerIdCounter = 0;

/**
 * Collected graph events stay in the browser so tests can inspect internal,
 * non-serializable event targets without making them part of the public PO.
 */
export class GraphEventListener<TDetail = unknown> {
  constructor(
    private readonly page: Page,
    private readonly storageKey: string
  ) {}

  public async analyze<TResult, TArgs extends unknown[]>(
    fn: (events: CustomEvent<TDetail>[], ...args: TArgs) => TResult,
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
      const handler = (window as any)[`${key}_handler`];
      if (handler) {
        window.graph.off((window as any)[`${key}_eventName`], handler);
      }
      delete (window as any)[key];
      delete (window as any)[`${key}_handler`];
      delete (window as any)[`${key}_eventName`];
    }, this.storageKey);
  }
}

/** Repository-only access to graph event internals used by the E2E suite. */
export class GraphEventProbe {
  constructor(private readonly page: Page) {}

  public async listen<TDetail = unknown>(eventName: string): Promise<GraphEventListener<TDetail>> {
    const key = `__graphListener_${listenerIdCounter++}_${eventName}`;

    await this.page.evaluate(
      ({ key: storageKey, eventName: browserEventName }) => {
        (window as any)[storageKey] = [];
        (window as any)[`${storageKey}_eventName`] = browserEventName;
        const handler = (event: CustomEvent) => {
          (window as any)[storageKey].push(event);
        };
        (window as any)[`${storageKey}_handler`] = handler;
        window.graph.on(browserEventName as any, handler);
      },
      { key, eventName }
    );

    return new GraphEventListener<TDetail>(this.page, key);
  }

  public async collectDetails<TDetail = unknown>(eventName: string): Promise<() => Promise<TDetail[]>> {
    const key = `__graphCollector_${listenerIdCounter++}_${eventName}`;

    await this.page.evaluate(
      ({ key: storageKey, eventName: browserEventName }) => {
        (window as any)[storageKey] = [];
        (window as any)[`${storageKey}_eventName`] = browserEventName;
        const handler = (event: CustomEvent) => {
          (window as any)[storageKey].push(event.detail);
        };
        (window as any)[`${storageKey}_handler`] = handler;
        window.graph.on(browserEventName as any, handler);
      },
      { key, eventName }
    );

    return async () => {
      const json = await this.page.evaluate((storageKey) => {
        return JSON.stringify((window as any)[storageKey] ?? []);
      }, key);
      try {
        return JSON.parse(json) as TDetail[];
      } catch {
        return [];
      }
    };
  }
}
