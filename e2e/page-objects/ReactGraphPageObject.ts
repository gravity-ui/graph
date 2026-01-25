import { Page } from "@playwright/test";
import { GraphPageObject, GraphConfig } from "./GraphPageObject";

export class ReactGraphPageObject extends GraphPageObject {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Initialize React graph with config
   */
  async initialize(config: GraphConfig): Promise<void> {
    await this.page.goto("/base.html");

    // Inject React and Graph library from build
    await this.page.addScriptTag({
      path: "./node_modules/react/umd/react.development.js",
    });
    await this.page.addScriptTag({
      path: "./node_modules/react-dom/umd/react-dom.development.js",
    });
    await this.page.addScriptTag({
      path: "./build/index.js",
      type: "module",
    });
    await this.page.addScriptTag({
      path: "./build/react-components/index.js",
      type: "module",
    });

    // Wait for libraries to load
    await this.page.waitForFunction(() => {
      return (
        typeof window.React !== "undefined" &&
        typeof window.ReactDOM !== "undefined" &&
        typeof window.Graph !== "undefined"
      );
    });

    // Initialize React graph
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!rootEl || !(rootEl instanceof HTMLDivElement)) {
        throw new Error("Root element not found or is not a div");
      }

      // Create graph using useGraph hook pattern
      const graph = new window.Graph(cfg, rootEl);
      graph.start();
      graph.zoomTo("center");

      window.graph = graph;
      window.graphInitialized = true;
    }, config);

    // Wait for graph to be ready
    await this.waitForReady();
  }
}
