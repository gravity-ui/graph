import { test, expect } from "@playwright/test";
import { Page } from "@playwright/test";
import { GraphConfig, GraphPageObject } from "../page-objects/GraphPageObject";

class EventedAreaPageObject extends GraphPageObject {
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!rootEl) throw new Error("Root element not found");

      const { CanvasBlock, Graph } = (window as any).GraphModule;

      (window as any).__eventedAreaEvents = {};
      (window as any).__eventLog = [];
      (window as any).__areaEnabled = true;

      class TestBlock extends CanvasBlock {
        render() {
          super.render();
          this.eventedArea(
            () => {
              const ctx = this.context.ctx;
              ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
              ctx.fillRect(this.state.x, this.state.y, 50, 50);
              return { x: this.state.x, y: this.state.y, width: 50, height: 50 };
            },
            {
              key: "area1",
              click: () => {
                const e = (window as any).__eventedAreaEvents;
                e.area1Click = (e.area1Click || 0) + 1;
              },
            }
          );
          this.eventedArea(
            () => {
              const ctx = this.context.ctx;
              ctx.fillStyle = "rgba(0, 0, 255, 0.3)";
              ctx.fillRect(this.state.x + this.state.width - 50, this.state.y, 50, 50);
              return {
                x: this.state.x + this.state.width - 50,
                y: this.state.y,
                width: 50,
                height: 50,
              };
            },
            {
              key: "area2",
              click: () => {
                const e = (window as any).__eventedAreaEvents;
                e.area2Click = (e.area2Click || 0) + 1;
              },
            }
          );
        }
      }

      class RejectHitBoxBlock extends CanvasBlock {
        render() {
          super.render();
          this.eventedArea(
            () => ({ x: this.state.x, y: this.state.y, width: 50, height: 50 }),
            {
              key: "reject-area",
              onHitBox: () => false,
              click: () => {
                const e = (window as any).__eventedAreaEvents;
                e.rejectClick = (e.rejectClick || 0) + 1;
              },
            }
          );
        }
      }

      class AcceptHitBoxBlock extends CanvasBlock {
        render() {
          super.render();
          this.eventedArea(
            () => ({ x: this.state.x, y: this.state.y, width: 50, height: 50 }),
            {
              key: "accept-area",
              onHitBox: () => true,
              click: () => {
                const e = (window as any).__eventedAreaEvents;
                e.acceptClick = (e.acceptClick || 0) + 1;
              },
            }
          );
        }
      }

      class HoverTestBlock extends CanvasBlock {
        willMount() {
          super.willMount();
          this.addEventListener("mouseenter", () => {
            (window as any).__eventLog.push({ type: "component:mouseenter", block: this.props.id });
          });
          this.addEventListener("mouseleave", () => {
            (window as any).__eventLog.push({ type: "component:mouseleave", block: this.props.id });
          });
        }
        render() {
          super.render();
          this.eventedArea(
            ({ hovered }) => {
              (window as any).__lastHoveredState = (window as any).__lastHoveredState || {};
              (window as any).__lastHoveredState[this.props.id] = hovered;
              return { x: this.state.x, y: this.state.y, width: 50, height: 50 };
            },
            {
              key: "hover-area",
              mouseenter: () => {
                (window as any).__eventLog.push({ type: "area:mouseenter", block: this.props.id });
              },
              mouseleave: () => {
                (window as any).__eventLog.push({ type: "area:mouseleave", block: this.props.id });
              },
              click: () => {
                const e = (window as any).__eventedAreaEvents;
                e.hoverBlockClick = (e.hoverBlockClick || 0) + 1;
              },
            }
          );
        }
      }

      class ToggleAreaBlock extends CanvasBlock {
        render() {
          super.render();
          if ((window as any).__areaEnabled) {
            this.eventedArea(
              ({ hovered }) => {
                (window as any).__toggleHovered = hovered;
                return { x: this.state.x, y: this.state.y, width: 50, height: 50 };
              },
              {
                key: "toggle-area",
                click: () => {
                  const e = (window as any).__eventedAreaEvents;
                  e.toggleClick = (e.toggleClick || 0) + 1;
                },
                mouseenter: () => {
                  (window as any).__eventLog.push({ type: "area:mouseenter", block: this.props.id });
                },
                mouseleave: () => {
                  (window as any).__eventLog.push({ type: "area:mouseleave", block: this.props.id });
                },
              }
            );
          }
        }
      }

      const graph = new Graph(
        {
          ...cfg,
          settings: {
            ...cfg.settings,
            blockComponents: {
              TestBlock,
              RejectHitBoxBlock,
              AcceptHitBoxBlock,
              ToggleAreaBlock,
              HoverTestBlock,
            },
          },
        },
        rootEl
      );

      if (cfg.blocks || cfg.connections) {
        graph.setEntities({ blocks: cfg.blocks, connections: cfg.connections });
      }

      graph.start();
      graph.zoomTo("center");

      window.graph = graph;
      window.graphInitialized = true;
    }, config);
  }

  async getEventCounts(): Promise<Record<string, number>> {
    return this.page.evaluate(() => ({ ...(window as any).__eventedAreaEvents }));
  }

  async resetEventCounts(): Promise<void> {
    await this.page.evaluate(() => {
      (window as any).__eventedAreaEvents = {};
    });
  }

  async getEventLog(): Promise<Array<{ type: string; block: string }>> {
    return this.page.evaluate(() => [...(window as any).__eventLog]);
  }

  async resetEventLog(): Promise<void> {
    await this.page.evaluate(() => {
      (window as any).__eventLog = [];
    });
  }

  async setAreaEnabled(enabled: boolean): Promise<void> {
    await this.page.evaluate((e) => {
      (window as any).__areaEnabled = e;
    }, enabled);
  }

  async getHoveredState(): Promise<Record<string, boolean>> {
    return this.page.evaluate(() => ({ ...(window as any).__lastHoveredState }));
  }

  async getToggleHovered(): Promise<boolean | undefined> {
    return this.page.evaluate(() => (window as any).__toggleHovered);
  }

  async forceRender(blockId: string): Promise<void> {
    await this.page.evaluate((id) => {
      (window as any).graph.rootStore.blocksList.$blocksMap.value.get(id)?.getViewComponent()?.performRender();
    }, blockId);
    await this.waitForFrames(3);
  }
}

function makeBlock(id: string, is: string, x: number, y: number) {
  return { id, is, x, y, width: 200, height: 100, name: id, anchors: [], selected: false };
}

test.describe("EventedArea", () => {
  test.describe("click handling", () => {
    let graphPO: EventedAreaPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [makeBlock("test-block", "TestBlock", 100, 100)],
        connections: [],
      });
    });

    test("click inside evented area triggers its handler", async () => {
      await graphPO.click(120, 120);

      const events = await graphPO.getEventCounts();
      expect(events.area1Click).toBe(1);
      expect(events.area2Click).toBeUndefined();
    });

    test("click on block but outside evented areas does not trigger handlers", async () => {
      await graphPO.click(200, 150);

      const events = await graphPO.getEventCounts();
      expect(events.area1Click).toBeUndefined();
      expect(events.area2Click).toBeUndefined();
    });

    test("click on empty space does not trigger handlers", async () => {
      await graphPO.click(500, 500);

      const events = await graphPO.getEventCounts();
      expect(events.area1Click).toBeUndefined();
      expect(events.area2Click).toBeUndefined();
    });

    test("multiple evented areas: each receives its own events", async () => {
      // Area1: top-left (100, 100) to (150, 150)
      await graphPO.click(120, 120);

      let events = await graphPO.getEventCounts();
      expect(events.area1Click).toBe(1);
      expect(events.area2Click).toBeUndefined();

      // Area2: top-right (250, 100) to (300, 150)
      await graphPO.click(270, 120);

      events = await graphPO.getEventCounts();
      expect(events.area1Click).toBe(1);
      expect(events.area2Click).toBe(1);
    });

    test("repeated clicks on same area increment counter", async () => {
      await graphPO.click(120, 120);
      await graphPO.click(120, 120);
      await graphPO.click(120, 120);

      const events = await graphPO.getEventCounts();
      expect(events.area1Click).toBe(3);
    });
  });

  test.describe("custom onHitBox", () => {
    let graphPO: EventedAreaPageObject;

    test("onHitBox returning false prevents handler from firing", async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [makeBlock("reject-block", "RejectHitBoxBlock", 100, 100)],
        connections: [],
      });

      await graphPO.click(120, 120);

      const events = await graphPO.getEventCounts();
      expect(events.rejectClick).toBeUndefined();
    });

    test("onHitBox returning true allows handler to fire", async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [makeBlock("accept-block", "AcceptHitBoxBlock", 100, 100)],
        connections: [],
      });

      await graphPO.click(120, 120);

      const events = await graphPO.getEventCounts();
      expect(events.acceptClick).toBe(1);
    });
  });

  test.describe("area mouseenter/mouseleave", () => {
    let graphPO: EventedAreaPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [
          makeBlock("block-1", "HoverTestBlock", 100, 100),
          makeBlock("block-2", "HoverTestBlock", 400, 100),
        ],
        connections: [],
      });
      // Move cursor to empty space to reset GraphLayer target state
      await page.mouse.move(1, 1);
      await graphPO.waitForFrames(3);
      await graphPO.resetEventLog();
    });

    test("entering block over area fires component:mouseenter then area:mouseenter", async () => {
      await graphPO.hover(120, 120);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([
        { type: "component:mouseenter", block: "block-1" },
        { type: "area:mouseenter", block: "block-1" },
      ]);
    });

    test("entering block over non-area fires only component:mouseenter", async () => {
      await graphPO.hover(200, 150);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([{ type: "component:mouseenter", block: "block-1" }]);
    });

    test("leaving block from area fires area:mouseleave then component:mouseleave", async () => {
      await graphPO.hover(120, 120);
      await graphPO.resetEventLog();

      await graphPO.hover(500, 500);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([
        { type: "area:mouseleave", block: "block-1" },
        { type: "component:mouseleave", block: "block-1" },
      ]);
    });

    test("moving within block from area to non-area fires only area:mouseleave", async () => {
      await graphPO.hover(120, 120);
      await graphPO.resetEventLog();

      await graphPO.hover(200, 150);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([{ type: "area:mouseleave", block: "block-1" }]);
    });

    test("moving within block from non-area to area fires only area:mouseenter", async () => {
      await graphPO.hover(200, 150);
      await graphPO.resetEventLog();

      await graphPO.hover(120, 120);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([{ type: "area:mouseenter", block: "block-1" }]);
    });

    test("moving from block-1 area to block-2 area: correct event order", async () => {
      await graphPO.hover(120, 120);
      await graphPO.resetEventLog();

      await graphPO.hover(420, 120);

      const log = await graphPO.getEventLog();
      expect(log).toEqual([
        { type: "area:mouseleave", block: "block-1" },
        { type: "component:mouseleave", block: "block-1" },
        { type: "component:mouseenter", block: "block-2" },
        { type: "area:mouseenter", block: "block-2" },
      ]);
    });

    test("click on area still works alongside hover tracking", async () => {
      await graphPO.hover(120, 120);
      await graphPO.click(120, 120);

      const events = await graphPO.getEventCounts();
      expect(events.hoverBlockClick).toBe(1);
    });
  });

  test.describe("hovered state in render callback", () => {
    let graphPO: EventedAreaPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [
          makeBlock("block-1", "HoverTestBlock", 100, 100),
          makeBlock("block-2", "HoverTestBlock", 400, 100),
        ],
        connections: [],
      });
      await page.mouse.move(1, 1);
      await graphPO.waitForFrames(3);
    });

    test("hovered is false when cursor is outside area", async () => {
      const state = await graphPO.getHoveredState();
      expect(state["block-1"]).toBe(false);
    });

    test("hovered becomes true when cursor enters area", async () => {
      await graphPO.hover(120, 120);
      await graphPO.waitForFrames(3);

      const state = await graphPO.getHoveredState();
      expect(state["block-1"]).toBe(true);
    });

    test("hovered resets to false when cursor leaves area", async () => {
      await graphPO.hover(120, 120);
      await graphPO.waitForFrames(3);

      await graphPO.hover(200, 150);
      await graphPO.waitForFrames(3);

      const state = await graphPO.getHoveredState();
      expect(state["block-1"]).toBe(false);
    });

    test("only hovered block area has hovered=true", async () => {
      await graphPO.hover(120, 120);
      await graphPO.waitForFrames(3);

      let state = await graphPO.getHoveredState();
      expect(state["block-1"]).toBe(true);
      expect(state["block-2"]).toBe(false);

      await graphPO.hover(420, 120);
      await graphPO.waitForFrames(3);

      state = await graphPO.getHoveredState();
      expect(state["block-1"]).toBe(false);
      expect(state["block-2"]).toBe(true);
    });
  });

  test.describe("area removal on conditional re-render", () => {
    let graphPO: EventedAreaPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new EventedAreaPageObject(page);
      await graphPO.initialize({
        blocks: [makeBlock("toggle-block", "ToggleAreaBlock", 100, 100)],
        connections: [],
      });
      await page.mouse.move(1, 1);
      await graphPO.waitForFrames(3);
      await graphPO.resetEventLog();
    });

    test("click stops working after area is removed", async () => {
      await graphPO.click(120, 120);
      let events = await graphPO.getEventCounts();
      expect(events.toggleClick).toBe(1);

      await graphPO.setAreaEnabled(false);
      await graphPO.forceRender("toggle-block");

      await graphPO.click(120, 120);
      events = await graphPO.getEventCounts();
      expect(events.toggleClick).toBe(1);
    });

    test("hover state resets after area is removed and re-enabled", async () => {
      await graphPO.hover(120, 120);
      await graphPO.waitForFrames(3);
      expect(await graphPO.getToggleHovered()).toBe(true);

      await graphPO.setAreaEnabled(false);
      await graphPO.forceRender("toggle-block");

      await graphPO.setAreaEnabled(true);
      await graphPO.forceRender("toggle-block");

      expect(await graphPO.getToggleHovered()).toBe(false);
    });

    test("mouseleave fires when hovered area disappears on re-render", async () => {
      await graphPO.hover(120, 120);
      await graphPO.waitForFrames(3);
      await graphPO.resetEventLog();

      await graphPO.setAreaEnabled(false);
      await graphPO.forceRender("toggle-block");

      const log = await graphPO.getEventLog();
      expect(log).toEqual([{ type: "area:mouseleave", block: "toggle-block" }]);
    });

    test("area works again after being re-enabled", async () => {
      await graphPO.setAreaEnabled(false);
      await graphPO.forceRender("toggle-block");

      await graphPO.click(120, 120);
      let events = await graphPO.getEventCounts();
      expect(events.toggleClick).toBeUndefined();

      await graphPO.setAreaEnabled(true);
      await graphPO.forceRender("toggle-block");

      await graphPO.click(120, 120);
      events = await graphPO.getEventCounts();
      expect(events.toggleClick).toBe(1);
    });
  });
});
