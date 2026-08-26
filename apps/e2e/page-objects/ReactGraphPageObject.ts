import { Page } from "@playwright/test";
import { TBlock } from "../../src/components/canvas/blocks/Block";
import { TConnection } from "../../src/store/connection/ConnectionState";
import { GraphPageObject, GraphConfig } from "./GraphPageObject";

/**
 * PageObject for React-based graph rendering (using GraphCanvas + BlocksList).
 * Extends GraphPageObject with React-specific initialization.
 */
export class ReactGraphPageObject extends GraphPageObject {
  constructor(page: Page) {
    super(page);
  }

  protected getUrl(): string {
    return "/react.html";
  }

  /**
   * Creates graph wrapped in React GraphCanvas (enables HTML block rendering via BlocksList).
   * GraphCanvas handles graph.attach() via its own useEffect, so we do NOT pass rootEl
   * to the Graph constructor to avoid a double-attach conflict.
   */
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      return new Promise<void>((resolve) => {
        const { Graph, GraphCanvas, GraphBlock, React, ReactDOM, GraphState } = (window as any).GraphModule;

        const rootEl = document.getElementById("root");
        if (!rootEl) {
          throw new Error("Root element not found");
        }

        // Do NOT pass rootEl here — GraphCanvas.useEffect calls graph.attach(containerRef)
        const graph = new Graph(cfg);

        const renderBlock = (g: unknown, block: { id: string; name?: string }) => {
          return React.createElement(
            GraphBlock,
            { graph: g, block },
            React.createElement(
              "div",
              { "data-testid": `block-${block.id}`, style: { padding: "8px" } },
              block.name || block.id
            )
          );
        };

        const reactRoot = ReactDOM.createRoot(rootEl);
        reactRoot.render(React.createElement(GraphCanvas, { graph, renderBlock }));

        // Set initial entities if provided
        if (cfg.blocks || cfg.connections) {
          graph.setEntities({
            blocks: cfg.blocks || [],
            connections: cfg.connections || [],
          });
        }

        // graph.start() defers until graph.attach() is called inside GraphCanvas.useEffect.
        // After attach, start() fires automatically via startRequested flag.
        graph.start();

        // Expose to window and resolve when graph is truly READY (attached + started)
        window.graph = graph;
        const waitForReady = () => {
          if (graph.state === GraphState.READY) {
            graph.zoomTo("center");
            window.graphInitialized = true;
            resolve();
          } else {
            requestAnimationFrame(waitForReady);
          }
        };
        requestAnimationFrame(waitForReady);
      });
    }, config);
  }

  /**
   * Get count of rendered HTML blocks in the DOM
   */
  async getRenderedHtmlBlockCount(): Promise<number> {
    return await this.page.evaluate(() => {
      return document.querySelectorAll("[data-testid^='block-']").length;
    });
  }

  /**
   * Get IDs of rendered HTML blocks in the DOM
   */
  async getRenderedHtmlBlockIds(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const elements = document.querySelectorAll("[data-testid^='block-']");
      return Array.from(elements).map((el) =>
        el.getAttribute("data-testid")?.replace("block-", "") || ""
      );
    });
  }

  /**
   * Check if a specific HTML block is rendered in the DOM
   */
  async isHtmlBlockRendered(blockId: string): Promise<boolean> {
    return await this.page.evaluate((id) => {
      return !!document.querySelector(`[data-testid='block-${id}']`);
    }, blockId);
  }
}
