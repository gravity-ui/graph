import type { Graph, TBlockId, TConnection, TConnectionId } from "@gravity-ui/graph";
import type { ElementHandle, JSHandle, Locator, Page } from "@playwright/test";

import { GraphBlockPO } from "./GraphBlockPO";
import { GraphCameraPO } from "./GraphCameraPO";
import { GraphConnectionPO } from "./GraphConnectionPO";
import type {
  GraphClickOptions,
  GraphConnectionBlockEndpoints,
  GraphConnectionEndpoints,
  GraphDragOptions,
  GraphHoverOptions,
  GraphPoint,
  GraphPortId,
  GraphRect,
} from "./types";

/**
 * Mirrors `GRAPH_INSTANCE_SYMBOL_KEY` from `@gravity-ui/graph`. The value is kept here because this
 * module runs in Node and must not load the core runtime. apps/e2e and core's package contract
 * (packages/graph/contract/contract.config.mjs) assert the value.
 */
const GRAPH_INSTANCE_SYMBOL_KEY = "@gravity-ui/graph/instance";

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
      async (scope, { key, timeoutMs }) => {
        const deadline = performance.now() + timeoutMs;
        const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const findGraphs = (): Array<{ state?: number }> => {
          const elements = [scope, ...Array.from(scope.querySelectorAll("*"))];
          const graphs: Array<{ state?: number }> = [];

          for (const element of elements) {
            const graph = (element as unknown as BrowserGraphRecord)[Symbol.for(key)];

            if (graph && !graphs.includes(graph as { state?: number })) {
              graphs.push(graph as { state?: number });
            }
          }

          return graphs;
        };

        while (performance.now() <= deadline) {
          const graphs = findGraphs();
          if (graphs.length > 1) {
            throw new Error("GraphPO locator contains multiple graphs. Pass a more specific locator.");
          }
          // GraphState.READY (2); apps/e2e/tests/playwright-page-object.spec.ts guards this value.
          if (graphs[0]?.state === 2) {
            await nextFrame();
            return;
          }
          await nextFrame();
        }

        throw new Error(`Graph did not become ready within ${timeoutMs}ms.`);
      },
      { key: GRAPH_INSTANCE_SYMBOL_KEY, timeoutMs: timeout },
      { timeout }
    );
  }

  /**
   * Runs a serializable callback in the browser against the graph instance.
   * As with Playwright's evaluate APIs, the callback cannot capture variables
   * from the Node.js test context; pass them through `arg` instead.
   */
  public evaluate<TResult>(pageFunction: (graph: Graph) => TResult | Promise<TResult>): Promise<TResult>;
  public evaluate<TResult, TArg>(
    pageFunction: (graph: Graph, arg: TArg) => TResult | Promise<TResult>,
    arg: TArg
  ): Promise<TResult>;
  public async evaluate<TResult, TArg>(
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
      const root = graph.layers.$root;
      if (!root) throw new Error("Cannot get bounds of a detached graph");
      const rect = root.getBoundingClientRect();
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
    const [fromPosition, toPosition, dragThreshold] = await Promise.all([
      this.toRootPoint(from),
      this.toRootPoint(to),
      this.evaluate((graph) => graph.rootStore.settings.$dragThreshold.value),
    ]);
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

      const fromViewport = {
        x: bounds.x + fromPosition.x,
        y: bounds.y + fromPosition.y,
      };
      if (dragThreshold > 0) {
        const activationDistance = dragThreshold + 1;
        const activationDirection = fromPosition.x + activationDistance <= bounds.width ? 1 : -1;
        await this.page.mouse.move(fromViewport.x + activationDirection * activationDistance, fromViewport.y);
      }
      // The graph starts a drag on a mousemove rather than on mousedown. Move
      // back to the source point so the drag origin matches `from` even when a
      // non-zero drag threshold is configured.
      await this.page.mouse.move(fromViewport.x, fromViewport.y);
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

  public async getSelectedConnectionIds(): Promise<TConnectionId[]> {
    return this.evaluate((graph) => Array.from(graph.connections.connectionSelectionBucket.$selected.value));
  }

  /**
   * Returns the raw connection data. Values cross the page boundary as serialized data, so symbol
   * port ids are not supported.
   */
  public async getConnections(): Promise<TConnection[]> {
    return this.evaluate((graph) => graph.connections.toJSON());
  }

  /**
   * Checks for a connection between two blocks; see {@link GraphConnectionBlockEndpoints} for how
   * anchors and block connection points are matched. Use {@link hasConnectionBetweenPorts} for
   * port-based connections.
   */
  public async hasConnectionBetween(
    sourceBlockId: TBlockId,
    targetBlockId: TBlockId,
    anchors: Pick<GraphConnectionBlockEndpoints, "sourceAnchorId" | "targetAnchorId"> = {}
  ): Promise<boolean> {
    const endpoints: GraphConnectionBlockEndpoints = {
      sourceBlockId,
      targetBlockId,
      sourceAnchorId: anchors.sourceAnchorId,
      targetAnchorId: anchors.targetAnchorId,
    };
    return (await this.findConnectionIds(endpoints)).length > 0;
  }

  /** Checks for a connection whose resolved source and target port ids match. */
  public async hasConnectionBetweenPorts(sourcePortId: GraphPortId, targetPortId: GraphPortId): Promise<boolean> {
    return (await this.findConnectionIds({ sourcePortId, targetPortId })).length > 0;
  }

  /**
   * Returns the id of the only connection with the given endpoints, or `null` when there is none.
   * Throws when several connections match; narrow the query (for example with anchor ids).
   * Useful for connections created without an explicit id.
   */
  public async findConnectionId(endpoints: GraphConnectionEndpoints): Promise<TConnectionId | null> {
    const ids = await this.findConnectionIds(endpoints);
    if (ids.length > 1) {
      throw new Error(`Several connections match ${JSON.stringify(endpoints)}: ${ids.join(", ")}.`);
    }
    return ids[0] ?? null;
  }

  private async findConnectionIds(endpoints: GraphConnectionEndpoints): Promise<TConnectionId[]> {
    return this.evaluate((graph, query) => {
      // Mirrors createBlockPointPortId/createAnchorPortId from @gravity-ui/graph; the callback runs in
      // the page and cannot import them. apps/e2e asserts that both formats stay in sync.
      const blockPortId = (blockId: TBlockId, anchorId: string | undefined, isInput: boolean): string =>
        anchorId === undefined
          ? `${String(blockId)}_${isInput ? "input" : "output"}`
          : `${String(blockId)}/${anchorId}`;

      return graph.connections.$connections.value
        .filter((connection) => {
          const sourcePortId = connection.$sourcePortId.value;
          const targetPortId = connection.$targetPortId.value;

          if (query.sourcePortId !== undefined) {
            return sourcePortId === query.sourcePortId && targetPortId === query.targetPortId;
          }

          const matchesSource =
            sourcePortId === blockPortId(query.sourceBlockId, query.sourceAnchorId, false) ||
            (query.sourceAnchorId === undefined && connection.sourceBlockId === query.sourceBlockId);
          const matchesTarget =
            targetPortId === blockPortId(query.targetBlockId, query.targetAnchorId, true) ||
            (query.targetAnchorId === undefined && connection.targetBlockId === query.targetBlockId);

          return matchesSource && matchesTarget;
        })
        .map((connection) => connection.id);
    }, endpoints);
  }

  public async getCursor(): Promise<string> {
    return this.evaluate((graph) => {
      const root = graph.layers.$root;
      if (!root) throw new Error("Cannot get cursor of a detached graph");
      return window.getComputedStyle(root).cursor;
    });
  }

  private async toRootPoint(point: GraphPoint): Promise<GraphPoint> {
    return this.evaluate((graph, worldPoint) => {
      const [x, y] = graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y);
      return { x, y };
    }, point);
  }

  private async getGraphHandle(): Promise<JSHandle<Graph>> {
    const handle = await this.root.evaluateHandle((scope, key) => {
      const elements = [scope, ...Array.from(scope.querySelectorAll("*"))];
      const graphs: unknown[] = [];

      for (const element of elements) {
        const graph = (element as unknown as BrowserGraphRecord)[Symbol.for(key)];
        if (graph && !graphs.includes(graph)) {
          graphs.push(graph);
        }
      }

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
    }, GRAPH_INSTANCE_SYMBOL_KEY);

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
