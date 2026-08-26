import { Page } from "@playwright/test";

import type { TBlock } from "../../src/components/canvas/blocks/Block";
import { GraphPO } from "../../src/playwright";
import type { TConnection } from "../../src/store/connection/ConnectionState";

import { GraphCameraComponentObject } from "./GraphCameraComponentObject";
import { GraphEventProbe } from "./GraphEventProbe";

export interface GraphConfig {
  blocks?: TBlock[];
  connections?: TConnection[];
  settings?: any;
}

/**
 * Repository fixture built on top of the public Playwright page object.
 *
 * Consumer-facing graph interactions belong to `src/playwright`. This class
 * only creates the repository's test graph and exposes library-internal probes.
 */
export class GraphPageObject extends GraphPO {
  private readonly cameraComponent: GraphCameraComponentObject;

  public readonly events: GraphEventProbe;

  constructor(page: Page) {
    super(page.locator("#root"));
    this.cameraComponent = new GraphCameraComponentObject(this);
    this.events = new GraphEventProbe(page);
  }

  public override camera(): GraphCameraComponentObject {
    return this.cameraComponent;
  }

  /**
   * Returns the URL of the HTML page to navigate to for initialization.
   * Override in subclasses to use a different page (e.g. /react.html).
   */
  protected getUrl(): string {
    return "/base.html";
  }

  /**
   * Creates and configures the graph instance in the browser context.
   * Override in subclasses to use a different rendering setup (e.g. React).
   */
  protected async setupGraph(config: GraphConfig): Promise<void> {
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

      graph.start();
      graph.zoomTo("center");

      // The fixture page uses these globals for setup and internal probes.
      window.graph = graph;
      window.graphInitialized = true;
    }, config);
  }

  public async initialize(config: GraphConfig): Promise<void> {
    await this.page.goto(this.getUrl());

    await this.page.waitForFunction(() => {
      return (window as any).graphLibraryLoaded === true;
    });

    await this.setupGraph(config);

    await this.page.waitForFunction(() => window.graphInitialized === true, { timeout: 5000 });
    await this.waitForFrames(3);
  }

  /**
   * Uses the graph scheduler rather than raw animation frames because the
   * repository's rendering work is scheduled by frame interval.
   */
  public override async waitForFrames(count = 1): Promise<void> {
    if (count <= 0) {
      return;
    }

    await this.page.evaluate((frameCount) => {
      return new Promise<void>((resolve) => {
        const { schedule, ESchedulerPriority } = window.GraphModule;
        schedule(() => resolve(), {
          priority: ESchedulerPriority.LOWEST,
          frameInterval: frameCount,
          once: true,
        });
      });
    }, count);
  }

  public async setEntities(config: GraphConfig): Promise<void> {
    await this.evaluate((graph, cfg) => {
      graph.setEntities({
        blocks: cfg.blocks || [],
        connections: cfg.connections || [],
      });
    }, config);
  }
}
