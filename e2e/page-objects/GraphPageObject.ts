import { Page } from "@playwright/test";
import { TBlock } from "../../src/components/canvas/blocks/Block";
import { TConnection } from "../../src/store/connection/ConnectionState";
import { BlockPageObject } from "./BlockPageObject";
import { CameraPageObject } from "./CameraPageObject";
import { ConnectionPageObject } from "./ConnectionPageObject";

export interface GraphConfig {
  blocks?: TBlock[];
  connections?: TConnection[];
  settings?: any;
}

export class GraphPageObject {
  public readonly camera: CameraPageObject;
  public readonly blocks: BlockPageObject;
  public readonly connections: ConnectionPageObject;
  public readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.camera = new CameraPageObject(page, this);
    this.blocks = new BlockPageObject(page, this);
    this.connections = new ConnectionPageObject(page, this);
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
   * Emit custom event on graph
   */
  async event(
    type: "click" | "mouseover" | "mousedown" | "mouseup",
    xy: { x: number; y: number }
  ): Promise<void> {
    await this.page.mouse.move(xy.x, xy.y);
    if (type === "click") {
      await this.page.mouse.click(xy.x, xy.y);
    } else if (type === "mousedown") {
      await this.page.mouse.down();
    } else if (type === "mouseup") {
      await this.page.mouse.up();
    }
  }

  /**
   * Get blocks store
   */
  get blocksStore() {
    return this.blocks;
  }

  /**
   * Get connections store
   */
  get connectionsStore() {
    return this.connections;
  }
}
