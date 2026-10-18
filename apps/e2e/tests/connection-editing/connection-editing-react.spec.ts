import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { Graph, TBlock } from "@gravity-ui/graph";

import type { GraphConfig } from "../../page-objects/GraphPageObject";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

import { ConnectionEditingPageObject } from "./ConnectionEditingPageObject";

type TLayerHostState = { mounted: boolean; enabled: boolean };

type TReactLayerWindow = Window & {
  setConnectionEditing?: (state: TLayerHostState) => void;
};

const BLOCKS: TBlock[] = [
  {
    id: "block-a",
    is: "Block",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    name: "Block A",
    selected: false,
    anchors: [{ id: "out-a", blockId: "block-a", type: "OUT" }],
  },
  {
    id: "block-b",
    is: "Block",
    x: 500,
    y: 0,
    width: 200,
    height: 100,
    name: "Block B",
    selected: false,
    anchors: [{ id: "in-b", blockId: "block-b", type: "IN" }],
  },
];

/**
 * React application that creates the graph with `useGraph` and attaches the layer with `useLayer` from
 * `@gravity-ui/graph-react` inside StrictMode, and lets the test mount, unmount and toggle it through `window.setConnectionEditing`.
 */
class ReactConnectionEditingPageObject extends ReactGraphPageObject {
  protected override async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      return new Promise<void>((resolve) => {
        const { GraphCanvas, ConnectionEditingLayer, React, ReactDOM, GraphState, useGraph, useLayer } =
          window.GraphModule;
        const rootEl = document.getElementById("root");
        if (!rootEl) throw new Error("Root element not found");
        const settings = cfg.settings;

        function LayerHost({ graph, enabled }: { graph: Graph; enabled: boolean }) {
          useLayer(graph, ConnectionEditingLayer, { enabled });
          return null;
        }

        function App() {
          const { graph, setEntities, start } = useGraph({ settings });
          const [state, setState] = React.useState<TLayerHostState>({ mounted: true, enabled: true });
          (window as TReactLayerWindow).setConnectionEditing = setState;
          React.useEffect(() => {
            setEntities({ blocks: cfg.blocks ?? [], connections: [] });
            start();
            window.graph = graph;
            const waitForReady = () => {
              if (graph.state === GraphState.READY) {
                window.graphInitialized = true;
                resolve();
              } else {
                requestAnimationFrame(waitForReady);
              }
            };
            requestAnimationFrame(waitForReady);
          }, [graph]);
          return React.createElement(
            React.Fragment,
            null,
            React.createElement(GraphCanvas, {
              graph,
              renderBlock: (g: Graph, block: TBlock) => React.createElement("div", null, block.name),
            }),
            state.mounted ? React.createElement(LayerHost, { graph, enabled: state.enabled }) : null
          );
        }

        ReactDOM.createRoot(rootEl).render(React.createElement(React.StrictMode, null, React.createElement(App)));
      });
    }, config);
  }

  public async setLayerHost(state: TLayerHostState): Promise<void> {
    await this.page.evaluate((next) => (window as TReactLayerWindow).setConnectionEditing?.(next), state);
    await this.waitForFrames(3);
  }

  /** Remembers the current layer instance to compare with it later. */
  public async markLayer(): Promise<void> {
    await this.evaluate((graph) => {
      (window as Window & { markedLayer?: unknown }).markedLayer = graph.layers
        .getLayers()
        .find((layer) => layer instanceof window.GraphModule.ConnectionEditingLayer);
    });
  }

  public async isMarkedLayer(): Promise<boolean> {
    return this.evaluate((graph) => {
      const layers = graph.layers
        .getLayers()
        .filter((layer) => layer instanceof window.GraphModule.ConnectionEditingLayer);
      const marked = (window as Window & { markedLayer?: unknown }).markedLayer;
      return layers.length === 1 && marked !== undefined && layers[0] === marked;
    });
  }

  public async countLayers(): Promise<number> {
    return this.evaluate(
      (graph) =>
        graph.layers.getLayers().filter((layer) => layer instanceof window.GraphModule.ConnectionEditingLayer).length
    );
  }
}

let graphPO: ReactConnectionEditingPageObject;
let layerPO: ConnectionEditingPageObject;

async function setup(page: Page): Promise<void> {
  graphPO = new ReactConnectionEditingPageObject(page);
  layerPO = new ConnectionEditingPageObject(page, graphPO);
  await graphPO.initialize({ blocks: BLOCKS, settings: { useBlocksAnchors: true, canDrag: "all" } });
  // Canvas anchors are interactive below the detailed (React) zoom level.
  await graphPO.camera().zoomToScale(0.5);
}

async function dragAnchors(): Promise<void> {
  await graphPO.drag(await layerPO.getAnchorPoint("block-a", "out-a"), await layerPO.getAnchorPoint("block-b", "in-b"));
}

/** Drags the source anchor away from the other block; without the layer this moves block A down. */
async function dragAnchorDown(): Promise<void> {
  const from = await layerPO.getAnchorPoint("block-a", "out-a");
  await graphPO.drag(from, { x: from.x, y: from.y + 150 });
}

test.describe("ConnectionEditingLayer – React useLayer", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test("useLayer attaches exactly one layer under StrictMode and it creates connections", async () => {
    expect(await graphPO.countLayers()).toBe(1);

    await dragAnchors();

    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({ sourceBlockId: "block-a", sourceAnchorId: "out-a", targetBlockId: "block-b" }),
    ]);
  });

  test("the enabled prop update turns connection creation off and on", async () => {
    await graphPO.markLayer();
    await graphPO.setLayerHost({ mounted: true, enabled: false });
    await dragAnchorDown();
    expect(await graphPO.getConnections()).toEqual([]);
    // With the layer disabled, the anchor drags its block.
    expect(await graphPO.block("block-a").getGeometry()).not.toMatchObject({ x: 0, y: 0 });

    await graphPO.setLayerHost({ mounted: true, enabled: true });
    // The prop is applied to the same layer instance (setProps), not by recreating it.
    expect(await graphPO.isMarkedLayer()).toBe(true);
    await dragAnchors();
    expect(await graphPO.getConnections()).toHaveLength(1);
  });

  test("unmounting the component removes the layer", async () => {
    await graphPO.setLayerHost({ mounted: false, enabled: true });
    expect(await graphPO.countLayers()).toBe(0);

    await dragAnchorDown();

    expect(await graphPO.getConnections()).toEqual([]);
    expect(await graphPO.block("block-a").getGeometry()).not.toMatchObject({ x: 0, y: 0 });
  });
});
