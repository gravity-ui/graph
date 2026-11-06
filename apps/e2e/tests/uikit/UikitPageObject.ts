import type { Locator } from "@playwright/test";

import type { TGraphColors } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import type { GraphConfig } from "../../page-objects/GraphPageObject";

type UikitGraphModule = typeof import("../../uikit-entry");

type TUikitMode = "view" | "edit";

declare global {
  interface Window {
    /** Set by pages/uikit.html: core, React, uikit and graph-uikit from one bundle. */
    UikitModule: UikitGraphModule;
    setUikitTheme?: (theme: string) => void;
    setUikitMode?: (mode: TUikitMode) => void;
    uikitMenuActions?: string[];
  }
}

export type UikitFixtureOptions = {
  theme?: "light" | "dark";
  scoped?: boolean;
  mode?: TUikitMode;
};

/**
 * React fixture: ThemeProvider > UikitGraphCanvas with GraphTooltip (no delay) and GraphContextMenu,
 * plus a GraphUikitToolbar (step 0.1, all zoom buttons) overlaid at the top left.
 */
export class UikitPageObject extends GraphPageObject {
  protected override getUrl(): string {
    return "/uikit.html";
  }

  public async open(config: GraphConfig, options: UikitFixtureOptions = {}): Promise<void> {
    await this.page.goto(this.getUrl());
    await this.page.waitForFunction(() => window.graphLibraryLoaded === true);
    await this.page.evaluate(
      ({ cfg, opts }) =>
        new Promise<void>((resolve) => {
          const {
            React,
            ReactDOM,
            ThemeProvider,
            UikitGraphCanvas,
            GraphTooltip,
            GraphContextMenu,
            GraphUikitToolbar,
            group,
            zoomGroup,
            useUikitGraph,
            GraphState,
          } = window.UikitModule;
          const rootEl = document.getElementById("root");
          if (!rootEl) throw new Error("Root element not found");
          window.uikitMenuActions = [];

          const toolbarActions = [group(...zoomGroup({ reset: true, viewport: true, selection: true }))];

          function App(): React.ReactElement {
            const [theme, setTheme] = React.useState<string>(opts.theme ?? "light");
            const [mode, setMode] = React.useState<TUikitMode>(opts.mode ?? "view");
            window.setUikitTheme = setTheme;
            window.setUikitMode = setMode;
            const { graph, setEntities, start } = useUikitGraph({ mode, settings: cfg.settings });
            React.useEffect(() => {
              setEntities({ blocks: cfg.blocks ?? [], connections: cfg.connections ?? [] });
              start();
              window.graph = graph;
              const waitForReady = (): void => {
                if (graph.state === GraphState.READY) {
                  graph.zoomTo("center");
                  window.graphInitialized = true;
                  resolve();
                } else {
                  requestAnimationFrame(waitForReady);
                }
              };
              requestAnimationFrame(waitForReady);
            }, [graph]);
            return React.createElement(
              ThemeProvider,
              { theme, scoped: opts.scoped },
              React.createElement(
                UikitGraphCanvas,
                { graph },
                React.createElement(GraphTooltip, {
                  content: (entity) => `tooltip:${entity.kind}:${String(entity.id)}`,
                  openDelay: 0,
                }),
                React.createElement(GraphContextMenu, {
                  items: (entity) => [
                    { text: `menu:${entity.kind}`, action: () => window.uikitMenuActions?.push(entity.kind) },
                  ],
                })
              ),
              React.createElement(
                "div",
                { style: { position: "absolute", left: 16, top: 16, zIndex: 10 } },
                React.createElement(GraphUikitToolbar, {
                  graph,
                  actions: toolbarActions,
                  zoomStep: 0.1,
                  qa: "graph-uikit-toolbar",
                })
              )
            );
          }

          ReactDOM.createRoot(rootEl).render(React.createElement(App));
        }),
      { cfg: config, opts: options }
    );
    await this.waitForFrames(3);
  }

  public async setTheme(theme: string): Promise<void> {
    await this.page.evaluate((value) => window.setUikitTheme?.(value), theme);
    await this.page.waitForTimeout(50);
    await this.waitForFrames(3);
  }

  public async setMode(mode: TUikitMode): Promise<void> {
    await this.page.evaluate((value) => window.setUikitMode?.(value), mode);
    await this.waitForFrames(3);
  }

  /** Token value as seen by the graph root (inside scoped ThemeProviders too). */
  public async readToken(name: string): Promise<string> {
    return this.page.evaluate((token) => {
      const element = document.querySelector(".graph-canvas") ?? document.body;
      return getComputedStyle(element).getPropertyValue(token).trim();
    }, name);
  }

  public async getGraphColors(): Promise<TGraphColors> {
    return this.evaluate((graph) => graph.graphColors);
  }

  public async getHoveredKind(): Promise<string | null> {
    return this.page.evaluate(
      () => window.UikitModule.getUikitGraphStore(window.graph).$hovered.value?.entity.kind ?? null
    );
  }

  public async isCanvasBlockHovered(blockId: string): Promise<boolean> {
    return this.evaluate((graph, id) => {
      const view = graph.blocks.getBlockState(id)?.getViewComponent() as unknown as
        | { $hovered?: { value: boolean } }
        | undefined;
      return view?.$hovered?.value ?? false;
    }, blockId);
  }

  public async getCameraScale(): Promise<number> {
    return this.evaluate((graph) => graph.cameraService.getCameraScale());
  }

  public toolbar(): Locator {
    return this.page.locator('[data-qa="graph-uikit-toolbar"]');
  }

  public tooltip(): Locator {
    return this.page.locator('[data-qa="graph-uikit-tooltip"]');
  }

  public contextMenu(): Locator {
    return this.page.locator('[data-qa="graph-uikit-context-menu"]');
  }

  public surfaces(): Locator {
    return this.page.locator(".graph-uikit-block__surface");
  }
}
