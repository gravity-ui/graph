import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { Block } from "../blocks/Block";

class CustomBlock extends Block {
  public sourceValue = 0;
  public snapshot = 0;
  public painted: number[] = [];
  public allowPaint = true;
  public prepareGeometry?: () => void;

  public override isVisible(): boolean {
    return super.isVisible();
  }

  protected override willIterate(): void {
    // Consumers defer external-store snapshots until the block is visible again.
    if (this.isVisible()) this.snapshot = this.sourceValue;
    super.willIterate();
    if (!this.allowPaint) this.shouldRender = false;
    this.prepareGeometry?.();
  }

  protected override render(): void {
    this.painted.push(this.snapshot);
    super.render();
  }
}

class InitiallySuppressedBlock extends CustomBlock {
  protected override willMount(): void {
    super.willMount();
    this.shouldRender = false;
  }
}

describe.each([true, false])("custom lifecycle with traversal culling %s", (enabled) => {
  let graph: Graph;
  let block: CustomBlock;

  const frame = () => globalScheduler.performUpdate();
  const lookAt = (x: number) => graph.cameraService.set({ x: -x, y: 0, scale: 1 });

  beforeEach(() => {
    graph = new Graph(
      {
        settings: {
          blockComponents: { custom: CustomBlock, suppressed: InitiallySuppressedBlock },
          EXP_VISIBILITY_CULLING: enabled,
        },
      },
      document.createElement("div")
    );
    graph.setEntities({
      blocks: [{ id: "custom", is: "custom", name: "custom", x: 100, y: 100, width: 100, height: 100, anchors: [] }],
      connections: [],
    });
    graph.start();
    frame();
    frame();
    graph.cameraService.resize({ width: 1000, height: 800 });
    lookAt(0);
    frame();
    frame();
    const view = graph.rootStore.blocksList.getBlockState("custom")?.getViewComponent();
    if (!(view instanceof CustomBlock)) throw new Error("Custom block was not mounted");
    block = view;
    block.painted.length = 0;
  });

  afterEach(() => graph.unmount());

  it("refreshes a deferred snapshot before the first paint after returning to the viewport", () => {
    lookAt(5000);
    frame();
    block.sourceValue = 7;
    block.performRender();
    frame();
    expect(block.snapshot).toBe(0);
    expect(block.painted).toEqual([]);

    lookAt(0);
    frame();
    expect(block.snapshot).toBe(7);
    expect(block.painted).toEqual([7]);
  });

  it("reads current visibility between frames without waiting for the next tree traversal", () => {
    lookAt(5000);
    expect(block.isVisible()).toBe(false);
    frame();
    lookAt(0);
    expect(block.isVisible()).toBe(true);
    block.setHitBox(6000, 100, 6100, 200);
    expect(block.isVisible()).toBe(false);
  });

  it("honors a custom willIterate paint veto and lets the component resume later", () => {
    block.allowPaint = false;
    block.performRender();
    frame();
    expect(block.painted).toEqual([]);
    expect(block.isRendered()).toBe(false);

    block.allowPaint = true;
    block.performRender();
    frame();
    expect(block.painted).toEqual([0]);
    expect(block.isRendered()).toBe(true);
  });

  it("uses geometry finalized during preparation for the same frame's paint gate", () => {
    block.setHitBox(6000, 100, 6100, 200);
    block.performRender();
    frame();
    expect(block.painted).toEqual([]);

    block.prepareGeometry = () => block.setHitBox(100, 100, 200, 200);
    block.performRender();
    frame();
    expect(block.painted).toEqual([0]);

    block.prepareGeometry = () => block.setHitBox(6000, 100, 6100, 200);
    block.performRender();
    frame();
    expect(block.painted).toEqual([0]);
  });

  it("keeps render delegation effective and resumes canvas paint after it is removed", () => {
    block.setRenderDelegated(true);
    frame();
    expect(block.painted).toEqual([]);
    expect(block.isVisible()).toBe(false);

    block.setRenderDelegated(false);
    frame();
    expect(block.painted).toEqual([0]);
  });

  it("preserves a first-frame paint veto from willMount", () => {
    graph.setEntities({
      blocks: [{ id: "new", is: "suppressed", name: "new", x: 100, y: 100, width: 100, height: 100, anchors: [] }],
      connections: [],
    });
    frame();
    const view = graph.rootStore.blocksList.getBlockState("new")?.getViewComponent();
    if (!(view instanceof InitiallySuppressedBlock)) throw new Error("New block was not mounted");
    expect(view.painted).toEqual([]);
    view.performRender();
    frame();
    expect(view.painted).toEqual([0]);
  });
});
