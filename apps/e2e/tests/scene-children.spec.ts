import type { ChildDescriptor, TBlock, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";
import { expect, test } from "@playwright/test";

import { GraphConfig, GraphPageObject } from "../page-objects/GraphPageObject";

type TChildWindow = { __childLog: string[]; __nativeLog: string[] };
type TButtonProps = TGraphComponentProps & { id: string; stop: boolean };

/** Blocks with a child scene component: a run button at the top right, drawn on the schematic and detailed levels. */
class SceneChildrenPageObject extends GraphPageObject {
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!(rootEl instanceof HTMLDivElement)) throw new Error("Root element not found");
      const { CanvasBlock, Graph, SceneComponent, getEventTarget, pointerTargetAfter } = window.GraphModule;
      const w = window as unknown as TChildWindow;
      w.__childLog = [];
      w.__nativeLog = [];

      /** What an event hit, for the logs, read from the event itself in each handler (`getEventTarget`, D5). */
      const kindOf = (event: Event): string => {
        const target = getEventTarget(event);
        if (target instanceof RunButton) return "button";
        return target instanceof CanvasBlock ? "block" : "none";
      };

      /** The events a run button and its block log. */
      const LOGGED = ["mousedown", "mouseup", "click", "dblclick", "mouseenter", "mouseleave"] as const;

      /**
       * A 40 x 30 button 8 units in from the block's top right; `stop` stops its clicks there, not its presses. It
       * tags itself while it is the target (the recipe for a child, D5).
       */
      class RunButton extends SceneComponent<{ width: number }, TButtonProps> {
        public static override entityType = "runButton";

        public override readonly cursor = "pointer";

        protected override willMount(): void {
          super.willMount();
          for (const type of LOGGED) {
            this.addEventListener(type, (event: Event) => {
              w.__childLog.push(`button:${type}:${this.props.id}:${kindOf(event)}`);
              if (type === "click" && this.props.stop) event.stopPropagation();
              if (type === "mouseenter" || type === "mouseleave") {
                this.setHoveredTag(pointerTargetAfter(event) === this);
              }
            });
          }
        }

        public override getEntityId(): string {
          return this.props.id;
        }

        protected override getViewData(): { width: number } {
          const block = this.getParent();
          const view = block instanceof SceneComponent ? block.readSceneView() : undefined;
          return { width: (view as { width?: number } | undefined)?.width ?? 200 };
        }

        protected override minimalistic(): readonly TScenePrimitive[] {
          return [];
        }

        protected override schematic(view: { width: number }): readonly TScenePrimitive[] {
          // Filled, so the visible button is its hit region.
          return [{ kind: "rect", part: "button", x: view.width - 48, y: 8, width: 40, height: 30, fill: "#2f6fdf" }];
        }
      }

      class ButtonBlock extends CanvasBlock {
        protected override willMount(): void {
          super.willMount();
          for (const type of LOGGED) {
            this.addEventListener(type, (event: Event) => {
              w.__childLog.push(`block:${type}:${this.props.id}:${kindOf(event)}`);
              // The block's handler gets the browser's event: a MouseEvent with the click count in `detail`.
              if (type === "mousedown" || type === "mouseup" || type === "click") {
                w.__nativeLog.push(`${type}:${event instanceof MouseEvent ? event.detail : "not a MouseEvent"}`);
              }
            });
          }
        }

        protected override updateChildren(): ChildDescriptor[] {
          const id = String(this.props.id);
          return [RunButton.create({ id, stop: id === "block-2" }, { key: "run" }), ...super.updateChildren()];
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

  /** The block handlers' press, release and click events, as `type:detail` (the click count). */
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
  log.filter((entry) => /:(mousedown|mouseup|click|dblclick):/.test(entry));

test.describe("child scene components", () => {
  let po: SceneChildrenPageObject;

  test.beforeEach(async ({ page }) => {
    po = new SceneChildrenPageObject(page);
    // Presses must reach the components, and GraphLayer gives a taken press to no component (as before this plan).
    // - The camera's drag is off: the camera's pan takes a press when nothing in the pressed chain is draggable.
    // - The blocks' drag is off (`canDrag: "none"`, the default, set here on purpose): a press on the button of a
    //   draggable block is the block's drag (D8), which takes the press. The D8 tests below turn both drags on.
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
      "button:mousedown:block-1:button",
      "block:mousedown:block-1:button",
      "button:mouseup:block-1:button",
      "block:mouseup:block-1:button",
      "button:click:block-1:button",
      "block:click:block-1:button",
      "block:mousedown:block-1:block",
      "block:mouseup:block-1:block",
      "block:click:block-1:block",
    ]);
    // The block's handlers got the browser's events: MouseEvents with the click count in their detail.
    expect(await po.nativeLog()).toEqual([
      "mousedown:1",
      "mouseup:1",
      "click:1",
      "mousedown:1",
      "mouseup:1",
      "click:1",
    ]);
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
      "button:mousedown:block-2:button",
      "block:mousedown:block-2:button",
      "button:mouseup:block-2:button",
      "block:mouseup:block-2:button",
      "button:click:block-2:button",
    ]);
  });

  test("hover events bubble from the button to its block, with the target in their detail (D5)", async () => {
    await po.hoverAt(body(100));
    expect(await po.log()).toEqual(["block:mouseenter:block-1:block"]);
    await po.resetLog();
    await po.hoverAt(button(100));
    // The block's own leave (its relatedTarget is the button), then the button's enter, bubbling up to the block.
    expect(await po.log()).toEqual([
      "block:mouseleave:block-1:block",
      "button:mouseenter:block-1:button",
      "block:mouseenter:block-1:button",
    ]);
    await po.resetLog();
    await po.hoverAt(body(100));
    expect(await po.log()).toEqual([
      "button:mouseleave:block-1:button",
      "block:mouseleave:block-1:button",
      "block:mouseenter:block-1:block",
    ]);
    await po.hoverAt(button(100));
    await po.resetLog();
    await po.hoverAt({ x: 900, y: 600 });
    expect(await po.log()).toEqual(["button:mouseleave:block-1:button", "block:mouseleave:block-1:button"]);
  });

  test("the block stays tagged over its button, the button while it is the target; the cursor follows it", async () => {
    await po.hoverAt(button(100));
    await po.waitForFrames(2);
    expect(await po.hovered("runButton", "block-1")).toBe(true);
    expect(await po.hovered("block", "block-1")).toBe(true);
    await expect.poll(() => po.rootCursor()).toBe("pointer");
    await po.hoverAt(body(100));
    await po.waitForFrames(2);
    expect(await po.hovered("runButton", "block-1")).toBe(false);
    expect(await po.hovered("block", "block-1")).toBe(true);
  });

  test("the button is not hit on the minimalistic level, where it draws nothing", async () => {
    await po.camera().zoomToScale(0.1);
    await po.waitForFrames(3);
    await po.resetLog();
    await po.clickAt(button(100));
    expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual(["block:click:block-1:block"]);
  });

  test.describe("a press on the button of a draggable block (D8)", () => {
    test.beforeEach(async () => {
      // Both drags on: the block's (it is draggable) and the camera's, which a press on the button took before D8.
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
      await po.drag(from, { x: from.x + 80, y: from.y + 40 });
      const after = await po.block("block-1").getGeometry();
      // 80 x 40 world units, give or take the rounding of the pointer's screen position at scale 0.5.
      expect(Math.abs(after.x - before.x - 80)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.y - before.y - 40)).toBeLessThanOrEqual(2);
      expect(await po.block("block-2").getGeometry()).toEqual(other);
      expect(await po.camera().getState()).toEqual(camera);
      // The block's drag took the press, which reached no component; a drag ends in no click.
      expect((await po.log()).filter((entry) => /:(mousedown|click):/.test(entry))).toEqual([]);
    });

    test("a click on the button still reaches the button and its block, with the button as target", async () => {
      const camera = await po.camera().getState();
      const before = await po.block("block-1").getGeometry();
      await po.clickAt(button(100));
      // The press is the block's drag, so it reaches no component (as a press on a draggable block's body); the
      // release and the click reach the button and bubble to its block.
      expect(pointerEntries(await po.log())).toEqual([
        "button:mouseup:block-1:button",
        "block:mouseup:block-1:button",
        "button:click:block-1:button",
        "block:click:block-1:button",
      ]);
      expect(await po.block("block-1").getGeometry()).toEqual(before);
      expect(await po.camera().getState()).toEqual(camera);
    });
  });
});
