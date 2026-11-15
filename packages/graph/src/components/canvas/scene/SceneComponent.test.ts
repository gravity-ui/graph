import { Graph } from "../../../graph";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { entityKey } from "../../../services/tags/TagStore";
import type { TPoint } from "../../../utils/types/shapes";

import { SceneComponent, sceneComponentStats } from "./SceneComponent";
import type { TSceneParent } from "./SceneComponent";
import { Box, BoxDot, TestLayer, boxSource, frames } from "./sceneTestKit";
import type { TBoxProps, TBoxSource, TBoxView } from "./sceneTestKit";

describe("SceneComponent", () => {
  let graph: Graph;
  let layer: TestLayer;
  let source: TBoxSource;
  let box: Box;

  function mount(Kind: typeof Box = Box, extra: Partial<TBoxProps> = {}, siblings: ChildDescriptor[] = []): void {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    source = boxSource("Alpha", 10);
    const ref = (instance: Box): void => {
      box = instance;
    };
    layer = graph.addLayer(TestLayer, {
      children: [Kind.create({ id: "b1", source, ...extra }, { ref }), ...siblings],
    });
    frames();
  }

  const element = (): ReturnType<Graph["scene"]["store"]["get"]> => graph.scene.store.get(entityKey("box", "b1"));

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("writes one element from its level methods without being walked", () => {
    mount();
    const iterate = jest.spyOn(box, "iterate");
    frames();
    expect(element()?.x).toBe(10);
    expect(element()?.zIndex).toBe(200);
    expect(element()?.hidden).toBe(false);
    // minimalistic's body equals schematic's by value, so it is encoded once for every level.
    expect(element()?.primitives.map((p) => [p.kind, p.part, p.levelMask])).toEqual([
      ["rect", "body", undefined],
      ["text", "title", 6],
    ]);
    expect(iterate).not.toHaveBeenCalled();
    expect(box.getSceneKey()).toEqual({ elementId: entityKey("box", "b1"), sub: 0 });
  });

  it("moves without running the level methods again", () => {
    mount();
    const primitives = element()?.primitives;
    const runs = box.levelRuns;
    source.x.value = 40;
    frames();
    expect(element()?.x).toBe(40);
    expect(element()?.primitives).toBe(primitives);
    expect(box.levelRuns).toBe(runs);
  });

  it("runs the level methods again for new view data, not for an equal meta object", () => {
    mount();
    const runs = box.levelRuns;
    source.meta.value = { tone: "a" };
    frames();
    expect(box.levelRuns).toBe(runs);
    source.title.value = "Beta";
    frames();
    expect(box.levelRuns).toBe(runs + 1);
    expect(element()?.primitives.some((p) => p.kind === "text" && p.text === "Beta")).toBe(true);
  });

  it("runs the level methods in the frame, once for two unbatched writes", () => {
    mount();
    const runs = box.levelRuns;
    source.title.value = "One";
    source.title.value = "Two";
    expect(box.levelRuns).toBe(runs);
    frames();
    expect(box.levelRuns).toBe(runs + 1);
  });

  it("keeps the written primitives when the level methods return equal ones", () => {
    mount();
    const primitives = element()?.primitives;
    const runs = box.levelRuns;
    const update = jest.spyOn(graph.scene.store, "update");
    box.refresh();
    frames();
    expect(box.levelRuns).toBe(runs + 1);
    expect(element()?.primitives).toBe(primitives);
    expect(update).not.toHaveBeenCalled();
  });

  it("binds its element's style to its entity", () => {
    mount();
    expect(element()?.styleId).toBeGreaterThan(0);
    expect(graph.scene.explain("box", "b1").target).toBe("Box");
  });

  it("hides its element while render is delegated and keeps the hit box", () => {
    mount();
    box.setRenderDelegated(true);
    frames(5);
    expect(element()?.hidden).toBe(true);
    expect(box.isRendered()).toBe(false);
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(box);
  });

  it("writes child elements for child components after its own, hidden with it, deleted with it", () => {
    mount(Box, { dots: 2 });
    const parentId = entityKey("box", "b1");
    expect(graph.scene.store.childrenOf(parentId).map((child) => [child.id, child.childOrder, child.x])).toEqual([
      [entityKey("dot", "b1/0"), 0, 110],
      [entityKey("dot", "b1/1"), 1, 110],
    ]);
    const dot = graph.scene.store.get(entityKey("dot", "b1/0"));
    box.setRenderDelegated(true);
    frames();
    expect(dot && graph.scene.store.isDrawnHidden(dot)).toBe(true);
    layer.setProps({ children: [] });
    frames();
    expect(graph.scene.store.get(entityKey("dot", "b1/0"))).toBeUndefined();
  });

  it("writes the element and its children in the first frame and never re-encodes them at mount", () => {
    const adds: string[] = [];
    const reencodes: string[] = [];
    graph = new Graph({}, document.createElement("div"));
    graph.scene.store.subscribe((change) => {
      if (change.type === "add") adds.push(change.element.id);
      else if (change.fields?.has("primitives")) reencodes.push(change.element.id);
    });
    graph.start();
    layer = graph.addLayer(TestLayer, { children: [Box.create({ id: "b1", source: boxSource(), dots: 1 })] });
    frames(1);
    expect(adds).toEqual([entityKey("box", "b1"), entityKey("dot", "b1/0")]);
    frames(3);
    expect(reencodes).toEqual([]);
  });

  it("deletes its element and releases its style on unmount", () => {
    mount();
    layer.setProps({ children: [] });
    frames();
    expect(element()).toBeUndefined();
    expect(graph.scene.explain("box", "b1").target).toBeUndefined();
  });

  it("an immediate subclass is walked and still owns its element", () => {
    class WalkedBox extends Box {
      public static override readonly mode = "immediate";
      public paints = 0;
      protected override render(): void {
        this.paints++;
      }
    }
    mount(WalkedBox);
    // The jsdom root has no size: give the camera a 1000x800 viewport on the world origin (resize alone moves it).
    graph.cameraService.resize({ width: 1000, height: 800 });
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    box.performRender();
    frames();
    expect((box as WalkedBox).paints).toBeGreaterThan(0);
    expect(element()).toBeDefined();
  });

  it("an immediate subclass writes its element only after its trigger fires or its hidden state changes", () => {
    class WalkedBox extends Box {
      public static override readonly mode = "immediate";
    }
    const sync = jest.spyOn(Box.prototype as unknown as { syncSceneElement(): void }, "syncSceneElement");
    mount(WalkedBox);
    graph.cameraService.resize({ width: 1000, height: 800 });
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    frames();
    const iterate = jest.spyOn(box, "iterate");
    sync.mockClear();
    graph.getGraphLayer().performRender();
    box.performRender();
    frames();
    // Walked in every frame, written in none: nothing changed.
    expect(iterate).toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    source.x.value = 70;
    frames();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(element()?.x).toBe(70);
    // The hidden state is read in the update, not tracked: a change is written without the trigger.
    sync.mockClear();
    box.setRenderDelegated(true);
    frames();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(element()?.hidden).toBe(true);
    box.setRenderDelegated(false);
    frames();
    expect(element()?.hidden).toBe(false);
  });

  it("an immediate child writes a new parent, a new order, and its element again once the store lost it", () => {
    let dot: WalkedDot | undefined;
    class WalkedDot extends BoxDot {
      public static override readonly mode = "immediate";
      public parentId?: string;
      public order?: number;
      // Read in the update, not tracked: a change needs no trigger.
      protected override getSceneParent(): TSceneParent | undefined {
        const own = super.getSceneParent();
        return own && { elementId: this.parentId ?? own.elementId, order: this.order ?? own.order };
      }
    }
    class WalkedHost extends Box {
      public static override readonly mode = "immediate";
      protected override updateChildren(): ChildDescriptor[] {
        const ref = (instance: WalkedDot): void => {
          dot = instance;
        };
        return [WalkedDot.create({ id: `${this.props.id}/0`, index: 0 }, { key: "0", ref })];
      }
    }
    const sync = jest.spyOn(SceneComponent.prototype as unknown as { syncSceneElement(): void }, "syncSceneElement");
    const other = Box.create({ id: "b2", source: boxSource("Beta", 300) }, { key: "b2" });
    mount(WalkedHost, {}, [other]);
    graph.cameraService.resize({ width: 1000, height: 800 });
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    frames();
    const dotId = entityKey("dot", "b1/0");
    const stored = (): ReturnType<Graph["scene"]["store"]["get"]> => graph.scene.store.get(dotId);
    const dotSyncs = (): number => sync.mock.contexts.filter((context) => context === dot).length;
    // A frame that walks the dot: a change read in the update asks for one with performRender().
    const walk = (): void => {
      dot?.performRender();
      frames();
    };
    expect(stored()?.parent).toBe(entityKey("box", "b1"));
    const iterate = jest.spyOn(dot as WalkedDot, "iterate");
    sync.mockClear();
    walk();
    expect(iterate).toHaveBeenCalled();
    expect(dotSyncs()).toBe(0);
    // A new order among its siblings.
    (dot as WalkedDot).order = 5;
    walk();
    expect(dotSyncs()).toBe(1);
    expect(stored()?.childOrder).toBe(5);
    // A new parent: the element is added again under it.
    (dot as WalkedDot).parentId = entityKey("box", "b2");
    walk();
    expect(dotSyncs()).toBe(2);
    expect(stored()?.parent).toBe(entityKey("box", "b2"));
    expect(graph.scene.store.childrenOf(entityKey("box", "b2")).map((child) => child.id)).toEqual([dotId]);
    // Its element gone from the store, as when its parent's element is added again: written back, untriggered.
    graph.scene.store.delete(dotId);
    walk();
    expect(dotSyncs()).toBe(3);
    expect(stored()?.parent).toBe(entityKey("box", "b2"));
    walk();
    expect(dotSyncs()).toBe(3);
  });

  it("runs the level methods again after late web fonts when they measured text", () => {
    class MeasuringBox extends Box {
      public width = 0;
      protected override schematic(view: TBoxView): TScenePrimitive[] {
        this.width = this.measureText(view.title, "12px sans-serif");
        return super.schematic(view);
      }
    }
    mount(MeasuringBox);
    const runs = box.levelRuns;
    graph.scene.onFontsLoaded();
    frames();
    expect(box.levelRuns).toBe(runs + 1);
    layer.setProps({ children: [] });
    frames();
    expect(() => graph.scene.onFontsLoaded()).not.toThrow();
  });

  it("counts level runs and writes for the bench when asked", () => {
    sceneComponentStats.reset();
    sceneComponentStats.enabled = true;
    try {
      mount();
      expect(sceneComponentStats.levelRuns).toBe(1);
      expect(sceneComponentStats.writes).toBe(1);
    } finally {
      sceneComponentStats.enabled = false;
    }
  });

  it("warns once when a level method reads the camera, and freezes the view in development", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    let frozen = false;
    class CameraBox extends Box {
      protected override schematic(view: TBoxView): TScenePrimitive[] {
        frozen = Object.isFrozen(view);
        this.context.camera.getCameraScale();
        return super.schematic(view);
      }
    }
    mount(CameraBox);
    expect(frozen).toBe(true);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("read the camera"))).toHaveLength(1);
  });

  it("reports a willMount override that skipped super.willMount() once per class, and the reserved part name", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    class SkippingBox extends Box {
      protected override willMount(): void {
        // Skips super.willMount(): the scene element is never written.
      }
    }
    mount(SkippingBox, {}, [SkippingBox.create({ id: "b2", source: boxSource() })]);
    expect(element()).toBeUndefined();
    expect(graph.scene.store.size).toBe(0);
    graph.unmount();
    class NoneBox extends Box {
      protected override schematic(): TScenePrimitive[] {
        return [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, part: "none" }];
      }
    }
    mount(NoneBox);
    const errors = error.mock.calls.map(([message]) => String(message));
    expect(errors.filter((message) => message.includes("SkippingBox.willMount() did not call super"))).toHaveLength(1);
    expect(errors.some((message) => message.includes('the part name "none" is reserved'))).toBe(true);
  });

  it("reports a levelMask from a level method and an unbounded text size, and no limit for 33 primitives", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    class CrowdedBox extends Box {
      protected override schematic(): TScenePrimitive[] {
        return [
          ...Array.from({ length: 32 }, (): TScenePrimitive => ({ kind: "rect", x: 0, y: 0, width: 1, height: 1 })),
          {
            kind: "text",
            text: "t",
            family: "f",
            size: 12,
            cameraAware: true,
            lineHeight: 14,
            x: 0,
            y: 0,
            width: 9,
            levelMask: 2,
          },
        ];
      }
    }
    mount(CrowdedBox);
    expect(element()?.primitives.length).toBeGreaterThan(32);
    const errors = error.mock.calls.map(([message]) => String(message));
    expect(errors.some((message) => message.includes("primitives"))).toBe(false);
    expect(errors.some((message) => message.includes("levelMask"))).toBe(true);
    expect(warn.mock.calls.some(([message]) => String(message).includes("without maxWorld"))).toBe(true);
  });

  it("survives a level method that throws: later moves still write and frames still paint", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new Error("broken look");
    let fail = false;
    class FlakyBox extends Box {
      protected override schematic(view: TBoxView): TScenePrimitive[] {
        if (fail) throw broken;
        return super.schematic(view);
      }
    }
    mount(FlakyBox);
    const primitives = element()?.primitives;
    fail = true;
    source.title.value = "Broken";
    expect(() => frames()).not.toThrow();
    const reported = error.mock.calls.filter(
      ([message, cause]) => String(message).includes("FlakyBox") && cause === broken
    );
    expect(reported).toHaveLength(1);
    expect(element()?.primitives).toBe(primitives);
    const paint = jest.spyOn(graph.scene, "update");
    source.x.value = 70;
    expect(() => frames(1)).not.toThrow();
    expect(element()?.x).toBe(70);
    expect(paint).toHaveBeenCalled();
    fail = false;
    source.title.value = "Fixed";
    frames();
    expect(element()?.primitives.some((p) => p.kind === "text" && p.text === "Fixed")).toBe(true);
  });

  it("survives view data that throws on its first run and writes once the view reads again", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    class FlakyViewBox extends Box {
      protected override getViewData(): TBoxView {
        const view = super.getViewData();
        if (view.title === "Alpha") throw new Error("no view yet");
        return view;
      }
    }
    expect(() => mount(FlakyViewBox)).not.toThrow();
    expect(error.mock.calls.some(([message]) => String(message).includes("FlakyViewBox"))).toBe(true);
    expect(element()?.primitives).toEqual([]);
    source.title.value = "Beta";
    frames();
    expect(element()?.primitives.some((p) => p.kind === "text" && p.text === "Beta")).toBe(true);
  });

  it("survives an origin that throws: the element keeps its last place", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    class FlakyOriginBox extends Box {
      protected override getSceneOrigin(): TPoint {
        const origin = super.getSceneOrigin();
        if (origin.x < 0) throw new Error("no origin");
        return origin;
      }
    }
    mount(FlakyOriginBox);
    expect(() => {
      source.x.value = -5;
      frames();
    }).not.toThrow();
    expect(element()?.x).toBe(10);
    expect(error.mock.calls.some(([message]) => String(message).includes("FlakyOriginBox"))).toBe(true);
    source.x.value = 30;
    frames();
    expect(element()?.x).toBe(30);
  });

  it("takes a bucket from props on setProps in one update, without running the level methods again", () => {
    class CountingBox extends Box {
      public updates = 0;

      protected override willIterate(): void {
        this.updates++;
        super.willIterate();
      }
    }
    mount(CountingBox);
    const counting = box as CountingBox;
    const runs = box.levelRuns;
    const updates = counting.updates;
    const update = jest.spyOn(graph.scene.store, "update");
    box.setProps({ zIndex: 300 });
    frames();
    expect(element()?.zIndex).toBe(300);
    expect(box.levelRuns).toBe(runs);
    expect(update.mock.calls.map(([, patch]) => patch)).toEqual([{ zIndex: 300 }]);
    expect(counting.updates).toBe(updates + 1);
  });

  it("patches only the fields that changed, bounds by value", () => {
    mount();
    const update = jest.spyOn(graph.scene.store, "update");
    source.title.value = "Beta";
    frames();
    expect(update.mock.calls.map(([, patch]) => Object.keys(patch))).toEqual([["primitives"]]);
  });

  it("keeps one scene key object while its element is written", () => {
    mount();
    const key = box.getSceneKey();
    source.x.value = 40;
    frames();
    expect(box.getSceneKey()).toBe(key);
    layer.setProps({ children: [] });
    frames();
    expect(box.getSceneKey()).toBeUndefined();
  });

  it("reports an element id another component owns and leaves that element alone", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    class OtherBox extends Box {}
    mount(Box, {}, [OtherBox.create({ id: "b1", source: boxSource("Other", 99) })]);
    expect(element()?.x).toBe(10);
    const messages = error.mock.calls.map(([message]) => String(message));
    expect(
      messages.filter((message) => message.includes("OtherBox") && message.includes("belongs to Box"))
    ).toHaveLength(1);
    layer.setProps({ children: [Box.create({ id: "b1", source })] });
    frames();
    expect(element()?.x).toBe(10);
  });

  it("writes an owner without primitives at its origin with empty bounds", () => {
    class EmptyBox extends Box {
      protected override minimalistic(): TScenePrimitive[] {
        this.levelRuns++;
        return [];
      }

      protected override schematic(): TScenePrimitive[] {
        return [];
      }
    }
    mount(EmptyBox);
    expect(element()?.primitives).toEqual([]);
    expect(element()?.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(element()?.x).toBe(10);
  });

  it("does not run the level methods again after late web fonts when they measured no text", () => {
    mount();
    const runs = box.levelRuns;
    graph.scene.onFontsLoaded();
    frames();
    expect(box.levelRuns).toBe(runs);
  });
});
