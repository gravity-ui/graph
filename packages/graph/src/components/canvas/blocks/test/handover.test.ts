import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { entityKey } from "../../../../services/tags/TagStore";
import { hoveredTag } from "../../../../services/tags/builtinTags";
import { anchorEntityId } from "../../../../store/anchor/anchorEntityId";
import { Block } from "../Block";
import type { TBlock } from "../Block";
import { LegacyCanvasBlock } from "../LegacyCanvasBlock";

const block = (id: string, x: number, is = "Block"): TBlock => ({
  id,
  is,
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors: [{ id: "out", blockId: id, type: "OUT" }],
});

/** One graph frame: layers, the scene and the frame-end listeners. */
function frame(): void {
  globalScheduler.performUpdate();
}

describe("the handover to HTML (delegateRender)", () => {
  let graph: Graph;
  let root: HTMLDivElement;
  const view = (id: string): Block => {
    const component = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!component) throw new Error(`no view for ${id}`);
    return component;
  };
  const element = (id: string): ReturnType<Graph["scene"]["store"]["get"]> =>
    graph.scene.store.get(entityKey("block", id));
  const at = (scale: number): void => graph.cameraService.set({ x: 0, y: 0, scale });

  beforeEach(() => {
    root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents: { Legacy: LegacyCanvasBlock } } }, root);
    graph.start();
    at(1);
    graph.setEntities({ blocks: [block("a", 100), block("legacy", 400, "Legacy")], connections: [] });
    for (let i = 0; i < 5; i++) frame();
  });

  afterEach(() => graph.unmount());

  it("hides a block an HTML view holds at the detailed level, with its anchors, and keeps its hit box", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    expect(element("a")?.hidden).toBe(true);
    const [anchor] = graph.scene.store.childrenOf(entityKey("block", "a"));
    expect(anchor !== undefined && graph.scene.store.isDrawnHidden(anchor)).toBe(true);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated(), view("a").isShownOutsideScene()]).toEqual([
      true,
      true,
      true,
    ]);
    // `hidden` is no longer the handover's flag.
    expect((view("a") as unknown as { hidden: boolean }).hidden).toBe(false);
    expect(graph.getElementOverPoint({ x: 150, y: 150 })).toBe(view("a"));
    release();
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect((view("a") as unknown as { htmlViews?: unknown }).htmlViews).toBeUndefined();
  });

  it("draws it in the first frame after the level leaves detailed, and hides it when the level returns", () => {
    view("a").delegateRender({ canvasVisible: false });
    frame();
    at(0.5);
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated()]).toEqual([false, false]);
    at(1);
    frame();
    expect(element("a")?.hidden).toBe(true);
  });

  it("keeps drawing while the views ask for canvasVisible, and hides it while any view does not", () => {
    const visible = view("a").delegateRender({ canvasVisible: true });
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated()]).toEqual([true, false]);
    const hidden = view("a").delegateRender({ canvasVisible: false });
    frame();
    expect(element("a")?.hidden).toBe(true);
    hidden();
    frame();
    expect(element("a")?.hidden).toBe(false);
    visible();
  });

  it("stays handed over while any view holds it; a release runs once", () => {
    const first = view("a").delegateRender({ canvasVisible: false });
    const second = view("a").delegateRender({ canvasVisible: false });
    first();
    first();
    frame();
    expect(element("a")?.hidden).toBe(true);
    second();
    frame();
    expect(element("a")?.hidden).toBe(false);
  });

  it("keeps the low-level setRenderDelegated switch, without the level rule", () => {
    view("a").setRenderDelegated(true);
    at(0.5);
    frame();
    expect(element("a")?.hidden).toBe(true);
    expect([view("a").isRenderDelegated(), view("a").isHeldByHtml()]).toEqual([true, false]);
    view("a").setRenderDelegated(false);
    frame();
    expect(element("a")?.hidden).toBe(false);
  });

  it("updates the scene title while HTML draws the block", () => {
    view("a").delegateRender({ canvasVisible: false });
    frame();
    graph.api.updateBlock({ id: "a", name: "renamed" });
    frame();
    const texts = (element("a")?.primitives ?? []).flatMap((primitive) =>
      primitive.kind === "text" ? [primitive.text] : []
    );
    expect(texts).toContain("renamed");
  });

  it("does not paint a handed-over LegacyCanvasBlock on the GraphLayer canvas", () => {
    const legacy = view("legacy");
    const render = jest.spyOn(legacy as unknown as { render(): void }, "render");
    graph.getGraphLayer().performRender();
    frame();
    expect(render).toHaveBeenCalled();
    render.mockClear();
    legacy.delegateRender({ canvasVisible: false });
    graph.getGraphLayer().performRender();
    frame();
    expect(render).not.toHaveBeenCalled();
    expect(legacy.isRendered()).toBe(false);
  });

  it("emits the graph's click on the anchor when its HTML is clicked at the detailed level", () => {
    // The anchor's point: the OUT anchor of "a", at (300, 188); at scale 1 and the origin, world = client.
    const html = document.createElement("div");
    root.appendChild(html);
    const targets: unknown[] = [];
    const off = graph.on("click", (event) => {
      targets.push(event.detail.target);
    });
    const click = (): void => {
      for (const type of ["mousedown", "mouseup", "click"]) {
        html.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 300, clientY: 188 }));
      }
    };
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    click();
    // Without an HTML view nothing shows the anchor at the detailed level: the block is the target.
    expect(targets.length === 1 && targets[0] === view("a")).toBe(true);
    view("a").delegateRender({ canvasVisible: false });
    frame();
    click();
    expect(targets[1]).toBe(anchor);
    off();
  });

  it("registers a view that keeps the canvas drawn: the block is drawn and its anchors are hit", () => {
    const release = view("a").delegateRender({ canvasVisible: true });
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isShownOutsideScene()]).toEqual([true, true]);
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(anchor);
    release();
  });

  it("finds the target again when the hold is released during a drag, at the drag's release", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    if (!anchor) throw new Error("no anchor");
    const block = view("a");
    const nameOf = (target: unknown): string => {
      if (target === anchor) return "anchor";
      return target === block ? "block" : "none";
    };
    const log: string[] = [];
    const record =
      (who: string) =>
      (event: Event): void => {
        log.push(`${who}:${event.type}:${nameOf((event as CustomEvent<{ target?: unknown }>).detail?.target)}`);
      };
    anchor.addEventListener("mouseleave", record("anchor"));
    block.addEventListener("mouseenter", record("block"));
    block.addEventListener("mouseleave", record("block"));
    const tagged = (): boolean[] => [
      graph.scene.tags.peekOf("block", "a").has(hoveredTag),
      graph.scene.tags.peekOf("anchor", anchorEntityId("a", "out")).has(hoveredTag),
    ];
    const layer = graph.getGraphLayer();
    // Scale 1 at the origin: world = client. Entering the anchor straight from outside: its enter bubbles to the block.
    // No leave comes first: the first entry has no old side.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    expect(layer.$hoveredComponent.value).toBe(anchor);
    expect(log).toEqual(["block:mouseenter:anchor"]);
    expect(tagged()).toEqual([true, true]);
    log.splice(0);
    // A drag holds the capture (`dragListener.ts:166`) while the HTML view lets the block go.
    layer.handleEvent(new MouseEvent("mousedown", { clientX: 300, clientY: 188 }));
    layer.captureEvents(anchor);
    release();
    for (let i = 0; i < 3; i++) frame();
    expect(layer.$hoveredComponent.value).toBe(anchor);
    expect(log).toEqual([]);
    // The drag ends with no mousemove after it: the release finds the target again (`dragListener.ts:209`).
    layer.handleEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 188 }));
    layer.releaseCapture();
    for (let i = 0; i < 3; i++) frame();
    // Detailed without a view: the anchor is not shown, so not hit. The block stays tagged throughout (В1).
    expect(layer.$hoveredComponent.value).toBe(block);
    expect(log).toEqual(["anchor:mouseleave:anchor", "block:mouseleave:anchor", "block:mouseenter:block"]);
    expect(tagged()).toEqual([true, false]);
  });

  it("lets a held retarget wait until its last release (holdRetarget, while HTML views mount)", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    const layer = graph.getGraphLayer();
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    expect(layer.$hoveredComponent.value).toBe(anchor);
    const first = layer.holdRetarget();
    // The view lets the block go: at the detailed level the anchor is no longer shown, but the retarget waits.
    release();
    frame();
    // Taken a frame later, so a release, not its bound, ends it below.
    const second = layer.holdRetarget();
    frame();
    expect(layer.$hoveredComponent.value).toBe(anchor);
    first();
    first();
    frame();
    expect(layer.$hoveredComponent.value).toBe(anchor);
    second();
    frame();
    expect(layer.$hoveredComponent.value).toBe(view("a"));
  });

  it("bounds a retarget hold that is never released: its last frame's end releases it and serves the request", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    const layer = graph.getGraphLayer();
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    expect(layer.$hoveredComponent.value).toBe(anchor);
    const expired = jest.fn();
    layer.holdRetarget(expired);
    release();
    // RETARGET_HOLD_FRAMES = 3: the first two frame ends wait, the third releases the hold and retargets.
    frame();
    frame();
    expect([layer.$hoveredComponent.value === anchor, expired.mock.calls.length]).toEqual([true, 0]);
    frame();
    expect([layer.$hoveredComponent.value === view("a"), expired.mock.calls.length]).toEqual([true, 1]);
    for (let i = 0; i < 3; i++) frame();
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
