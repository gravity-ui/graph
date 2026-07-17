import type { ElementHandle, JSHandle, Locator, Page } from "@playwright/test";

import type { Graph } from "../graph";
import type { TBlockId } from "../store/block/Block";
import type { TConnection, TConnectionId } from "../store/connection/ConnectionState";
import { GRAPH_INSTANCE_SYMBOL_KEY, LEGACY_GRAPH_INSTANCE_SYMBOL_KEY } from "../utils/graphInstance";

import { GraphBlockPO } from "./GraphBlockPO";
import { GraphCameraPO } from "./GraphCameraPO";
import { GraphConnectionPO } from "./GraphConnectionPO";
import type { GraphClickOptions, GraphDragOptions, GraphHoverOptions, GraphPoint, GraphRect } from "./types";

const GRAPH_SYMBOL_KEYS = {
  current: GRAPH_INSTANCE_SYMBOL_KEY,
  legacy: LEGACY_GRAPH_INSTANCE_SYMBOL_KEY,
};

type BrowserGraphRecord = Record<symbol, unknown>;

/**
 * Playwright page object for a graph rendered by `@gravity-ui/graph`.
 *
 * The locator may point either to the element passed to `graph.attach()` or to
 * one of its ancestors. It must contain exactly one graph.
 */
export class GraphPO {
  public readonly page: Page;

  public readonly root: Locator;

  private readonly cameraPO: GraphCameraPO;

  constructor(root: Locator) {
    this.root = root;
    this.page = root.page();
    this.cameraPO = new GraphCameraPO(this);
  }

  public block(blockId: TBlockId): GraphBlockPO {
    return new GraphBlockPO(this, blockId);
  }

  public connection(connectionId: TConnectionId): GraphConnectionPO {
    return new GraphConnectionPO(this, connectionId);
  }

  public camera(): GraphCameraPO {
    return this.cameraPO;
  }

  /**
   * Waits until the application attaches and starts the graph.
   */
  public async waitForReady(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 5000;

    await this.root.evaluate(
      async (scope, { keys, timeoutMs }) => {
        const deadline = performance.now() + timeoutMs;
        const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const findGraphs = () => {
          const elements = [scope, ...Array.from(scope.querySelectorAll("*"))];
          const currentGraphs: Array<{ state?: number }> = [];
          const legacyGraphs: Array<{ state?: number }> = [];

          for (const element of elements) {
            const record = element as unknown as BrowserGraphRecord;
            const currentGraph = record[Symbol.for(keys.current)];
            const legacyGraph = record[Symbol.for(keys.legacy)];

            if (currentGraph && !currentGraphs.includes(currentGraph as { state?: number })) {
              currentGraphs.push(currentGraph as { state?: number });
            }
            if (legacyGraph && !legacyGraphs.includes(legacyGraph as { state?: number })) {
              legacyGraphs.push(legacyGraph as { state?: number });
            }
          }

          return currentGraphs.length > 0 ? currentGraphs : legacyGraphs;
        };

        while (performance.now() <= deadline) {
          const graphs = findGraphs();
          if (graphs.length > 1) {
            throw new Error("GraphPO locator contains multiple graphs. Pass a more specific locator.");
          }
          // GraphState.READY is currently the third enum member (2).
          if (graphs[0]?.state === 2) {
            await nextFrame();
            return;
          }
          await nextFrame();
        }

        throw new Error(`Graph did not become ready within ${timeoutMs}ms.`);
      },
      { keys: GRAPH_SYMBOL_KEYS, timeoutMs: timeout },
      { timeout }
    );
  }

  /**
   * Runs a serializable callback in the browser against the graph instance.
   * As with Playwright's evaluate APIs, the callback cannot capture variables
   * from the Node.js test context; pass them through `arg` instead.
   */
  public async evaluate<TResult, TArg = undefined>(
    pageFunction: (graph: Graph, arg: TArg) => TResult | Promise<TResult>,
    arg?: TArg
  ): Promise<TResult> {
    const graphHandle = await this.getGraphHandle();
    try {
      // Playwright internally unboxes serializable arguments. Keep the public
      // callback type simple and let JSHandle validate the actual value.
      return await graphHandle.evaluate<TResult, TArg>(pageFunction as never, arg as TArg);
    } finally {
      await graphHandle.dispose();
    }
  }

  public async waitForFrames(count = 1): Promise<void> {
    if (count <= 0) {
      return;
    }

    await this.root.evaluate(
      (_scope, frameCount) =>
        new Promise<void>((resolve) => {
          let remaining = frameCount;
          const onFrame = () => {
            remaining -= 1;
            if (remaining <= 0) {
              resolve();
            } else {
              requestAnimationFrame(onFrame);
            }
          };
          requestAnimationFrame(onFrame);
        }),
      count
    );
  }

  public async getBounds(): Promise<GraphRect> {
    return this.evaluate((graph) => {
      const rect = graph.layers.$root.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    });
  }

  public async clickAt(point: GraphPoint, options: GraphClickOptions = {}): Promise<void> {
    const position = await this.toRootPoint(point);
    const root = await this.getGraphRootHandle();
    const { waitForFrames = 2, ...clickOptions } = options;

    try {
      await root.click({ position, ...clickOptions });
    } finally {
      await root.dispose();
    }

    await this.waitForFrames(waitForFrames);
  }

  public async doubleClickAt(point: GraphPoint, options: GraphClickOptions = {}): Promise<void> {
    const position = await this.toRootPoint(point);
    const root = await this.getGraphRootHandle();
    const { waitForFrames = 2, ...clickOptions } = options;

    try {
      await root.dblclick({ position, ...clickOptions });
    } finally {
      await root.dispose();
    }

    await this.waitForFrames(waitForFrames);
  }

  public async hoverAt(point: GraphPoint, options: GraphHoverOptions = {}): Promise<void> {
    const position = await this.toRootPoint(point);
    const root = await this.getGraphRootHandle();
    const { waitForFrames = 1, ...hoverOptions } = options;

    try {
      await root.hover({ position, ...hoverOptions });
    } finally {
      await root.dispose();
    }

    await this.waitForFrames(waitForFrames);
  }

  public async drag(from: GraphPoint, to: GraphPoint, options: GraphDragOptions = {}): Promise<void> {
    const [fromPosition, toPosition] = await Promise.all([this.toRootPoint(from), this.toRootPoint(to)]);
    const root = await this.getGraphRootHandle();
    const { button = "left", steps = 10, waitForFrames = 2 } = options;
    let pointerDown = false;

    try {
      await root.hover({ position: fromPosition });
      const bounds = await root.boundingBox();
      if (!bounds) {
        throw new Error("Graph root is not visible.");
      }

      await this.page.mouse.down({ button });
      pointerDown = true;
      await this.waitForFrames(1);
      await this.page.mouse.move(bounds.x + toPosition.x, bounds.y + toPosition.y, {
        steps,
      });
      await this.waitForFrames(1);
      await this.page.mouse.up({ button });
      pointerDown = false;
    } finally {
      if (pointerDown) {
        await this.page.mouse.up({ button });
      }
      await root.dispose();
    }

    await this.waitForFrames(waitForFrames);
  }

  public async getSelectedBlockIds(): Promise<TBlockId[]> {
    return this.evaluate((graph) => Array.from(graph.blocks.blockSelectionBucket.$selected.value));
  }

  public async getConnections(): Promise<TConnection[]> {
    return this.evaluate((graph) => graph.connections.toJSON());
  }

  public async hasConnectionBetween(sourceBlockId: TBlockId, targetBlockId: TBlockId): Promise<boolean> {
    return this.evaluate(
      (graph, ids) =>
        graph.connections
          .toJSON()
          .some(
            (connection) =>
              connection.sourceBlockId === ids.sourceBlockId && connection.targetBlockId === ids.targetBlockId
          ),
      { sourceBlockId, targetBlockId }
    );
  }

  public async getCursor(): Promise<string> {
    return this.evaluate((graph) => window.getComputedStyle(graph.layers.$root).cursor);
  }

  private async toRootPoint(point: GraphPoint): Promise<GraphPoint> {
    return this.evaluate((graph, worldPoint) => {
      const [x, y] = graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y);
      return { x, y };
    }, point);
  }

  private async getGraphHandle(): Promise<JSHandle<Graph>> {
    const handle = await this.root.evaluateHandle((scope, keys) => {
      const elements = [scope, ...Array.from(scope.querySelectorAll("*"))];
      const currentGraphs: unknown[] = [];
      const legacyGraphs: unknown[] = [];

      for (const element of elements) {
        const record = element as unknown as BrowserGraphRecord;
        const currentGraph = record[Symbol.for(keys.current)];
        const legacyGraph = record[Symbol.for(keys.legacy)];
        if (currentGraph && !currentGraphs.includes(currentGraph)) {
          currentGraphs.push(currentGraph);
        }
        if (legacyGraph && !legacyGraphs.includes(legacyGraph)) {
          legacyGraphs.push(legacyGraph);
        }
      }
      const graphs = currentGraphs.length > 0 ? currentGraphs : legacyGraphs;

      if (graphs.length === 0) {
        throw new Error(
          "GraphPO could not find a graph under the supplied locator. " +
            "Make sure the graph is attached and call waitForReady() first."
        );
      }
      if (graphs.length > 1) {
        throw new Error("GraphPO locator contains multiple graphs. Pass a more specific locator.");
      }

      return graphs[0];
    }, GRAPH_SYMBOL_KEYS);

    return handle as JSHandle<Graph>;
  }

  private async getGraphRootHandle(): Promise<ElementHandle<HTMLElement>> {
    const graphHandle = await this.getGraphHandle();
    try {
      const rootHandle = await graphHandle.evaluateHandle((graph) => graph.layers.$root);
      const element = rootHandle.asElement();
      if (!element) {
        await rootHandle.dispose();
        throw new Error("Graph is not attached to a DOM element.");
      }
      return element as ElementHandle<HTMLElement>;
    } finally {
      await graphHandle.dispose();
    }
  }
}
