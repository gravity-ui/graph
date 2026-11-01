import { Graph } from "../../graph";
import { globalScheduler } from "../../lib/Scheduler";

import { Block } from "./blocks/Block";

function frames(): void {
  for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
}

type TBlockComponents = NonNullable<NonNullable<ConstructorParameters<typeof Graph>[0]>["settings"]>["blockComponents"];

function mount(blockComponents: TBlockComponents, x: number): { graph: Graph; block: () => Block } {
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      blocks: [{ id: "b", is: "custom", name: "b", x, y: 100, width: 100, height: 50, selected: false, anchors: [] }],
      settings: { blockComponents },
    },
    container
  );
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  frames();
  return {
    graph,
    block: () => {
      const view = graph.blocks.getBlockState("b")?.getViewComponent();
      if (!(view instanceof Block)) throw new Error("Missing block view");
      return view;
    },
  };
}

describe("extension contract for custom components", () => {
  it("vetoes painting through isRenderAllowed()", () => {
    class Vetoed extends Block {
      public allowed = false;
      public paints = 0;
      protected override isRenderAllowed(): boolean {
        return this.allowed && super.isRenderAllowed();
      }
      protected override renderBody(ctx: CanvasRenderingContext2D): void {
        this.paints++;
        super.renderBody(ctx);
      }
    }
    const { graph, block } = mount({ custom: Vetoed }, 100);
    const view = block() as Vetoed;
    expect(view.paints).toBe(0);
    view.allowed = true;
    view.performRender();
    frames();
    expect(view.paints).toBeGreaterThan(0);
    graph.unmount();
  });

  it("keeps culling for an iterate() override that forwards the tree's arguments", () => {
    class Logged extends Block {
      public iterations = 0;
      public paints = 0;
      public override iterate(prepared?: boolean, visible?: boolean): boolean {
        this.iterations++;
        return super.iterate(prepared, visible);
      }
      protected override renderBody(ctx: CanvasRenderingContext2D): void {
        this.paints++;
        super.renderBody(ctx);
      }
    }
    // Outside the viewport, with pending work: the tree prepares and completes it without painting.
    const { graph, block } = mount({ custom: Logged }, 5000);
    const view = block() as Logged;
    view.paints = view.iterations = 0;
    view.performRender();
    frames();
    expect(view.iterations).toBeGreaterThan(0);
    expect(view.paints).toBe(0);
    graph.unmount();
  });
});
