import type { ChildDescriptor, TBlock, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";
import { expect, test } from "@playwright/test";

import { GraphConfig, GraphPageObject } from "../page-objects/GraphPageObject";

type TChildWindow = { __childLog: string[]; __nativeLog: string[] };
type TButtonProps = TGraphComponentProps & { id: string; width: number; stop: boolean };

/** Blocks with a child scene component: a run button at the top right, drawn on the schematic and detailed levels. */
class SceneChildrenPageObject extends GraphPageObject {
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!(rootEl instanceof HTMLDivElement)) throw new Error("Root element not found");
      const { CanvasBlock, Graph, SceneComponent, pointerTargetAfter } = window.GraphModule;
      const w = window as unknown as TChildWindow;
      w.__childLog = [];
      w.__nativeLog = [];

      const kindOf = (target: unknown): string => {
        if (target instanceof RunButton) return "button";
        return target instanceof CanvasBlock ? "block" : "none";
      };

      /** The events a run button and its block log. */
      const gestures = ["press", "release", "click", "dblclick"] as const;
      const hoverEvents = ["pointerenter", "pointerleave"] as const;

      /**
       * A 40 x 30 button 8 units in from the block's top right; `stop` stops its clicks there, not its presses. It
       * tags itself while it is the target.
       */
      class RunButton extends SceneComponent<TButtonProps> {
        public static override entityType = "runButton";

        public override readonly cursor = "pointer";

        protected override willMount(): void {
          super.willMount();
          for (const type of gestures) {
            this.on(type, (gesture) => {
              w.__childLog.push(`button:${type}:${this.props.id}:${kindOf(gesture.target)}`);
              if (type === "click" && this.props.stop) gesture.stopPropagation();
            });
          }
          for (const type of hoverEvents) {
            this.addEventListener(type, (event) => {
              w.__childLog.push(`button:${type}:${this.props.id}:${kindOf(event.target)}`);
              this.setHoveredTag(pointerTargetAfter(event) === this);
            });
          }
        }

        public override getEntityId(): string {
          return this.props.id;
        }

        protected override minimalistic(): readonly TScenePrimitive[] {
          return [];
        }

        protected override schematic(): readonly TScenePrimitive[] {
          // Filled, so the visible button is its hit region.
          return [
            { kind: "rect", part: "button", x: this.props.width - 48, y: 8, width: 40, height: 30, fill: "#2f6fdf" },
          ];
        }
      }

      class ButtonBlock extends CanvasBlock {
        protected override willMount(): void {
          super.willMount();
          for (const type of gestures) {
            this.on(type, (gesture) => {
              w.__childLog.push(`block:${type}:${this.props.id}:${kindOf(gesture.target)}`);
              w.__nativeLog.push(`${type}:${gesture.event.type}:${gesture.event.pointerType}`);
            });
          }
          for (const type of hoverEvents) {
            this.addEventListener(type, (event) => {
              w.__childLog.push(`block:${type}:${this.props.id}:${kindOf(event.target)}`);
            });
          }
        }

        protected override stateChanged(next: typeof this.state): void {
          super.stateChanged(next);
          if (next.width !== this.state.width) this.shouldUpdateChildren = true;
        }

        protected override updateChildren(): ChildDescriptor[] {
          const id = String(this.props.id);
          return [
            RunButton.create({ id, width: this.state.width, stop: id === "block-2" }, { key: "run" }),
            ...super.updateChildren(),
          ];
        }
      }

      const graph = new Graph({ ...cfg, settings: { ...cfg.settings, blockComponents: { ButtonBlock } } }, rootEl);
      if (cfg.blocks || cfg.connections) graph.setEntities({ blocks: cfg.blocks, connections: cfg.connections });
      graph.start();
      graph.zoomTo("center");
      window.graph = graph;
      window.graphInitialized = true;
    }, config);
  }

  public async log(): Promise<string[]> {
    return this.page.evaluate(() => [...(window as unknown as TChildWindow).__childLog]);
  }

  /** Each gesture and the physical pointer sample it carries. */
  public async nativeLog(): Promise<string[]> {
    return this.page.evaluate(() => [...(window as unknown as TChildWindow).__nativeLog]);
  }

  public async resetLog(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as TChildWindow;
      w.__childLog = [];
      w.__nativeLog = [];
    });
  }

  public async hovered(type: string, id: string): Promise<boolean> {
    return this.page.evaluate(
      ({ entityType, entityId }) => {
        const { hoveredTag } = window.GraphModule;
        return window.graph.scene.tags.peekOf(entityType, entityId).has(hoveredTag);
      },
      { entityType: type, entityId: id }
    );
  }

  public async rootCursor(): Promise<string> {
    return this.page.evaluate(() => document.getElementById("root")?.style.cursor ?? "");
  }
}

const makeBlock = (id: string, x: number): TBlock => ({
  id,
  is: "ButtonBlock",
  x,
  y: 100,
  width: 200,
  height: 100,
  name: id,
  anchors: [],
});

type TWorldPoint = { x: number; y: number };

/** The button of a block at x: world x + 152..192, y 108..138. */
const button = (x: number): TWorldPoint => ({ x: x + 172, y: 123 });
const body = (x: number): TWorldPoint => ({ x: x + 60, y: 170 });

/** The press, release, click and dblclick entries of a log. */
const pointerEntries = (log: string[]): string[] =>
  log.filter((entry) => /:(press|release|click|dblclick):/.test(entry));

test.describe("child scene components", () => {
  let po: SceneChildrenPageObject;

  test.beforeEach(async ({ page }) => {
    po = new SceneChildrenPageObject(page);
    await po.initialize({
      blocks: [makeBlock("block-1", 100), makeBlock("block-2", 400)],
      connections: [],
      settings: { canDragCamera: false, canDrag: "none" },
    });
    await po.camera().zoomToScale(0.5);
    await page.mouse.move(1, 1);
    await po.waitForFrames(3);
    await po.resetLog();
  });

  test("a press, release and click on the button bubble to its block with the button as target", async () => {
    await po.clickAt(button(100));
    await po.clickAt(body(100));
    // The button's handler first, then the block's through bubbling, which reads the button as the target; then the
    // body's events, whose target is the block.
    expect(pointerEntries(await po.log())).toEqual([
      "button:press:block-1:button",
      "block:press:block-1:button",
      "button:release:block-1:button",
      "block:release:block-1:button",
      "button:click:block-1:button",
      "block:click:block-1:button",
      "block:press:block-1:block",
      "block:release:block-1:block",
      "block:click:block-1:block",
    ]);
    // Release and activation carry the same physical pointerup sample.
    expect(await po.nativeLog()).toEqual([
      "press:pointerdown:mouse",
      "release:pointerup:mouse",
      "click:pointerup:mouse",
      "press:pointerdown:mouse",
      "release:pointerup:mouse",
      "click:pointerup:mouse",
    ]);
  });

  for (const veto of [false, true]) {
    test(`delivers a mouse press before camera pan (veto: ${veto})`, async () => {
      await po.evaluate((graph) => graph.updateSettings({ canDragCamera: true, dragThreshold: 0 }));
      const from = button(100);
      const trace = await po.events.traceChildPress(from);
      if (veto)
        await po.evaluate((graph) => {
          graph.on("press", ({ preventDefault }) => preventDefault());
        });
      const camera = await po.camera().getState();
      const block = await po.block("block-1").getGeometry();
      await po.drag(from, { x: from.x + 80, y: from.y + 40 });
      expect(await trace()).toEqual(["capture:mouse", "child:mouse", "block:mouse", "graph:mouse"]);
      const after = await po.camera().getState();
      expect(after.x - camera.x).toBe(veto ? 0 : 40);
      expect(after.y - camera.y).toBe(veto ? 0 : 20);
      expect(await po.block("block-1").getGeometry()).toEqual(block);
    });
  }

  test("resolves a child drag claim after graph listeners and delivers its first move from the press", async ({
    page,
  }) => {
    const from = button(100);
    const entries = await page.evaluateHandle((world) => {
      const graph = window.graph;
      const child = graph.getElementOverPoint(world);
      if (!(child instanceof window.GraphModule.SceneComponent)) throw new Error("Missing button");
      const log: string[] = [];
      graph.updateSettings({ canDragCamera: true, dragThreshold: 5 });
      child.on("dragstart", (gesture) => {
        if (gesture.target !== child || gesture.currentTarget !== child) throw new Error("Wrong drag target");
        log.push("child");
        gesture.claim({
          owner: "run button",
          start: (event, coords) => {
            if (coords[0] !== gesture.start.world.x || coords[1] !== gesture.start.world.y)
              throw new Error("Wrong origin");
            log.push(`start:${event.type}`);
          },
          move: (event) => log.push(event.type),
          end: (event) => log.push(event.type),
        });
      });
      graph.on("dragstart", (event) => {
        log.push("graph");
        event.claim({ owner: "withdrawn", start: () => log.push("withdrawn") })();
        event.preventDefault();
      });
      return log;
    }, from);
    const camera = await po.camera().getState();
    await po.drag(from, { x: from.x + 80, y: from.y + 40 });
    const log = await entries.jsonValue();
    await entries.dispose();
    expect(log.slice(0, 4)).toEqual(["child", "graph", "start:pointermove", "pointermove"]);
    expect(log.at(-1)).toBe("pointerup");
    expect(log.filter((entry) => entry.startsWith("start:"))).toHaveLength(1);
    expect(log).not.toContain("withdrawn");
    expect(await po.camera().getState()).toEqual(camera);
  });

  test("autopanning updates a drag owner while its mouse stays at the viewport edge", async ({ page }) => {
    const updates = await page.evaluateHandle(() => {
      const points: { client: number; world: number; cause: string }[] = [];
      window.graph.on("dragstart", (event) => {
        event.claim({
          owner: "edge drag",
          move: (move, [x], cause) => points.push({ client: move.clientX, world: x, cause }),
        });
      });
      return points;
    });
    await po.hoverAt(button(100));
    await page.mouse.down();
    const edge = await po.evaluate((graph) => {
      const rect = graph.getGraphCanvas().getBoundingClientRect();
      return { x: rect.right - 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(edge.x, edge.y);
    await expect.poll(() => updates.evaluate((points) => new Set(points.map((p) => p.world)).size)).toBeGreaterThan(1);
    await page.mouse.up();
    const points = await updates.jsonValue();
    await updates.dispose();
    expect(points.every((p) => p.client === edge.x)).toBe(true);
    expect(points[0].cause).toBe("pointer");
    expect(points.slice(1).every((p) => p.cause === "scene")).toBe(true);
    expect(await po.evaluate((graph) => graph.cameraService.getCameraState().autoPanningEnabled)).toBe(false);
  });

  test("a dblclick on the button reaches its block with the button as target", async () => {
    await po.doubleClickAt(button(100));
    expect((await po.log()).filter((entry) => entry.includes(":dblclick:"))).toEqual([
      "button:dblclick:block-1:button",
      "block:dblclick:block-1:button",
    ]);
  });

  test("a button that stops its click keeps it from its block", async () => {
    await po.clickAt(button(400));
    // Its press and release still bubble up; the click stays with the button.
    expect(pointerEntries(await po.log())).toEqual([
      "button:press:block-2:button",
      "block:press:block-2:button",
      "button:release:block-2:button",
      "block:release:block-2:button",
      "button:click:block-2:button",
    ]);
  });

  // This body point is 14 CSS pixels from the button center at scale 0.5, within a slow hover transition.
  const bodyBesideButton = { x: 244, y: 123 };

  test("hover events bubble from the button to its block, keeping the original target", async () => {
    await po.hoverAt(bodyBesideButton);
    await expect.poll(() => po.log()).toEqual(["block:pointerenter:block-1:block"]);
    await po.resetLog();
    await po.hoverAt(button(100));
    // The block's own leave (its relatedTarget is the button), then the button's enter, bubbling up to the block.
    await expect.poll(() => po.log()).toEqual([
      "block:pointerleave:block-1:block",
      "button:pointerenter:block-1:button",
      "block:pointerenter:block-1:button",
    ]);
    await po.resetLog();
    await po.hoverAt(bodyBesideButton);
    await expect.poll(() => po.log()).toEqual([
      "button:pointerleave:block-1:button",
      "block:pointerleave:block-1:button",
      "block:pointerenter:block-1:block",
    ]);
    await po.hoverAt(button(100));
    await expect.poll(() => po.hovered("runButton", "block-1")).toBe(true);
    await po.resetLog();
    await po.hoverAt({ x: 900, y: 600 });
    await expect.poll(() => po.log()).toEqual(["button:pointerleave:block-1:button", "block:pointerleave:block-1:button"]);
  });

  test("the block stays tagged over its button, the button while it is the target; the cursor follows it", async () => {
    await po.hoverAt(button(100));
    await expect.poll(() => po.hovered("runButton", "block-1")).toBe(true);
    expect(await po.hovered("block", "block-1")).toBe(true);
    await expect.poll(() => po.rootCursor()).toBe("pointer");
    await po.hoverAt(bodyBesideButton);
    await expect.poll(() => po.hovered("runButton", "block-1")).toBe(false);
    expect(await po.hovered("block", "block-1")).toBe(true);
  });

  test("the button is not hit on the minimalistic level, where it draws nothing", async () => {
    await po.camera().zoomToScale(0.1);
    await po.waitForFrames(3);
    await po.resetLog();
    await po.clickAt(button(100));
    expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual(["block:click:block-1:block"]);
  });

  test.describe("a press on the button of a draggable block", () => {
    test.beforeEach(async () => {
      // The nearest draggable ancestor owns the default drag.
      await po.evaluate((graph) =>
        graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.ALL, canDragCamera: true })
      );
      await po.waitForFrames(2);
    });

    test("a press-drag from the button drags its block, and the camera stays", async () => {
      // Threshold 0, as in drag-and-drop.spec: the drag starts where the press was, so the block follows the pointer
      // by the whole move.
      await po.evaluate((graph) => graph.updateSettings({ dragThreshold: 0 }));
      const camera = await po.camera().getState();
      const before = await po.block("block-1").getGeometry();
      const other = await po.block("block-2").getGeometry();
      const from = button(100);
      const trace = await po.events.traceChildPress(from);
      await po.drag(from, { x: from.x + 80, y: from.y + 40 });
      expect(await trace()).toEqual(["capture:mouse", "child:mouse", "block:mouse", "graph:mouse"]);
      const after = await po.block("block-1").getGeometry();
      // 80 x 40 world units, give or take the rounding of the pointer's screen position at scale 0.5.
      expect(Math.abs(after.x - before.x - 80)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.y - before.y - 40)).toBeLessThanOrEqual(2);
      expect(await po.block("block-2").getGeometry()).toEqual(other);
      expect(await po.camera().getState()).toEqual(camera);
      expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual([]);
    });

    test("a click on the button still reaches the button and its block, with the button as target", async () => {
      const camera = await po.camera().getState();
      const before = await po.block("block-1").getGeometry();
      await po.clickAt(button(100));
      expect(pointerEntries(await po.log())).toEqual([
        "button:press:block-1:button",
        "block:press:block-1:button",
        "button:release:block-1:button",
        "block:release:block-1:button",
        "button:click:block-1:button",
        "block:click:block-1:button",
      ]);
      expect(await po.block("block-1").getGeometry()).toEqual(before);
      expect(await po.camera().getState()).toEqual(camera);
    });
  });
});
