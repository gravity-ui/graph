import type { TBlock, TConnection } from "@gravity-ui/graph";
import type { ConverterResult } from "@gravity-ui/graph-elk";
import type { ElkNode } from "elkjs";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

type ElkGraphModule = typeof import("../../elk-entry");

declare global {
  interface Window {
    /** Set by pages/elk.html: core, React, graph-react and graph-elk from one bundle. */
    ElkModule: ElkGraphModule;
    elkLayoutCalls?: number;
    elkErrors?: string[];
    unmountElkApp?: () => void;
  }
}

export type ElkFixture = {
  blocks: TBlock[];
  connections: TConnection[];
  elkGraph: ElkNode;
};

/**
 * Builds the ELK input the way the package README does: blocks become children, and only
 * connections with an id and both block ids become edges (port-only connections are skipped).
 */
export function toElkGraph(
  blocks: TBlock[],
  connections: TConnection[],
  layoutOptions: Record<string, string>
): ElkNode {
  return {
    id: "root",
    layoutOptions,
    children: blocks.map(({ id, width, height }) => ({ id: String(id), width, height })),
    edges: connections.flatMap(({ id, sourceBlockId, targetBlockId }) =>
      id === undefined || sourceBlockId === undefined || targetBlockId === undefined
        ? []
        : [{ id: String(id), sources: [String(sourceBlockId)], targets: [String(targetBlockId)] }]
    ),
  };
}

/**
 * Fixture for `@gravity-ui/graph-elk` with a real `elkjs` instance. The application component uses the
 * documented path: `useGraph` + `useElk` + `GraphCanvas` in one React tree, merging the result with `setEntities`.
 */
export class ElkPageObject extends GraphPageObject {
  protected override getUrl(): string {
    return "/elk.html";
  }

  /** Opens the page without rendering a graph (for the framework-free converter). */
  public async openPage(): Promise<void> {
    await this.page.goto(this.getUrl());
    await this.page.waitForFunction(() => window.graphLibraryLoaded === true);
  }

  /** Renders the ELK application and waits until the laid-out graph is ready. */
  public async renderLayout(fixture: ElkFixture): Promise<void> {
    await this.openPage();
    await this.page.evaluate(({ blocks, connections, elkGraph }) => {
      const elkWindow = window;
      const { ELK, useElk, useGraph, GraphCanvas, GraphBlock, GraphState, MultipointConnection, React, ReactDOM } =
        elkWindow.ElkModule;
      const host = document.getElementById("root");
      if (!host) throw new Error("Root element not found");

      // Count real layout runs to prove the hook does not re-run on every render.
      const elk = new ELK();
      const layout = elk.layout.bind(elk);
      elkWindow.elkLayoutCalls = 0;
      elkWindow.elkErrors = [];
      elk.layout = (graph, args) => {
        elkWindow.elkLayoutCalls = (elkWindow.elkLayoutCalls ?? 0) + 1;
        return layout(graph, args);
      };

      function App(): React.ReactElement {
        const { graph, setEntities, start } = useGraph({ settings: { connection: MultipointConnection } });
        // Inline options on purpose: a new onError on every render must not restart the layout.
        const { result, isLoading } = useElk(elkGraph, elk, {
          onError: (error) => elkWindow.elkErrors?.push(error.message),
        });

        React.useEffect(() => {
          if (isLoading || !result) return;
          setEntities({
            blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
            connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
          });
          start();
          window.graph = graph;
          const waitForReady = (): void => {
            if (graph.state === GraphState.READY) {
              graph.zoomTo("center");
              window.graphInitialized = true;
            } else {
              requestAnimationFrame(waitForReady);
            }
          };
          requestAnimationFrame(waitForReady);
        }, [isLoading, result, setEntities, start, graph]);

        return React.createElement(GraphCanvas, {
          graph,
          renderBlock: (g, block) => React.createElement(GraphBlock, { graph: g, block, children: block.name }),
        });
      }

      const root = ReactDOM.createRoot(host);
      root.render(React.createElement(App));
      elkWindow.unmountElkApp = () => root.unmount();
    }, fixture);

    await this.page.waitForFunction(() => window.graphInitialized === true, { timeout: 10000 });
    await this.waitForFrames(3);
  }

  public async getLayoutCalls(): Promise<number> {
    return this.page.evaluate(() => window.elkLayoutCalls ?? 0);
  }

  public async getLayoutErrors(): Promise<string[]> {
    return this.page.evaluate(() => window.elkErrors ?? []);
  }

  /** Unmounts the React application, as an application does when the graph view closes. */
  public async unmount(): Promise<void> {
    await this.page.evaluate(() => window.unmountElkApp?.());
  }

  /** Runs `elk.layout()` and converts it with `elkConverter`, without React or a graph. */
  public async layoutWithConverter(elkGraph: ElkNode): Promise<{ raw: ElkNode; converted: ConverterResult }> {
    return this.page.evaluate(async (input) => {
      const { ELK, elkConverter } = window.ElkModule;
      const raw = await new ELK().layout(input);
      return { raw, converted: elkConverter(raw) };
    }, elkGraph);
  }
}
