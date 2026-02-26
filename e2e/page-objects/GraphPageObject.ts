import { Page } from "@playwright/test";
import { TBlock } from "../../src/components/canvas/blocks/Block";
import { TConnection } from "../../src/store/connection/ConnectionState";
import { GraphBlockComponentObject } from "./GraphBlockComponentObject";
import { GraphConnectionComponentObject } from "./GraphConnectionComponentObject";
import { GraphCameraComponentObject } from "./GraphCameraComponentObject";

let listenerIdCounter = 0;

/**
 * Collects graph events fired in the browser context and allows analyzing them
 * via a callback that runs in the browser — no DOM serialization needed.
 *
 * Usage:
 *   const listener = await graphPO.listenGraphEvents("mouseenter");
 *   // ... trigger actions ...
 *   const ids = await listener.analyze((events) =>
 *     events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
 *   );
 */
export class GraphEventListener<TDetail = unknown> {
  private readonly storageKey: string;

  constructor(
    private readonly page: Page,
    storageKey: string
  ) {
    this.storageKey = storageKey;
  }

  /**
   * Runs `fn` inside the browser with the collected events array as the first argument.
   * Additional serializable values from Node.js can be passed as extra arguments.
   * Returns whatever `fn` returns (must be serializable).
   */
  async analyze<TResult, TArgs extends unknown[]>(
    fn: (events: CustomEvent<TDetail>[], ...args: TArgs) => TResult,
    ...args: TArgs
  ): Promise<TResult> {
    return this.page.evaluate(
      ({ key, fnStr, args }) => {
        const events = (window as any)[key] ?? [];
        // eslint-disable-next-line no-new-func
        return new Function("events", "...args", `return (${fnStr})(events, ...args)`)(
          events,
          ...args
        );
      },
      { key: this.storageKey, fnStr: fn.toString(), args }
    );
  }

  /** Removes the event listener and cleans up the storage key from window. */
  async stop(): Promise<void> {
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

export interface GraphConfig {
  blocks?: TBlock[];
  connections?: TConnection[];
  settings?: any;
}

export class GraphPageObject {
  public readonly page: Page;
  private cameraComponent: GraphCameraComponentObject;

  constructor(page: Page) {
    this.page = page;
    this.cameraComponent = new GraphCameraComponentObject(page, this);
  }

  /**
   * Get Component Object Model for a specific block
   */
  getBlockCOM(blockId: string): GraphBlockComponentObject {
    return new GraphBlockComponentObject(blockId, this.page, this);
  }

  /**
   * Get Component Object Model for a specific connection
   */
  getConnectionCOM(connectionId: string): GraphConnectionComponentObject {
    return new GraphConnectionComponentObject(connectionId, this.page, this);
  }

  /**
   * Get Component Object Model for camera
   */
  getCamera(): GraphCameraComponentObject {
    return this.cameraComponent;
  }

  /**
   * Initialize graph with config
   */
  async initialize(config: GraphConfig): Promise<void> {
    await this.page.goto("/base.html");

    // Wait for Graph library to load from the HTML page
    await this.page.waitForFunction(() => {
      return (window as any).graphLibraryLoaded === true;
    });

    // Initialize graph using the loaded module
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!rootEl) {
        throw new Error("Root element not found");
      }

      // GraphModule contains all exports from /build/index.js
      const { Graph } = (window as any).GraphModule;
      const graph = new Graph(cfg, rootEl);

      if (cfg.blocks || cfg.connections) {
        graph.setEntities({
          blocks: cfg.blocks,
          connections: cfg.connections,
        });
      }

      // Start graph and zoom to center
      graph.start();
      graph.zoomTo("center");

      // Expose to window for tests
      window.graph = graph;
      window.graphInitialized = true;
    }, config);

    // Wait for graph to be ready
    await this.page.waitForFunction(
      () => window.graphInitialized === true,
      { timeout: 5000 }
    );

    // Wait for initial render frames
    await this.waitForFrames(3);
  }

  /**
   * Wait for N animation frames to complete using graph's scheduler
   * This is necessary because the library uses Scheduler with requestAnimationFrame
   */
  async waitForFrames(count: number = 1): Promise<void> {
    await this.page.evaluate((frameCount) => {
      return new Promise<void>((resolve) => {
        const { schedule, ESchedulerPriority } = window.GraphModule;
        schedule(
          () => resolve(),
          {
            priority: ESchedulerPriority.LOWEST,
            frameInterval: frameCount,
            once: true,
          }
        );
      });
    }, count);
  }

  /**
   * Wait for scheduler to be idle using graph's scheduler
   * Waits until there are no more scheduled tasks
   */
  async waitForSchedulerIdle(timeout: number = 5000): Promise<void> {
    await this.page.evaluate((timeoutMs) => {
      return new Promise<void>((resolve, reject) => {
        const startTime = Date.now();
        const { schedule, ESchedulerPriority } = window.GraphModule;
        
        const check = () => {
          if (Date.now() - startTime > timeoutMs) {
            reject(new Error(`Scheduler did not become idle within ${timeoutMs}ms`));
            return;
          }

          // Use graph's scheduler to wait for a frame
          schedule(
            () => resolve(),
            {
              priority: ESchedulerPriority.LOWEST,
              frameInterval: 2,
              once: true,
            }
          );
        };

        check();
      });
    }, timeout);
  }

  /**
   * Wait for a graph event
   */
  async waitForEvent(eventName: string, timeout = 5000): Promise<any> {
    return await this.page.evaluate(
      ({ eventName, timeout }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(
              new Error(
                `Event ${eventName} did not fire within ${timeout}ms`
              )
            );
          }, timeout);

          const handler = (event: any) => {
            clearTimeout(timer);
            resolve(event.detail);
          };

          window.graph.on(eventName as any, handler);
        });
      },
      { eventName, timeout }
    );
  }

  /**
   * Click at world coordinates
   */
  async click(
    worldX: number,
    worldY: number,
    options?: {
      shift?: boolean;
      ctrl?: boolean;
      meta?: boolean;
      waitFrames?: number;
    }
  ): Promise<void> {
    // Transform world coordinates to screen and perform click
    const { screenX, screenY, canvasBounds } = await this.page.evaluate(
      ({ wx, wy }) => {
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        return {
          screenX: sx,
          screenY: sy,
          canvasBounds: { left: rect.left, top: rect.top },
        };
      },
      { wx: worldX, wy: worldY }
    );

    // Convert to viewport coordinates
    const viewportX = screenX + canvasBounds.left;
    const viewportY = screenY + canvasBounds.top;

    // Determine modifier key based on platform
    let modifierKey: "Shift" | "Control" | "Meta" | null = null;
    if (options?.shift) {
      modifierKey = "Shift";
    } else if (options?.ctrl || options?.meta) {
      const isMac = await this.page.evaluate(() =>
        navigator.platform.toLowerCase().includes("mac")
      );
      modifierKey = isMac ? "Meta" : "Control";
    }

    // Press modifier key before click
    if (modifierKey) {
      await this.page.keyboard.down(modifierKey);
    }

    // Perform the click
    await this.page.mouse.click(viewportX, viewportY);

    // Release modifier key after click
    if (modifierKey) {
      await this.page.keyboard.up(modifierKey);
    }

    // Wait for scheduler to process the click
    const framesToWait = options?.waitFrames ?? 2;
    await this.waitForFrames(framesToWait);
  }

  /**
   * Double click at world coordinates
   */
  async doubleClick(
    worldX: number,
    worldY: number,
    options?: { waitFrames?: number }
  ): Promise<void> {
    const { screenX, screenY, canvasBounds } = await this.page.evaluate(
      ({ wx, wy }) => {
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        return {
          screenX: sx,
          screenY: sy,
          canvasBounds: { left: rect.left, top: rect.top },
        };
      },
      { wx: worldX, wy: worldY }
    );

    const viewportX = screenX + canvasBounds.left;
    const viewportY = screenY + canvasBounds.top;

    await this.page.mouse.dblclick(viewportX, viewportY);

    // Wait for scheduler to process the double click
    const framesToWait = options?.waitFrames ?? 2;
    await this.waitForFrames(framesToWait);
  }

  /**
   * Hover at world coordinates
   */
  async hover(
    worldX: number,
    worldY: number,
    options?: { waitFrames?: number }
  ): Promise<void> {
    const { screenX, screenY, canvasBounds } = await this.page.evaluate(
      ({ wx, wy }) => {
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        return {
          screenX: sx,
          screenY: sy,
          canvasBounds: { left: rect.left, top: rect.top },
        };
      },
      { wx: worldX, wy: worldY }
    );

    const viewportX = screenX + canvasBounds.left;
    const viewportY = screenY + canvasBounds.top;

    await this.page.mouse.move(viewportX, viewportY);

    // Wait for hover to be processed
    const framesToWait = options?.waitFrames ?? 1;
    await this.waitForFrames(framesToWait);
  }

  /**
   * Drag from one world position to another
   */
  async dragTo(
    fromWorldX: number,
    fromWorldY: number,
    toWorldX: number,
    toWorldY: number,
    options?: { waitFrames?: number }
  ): Promise<void> {
    const { fromScreen, toScreen, canvasBounds } = await this.page.evaluate(
      ({ fx, fy, tx, ty }) => {
        const [fromSX, fromSY] = window.graph.cameraService.getAbsoluteXY(
          fx,
          fy
        );
        const [toSX, toSY] = window.graph.cameraService.getAbsoluteXY(tx, ty);

        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();

        return {
          fromScreen: { x: fromSX, y: fromSY },
          toScreen: { x: toSX, y: toSY },
          canvasBounds: { left: rect.left, top: rect.top },
        };
      },
      { fx: fromWorldX, fy: fromWorldY, tx: toWorldX, ty: toWorldY }
    );

    // Convert to viewport coordinates
    const fromViewportX = fromScreen.x + canvasBounds.left;
    const fromViewportY = fromScreen.y + canvasBounds.top;
    const toViewportX = toScreen.x + canvasBounds.left;
    const toViewportY = toScreen.y + canvasBounds.top;

    // Perform drag
    await this.page.mouse.move(fromViewportX, fromViewportY);
    await this.page.mouse.down();
    await this.waitForFrames(5);

    await this.page.mouse.move(toViewportX, toViewportY, { steps: 10 });
    await this.waitForFrames(5);

    await this.page.mouse.up();

    // Wait for drag to be processed and changes to be applied
    const framesToWait = options?.waitFrames ?? 20;
    await this.waitForFrames(framesToWait);
  }

  /**
   * Get all selected block IDs
   */
  async getSelectedBlocks(): Promise<Array<string | number>> {
    return await this.page.evaluate(() => {
      const selection = window.graph.selectionService.$selection.value;
      const blockSelection = selection.get("block");
      return blockSelection ? Array.from(blockSelection) : [];
    });
  }

  /**
   * Get all connections
   */
  async getAllConnections(): Promise<any[]> {
    return await this.page.evaluate(() => {
      return window.graph.connections.toJSON();
    });
  }

  /**
   * Check if connection exists between two blocks
   */
  async hasConnectionBetween(
    sourceBlockId: string,
    targetBlockId: string
  ): Promise<boolean> {
    return await this.page.evaluate(
      ({ sourceBlockId, targetBlockId }) => {
        const connections = window.graph.connections.toJSON();
        return connections.some(
          (conn: any) =>
            conn.sourceBlockId === sourceBlockId &&
            conn.targetBlockId === targetBlockId
        );
      },
      { sourceBlockId, targetBlockId }
    );
  }

  async getCursor(): Promise<string> {
    return await this.page.evaluate(() => {
      const root = window.graph.layers.$root;
      return window.getComputedStyle(root).cursor;
    });
  }

  /**
   * Starts collecting graph events of the given name in the browser context.
   * Returns a {@link GraphEventListener} whose `analyze()` method lets you
   * inspect the collected events inside the browser — no DOM serialization needed.
   *
   * @example
   * const listener = await graphPO.listenGraphEvents("mouseenter");
   * // ... trigger actions ...
   * const ids = await listener.analyze((events) =>
   *   events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
   * );
   * expect(ids).toContain("block-1");
   */
  async listenGraphEvents<TDetail = unknown>(
    eventName: string
  ): Promise<GraphEventListener<TDetail>> {
    const key = `__graphListener_${listenerIdCounter++}_${eventName}`;

    await this.page.evaluate(
      ({ key, eventName }) => {
        (window as any)[key] = [];
        (window as any)[`${key}_eventName`] = eventName;
        const handler = (event: CustomEvent) => {
          (window as any)[key].push(event);
        };
        (window as any)[`${key}_handler`] = handler;
        window.graph.on(eventName as any, handler);
      },
      { key, eventName }
    );

    return new GraphEventListener<TDetail>(this.page, key);
  }
}
