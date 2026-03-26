import { Page } from "@playwright/test";
import { TBlock } from "../../src/components/canvas/blocks/Block";
import { TConnection } from "../../src/store/connection/ConnectionState";
import { GraphPageObject, GraphConfig } from "./GraphPageObject";

type ReactGraphChildConfig =
  | {
      type: "hovered-hook-probe";
      hoverEnterTimeoutMs?: number;
      hoverLeaveTimeoutMs?: number;
    }
  | {
      type: "graph-tooltip";
      hoverEnterTimeoutMs?: number;
      hoverLeaveTimeoutMs?: number;
    }
  | {
      type: "hover-lock-target";
    };

type ReactGraphExtendedConfig = GraphConfig & {
  children?: ReactGraphChildConfig[];
  hoverEnterTimeoutMs?: number;
  hoverLeaveTimeoutMs?: number;
};

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
   * Initializes React graph test app with custom React children descriptors.
   */
  private async initializeWithChildren(
    config: ReactGraphExtendedConfig,
    navigate: boolean
  ): Promise<void> {
    if (navigate) {
      await this.page.goto(this.getUrl());
      await this.page.waitForFunction(() => {
        return (window as any).graphLibraryLoaded === true;
      });
    }

    await this.page.evaluate(
      ({ cfg }) => {
        const {
          Graph,
          GraphCanvas,
          GraphBlock,
          GraphTooltip,
          React,
          ReactDOM,
          ESchedulerPriority,
          useHoveredGraphComponent,
        } = (window as any).GraphModule;

        const createRenderBlock = () => {
          return (g: unknown, block: { id: string; name?: string }) => {
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
        };

        const rootEl = document.getElementById("root");
        if (!rootEl) {
          throw new Error("Root element not found");
        }

        const graph = new Graph(cfg, rootEl);
        const renderBlock = createRenderBlock();
        const reactRoot = ReactDOM.createRoot(rootEl);

        const graphCanvasChildren: unknown[] = [];
        const rootChildren: unknown[] = [];

        (cfg.children || []).forEach((child: ReactGraphChildConfig, index: number) => {
          if (child.type === "hovered-hook-probe") {
            const HookProbe = () => {
              const { hoveredComponent } = useHoveredGraphComponent({
                graph,
                isHoverLockTarget: (target: EventTarget | null) =>
                  target instanceof Element && target.closest(".hover-lock-target") !== null,
                enterDebounce: {
                  priority: ESchedulerPriority.MEDIUM,
                  frameInterval: 1,
                  frameTimeout: child.hoverEnterTimeoutMs ?? 150,
                },
                leaveDebounce: {
                  priority: ESchedulerPriority.MEDIUM,
                  frameInterval: 1,
                  frameTimeout: child.hoverLeaveTimeoutMs ?? 150,
                },
              });

              const hoveredId = hoveredComponent?.props?.id ?? "";
              (window as any).__hoveredId = hoveredId || null;

              return React.createElement("div", {
                "data-testid": "hovered-state",
                "data-hovered-id": hoveredId,
              });
            };

            graphCanvasChildren.push(React.createElement(HookProbe, { key: `hovered-hook-probe-${index}` }));
            return;
          }

          if (child.type === "graph-tooltip") {
            graphCanvasChildren.push(
              React.createElement(GraphTooltip, {
                key: `graph-tooltip-${index}`,
                getTooltipContent: (component: { props?: { id?: string } }) => {
                  const id = component?.props?.id;
                  (window as any).__tooltipLastTargetId = id ?? null;
                  return id ? `Tooltip for ${id}` : null;
                },
                hoverEnterDebounce: {
                  priority: ESchedulerPriority.MEDIUM,
                  frameInterval: 1,
                  frameTimeout: child.hoverEnterTimeoutMs ?? 0,
                },
                hoverLeaveDebounce: {
                  priority: ESchedulerPriority.MEDIUM,
                  frameInterval: 1,
                  frameTimeout: child.hoverLeaveTimeoutMs ?? 0,
                },
              })
            );
            return;
          }

          if (child.type === "hover-lock-target") {
            rootChildren.push(
              React.createElement("div", {
                key: `hover-lock-target-${index}`,
                className: "hover-lock-target",
                "data-testid": "hover-lock-target",
                style: {
                  position: "fixed",
                  top: "20px",
                  right: "20px",
                  width: "120px",
                  height: "40px",
                  background: "rgba(0,0,0,0.15)",
                  zIndex: 9999,
                },
              })
            );
          }
        });

        rootChildren.unshift(
          React.createElement(
            GraphCanvas,
            {
              graph,
              renderBlock,
              style: { width: "100%", height: "100vh" },
            },
            ...graphCanvasChildren
          )
        );

        reactRoot.render(
          React.createElement(
            React.Fragment,
            null,
            ...rootChildren
          )
        );

        // Set initial entities if provided
        if (cfg.blocks || cfg.connections) {
          graph.setEntities({
            blocks: cfg.blocks || [],
            connections: cfg.connections || [],
          });
        }

        graph.start();
        graph.zoomTo("center");

        // Expose to window for tests
        window.graph = graph;
        window.graphInitialized = true;
      },
      { cfg: config }
    );

    await this.page.waitForFunction(() => {
      return (window as any).graphInitialized === true;
    });
    await this.waitForFrames(3);
  }

  /**
   * Creates graph wrapped in React GraphCanvas (enables HTML block rendering via BlocksList).
   */
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.initializeWithChildren(config, false);
  }

  public async initializeWithHoveredHook(config: ReactGraphExtendedConfig): Promise<void> {
    await this.initializeWithChildren(
      {
        ...config,
        children: [
          {
            type: "hovered-hook-probe",
            hoverEnterTimeoutMs: config.hoverEnterTimeoutMs ?? 150,
            hoverLeaveTimeoutMs: config.hoverLeaveTimeoutMs ?? 150,
          },
          { type: "hover-lock-target" },
        ],
      },
      true
    );
  }

  public async initializeWithGraphTooltip(config: ReactGraphExtendedConfig): Promise<void> {
    await this.initializeWithChildren(
      {
        ...config,
        children: [
          {
            type: "graph-tooltip",
            hoverEnterTimeoutMs: config.hoverEnterTimeoutMs ?? 0,
            hoverLeaveTimeoutMs: config.hoverLeaveTimeoutMs ?? 0,
          },
        ],
      },
      true
    );
  }

  public async initializeWithCustomChildren(config: ReactGraphExtendedConfig): Promise<void> {
    await this.initializeWithChildren(config, true);
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

  public async getHookHoveredId(): Promise<string> {
    return await this.page.evaluate(() => {
      return (window as any).__hoveredId ?? "";
    });
  }

  public async emitMouseLeaveFromLockTarget(): Promise<void> {
    await this.page.evaluate(() => {
      const lockTarget = document.querySelector('[data-testid="hover-lock-target"]');
      const sourceEvent = new MouseEvent("mousemove", { bubbles: true });
      Object.defineProperty(sourceEvent, "target", {
        value: lockTarget,
        configurable: true,
      });
      (window as any).graph.emit("mouseleave", {
        target: null,
        sourceEvent,
        pointerPressed: false,
      });
    });
  }

  public async lockHoverByLockTarget(): Promise<void> {
    await this.page.evaluate(() => {
      const lockTarget = document.querySelector('[data-testid="hover-lock-target"]');
      const lockEvent = new MouseEvent("mousemove", { bubbles: true });
      Object.defineProperty(lockEvent, "target", {
        value: lockTarget,
        configurable: true,
      });
      document.dispatchEvent(lockEvent);
    });
  }

  public async unlockHoverByBody(): Promise<void> {
    await this.page.evaluate(() => {
      const unlockEvent = new MouseEvent("mousemove", { bubbles: true });
      Object.defineProperty(unlockEvent, "target", {
        value: document.body,
        configurable: true,
      });
      document.dispatchEvent(unlockEvent);
    });
  }

  public async getTooltipLastTargetId(): Promise<string> {
    return await this.page.evaluate(() => {
      return (window as any).__tooltipLastTargetId ?? "";
    });
  }
}
