import type { TBlock, TConnection } from "@gravity-ui/graph";
import type { ConverterResult } from "@gravity-ui/graph-elk";
import type { ElkNode } from "elkjs";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

export type ElkFixture = {
  blocks: TBlock[];
  connections: TConnection[];
  elkGraph: ElkNode;
};

/**
 * Graph fixture with the ELK bundle: a real `elkjs` instance and the public
 * `@gravity-ui/graph-elk` entrypoints, used exactly as an application would.
 */
export class ElkPageObject extends GraphPageObject {
  protected override getUrl(): string {
    return "/elk.html";
  }

  /**
   * Runs the layout through `useElk` in a React root and merges the result into
   * the graph entities with `setEntities`, as documented in the package README.
   */
  public async applyLayoutWithHook(fixture: ElkFixture): Promise<void> {
    await this.page.evaluate(({ blocks, connections, elkGraph }) => {
      return new Promise<void>((resolve, reject) => {
        const { ELK, useElk, React, ReactDOM } = window.ElkModule;
        const { MultipointConnection } = window.GraphModule;
        const host = document.getElementById("elk-root");
        if (!host) throw new Error("ELK root element not found");

        const elk = new ELK();
        const graph = window.graph;
        graph.updateSettings({ connection: MultipointConnection });
        // Stable options: useElk re-runs the layout when its arguments change.
        const options = { onError: reject };

        function Layout(): null {
          const { result, isLoading } = useElk(elkGraph, elk, options);
          React.useEffect(() => {
            if (isLoading || !result) return;
            graph.setEntities({
              blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
              connections: connections.map((connection) => ({
                ...connection,
                ...(connection.id === undefined ? {} : result.edges[connection.id]),
              })),
            });
            resolve();
          }, [isLoading, result]);
          return null;
        }

        ReactDOM.createRoot(host).render(React.createElement(Layout));
      });
    }, fixture);
    await this.waitForFrames(3);
  }

  /** Runs the layout with `elk.layout()` and converts it with `elkConverter`, without React. */
  public async layoutWithConverter(elkGraph: ElkNode): Promise<{ raw: ElkNode; converted: ConverterResult }> {
    return this.page.evaluate(async (input) => {
      const { ELK, elkConverter } = window.ElkModule;
      const raw = await new ELK().layout(input);
      return { raw, converted: elkConverter(raw) };
    }, elkGraph);
  }
}
