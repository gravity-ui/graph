import { batch } from "@preact/signals-core";

import { Graph } from "../../../../graph";
import { CoreComponent } from "../../../../lib/CoreComponent";
import type { ChildDescriptor } from "../../../../lib/CoreComponent";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import { entityKey } from "../../../../services/tags/TagStore";
import type { TPoint } from "../../../../utils/types/shapes";
import type { GraphComponentContext, TGraphComponentProps } from "../../GraphComponent";
import { SceneComponent, sceneComponentStats } from "../SceneComponent";
import type { TSceneParent } from "../SceneComponent";

import { Box, BoxDot, TestLayer, boxSource, frames } from "./utils/sceneTestKit";
import type { TBoxProps, TBoxSource } from "./utils/sceneTestKit";

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

  describe("level methods reading component data directly", () => {
    type Props = TGraphComponentProps & { width: number };
    type State = { x: number; height: number };
    type Context = GraphComponentContext & { color?: string; unitScale?: number };

    class Marker extends SceneComponent<Props, State, Context> {
      public override state = { x: 0, height: 3 };
      public runs = 0;

      public change<K extends keyof State>(patch: Pick<State, K>): void {
        this.setState(patch);
      }

      public refresh(): void {
        this.invalidate();
      }

      protected override getSceneOrigin(): TPoint {
        return { x: this.state.x, y: 0 };
      }

      protected override schematic(): TScenePrimitive[] {
        this.runs++;
        return [
          { kind: "rect", x: 0, y: 0, width: this.props.width, height: this.state.height, fill: this.context.color },
        ];
      }
    }

    function mountMarker(Kind: typeof Marker = Marker): Marker {
      let marker!: Marker;
      const ref = (instance: Marker): void => {
        marker = instance;
      };
      graph = new Graph({}, document.createElement("div"));
      graph.start();
      graph.addLayer(TestLayer, { children: [Kind.create({ width: 8 }, { ref })] });
      frames();
      return marker;
    }

    it("draws applied state, props and context in the scheduled update", () => {
      const marker = mountMarker();
      const primitive = () => graph.scene.store.get(marker.getSceneElementId())?.primitives[0];
      const initial = marker.runs;
      marker.change({ height: 6 });
      frames(1);
      expect(primitive()).toMatchObject({ width: 8, height: 6 });
      marker.setContext({ color: "#123456" });
      frames(1);
      expect(primitive()).toMatchObject({ fill: "#123456" });
      marker.setProps({ width: 12 });
      marker.change({ height: 10 });
      frames(1);
      expect(primitive()).toMatchObject({ width: 12, height: 10, fill: "#123456" });
      expect(marker.runs).toBe(initial + 3);
    });

    class ScaledMarker extends Marker {
      protected override schematic(): TScenePrimitive[] {
        this.runs++;
        return [{ kind: "rect", x: 0, y: 0, width: this.width(this.props, this.state, this.context), height: 1 }];
      }

      protected override shouldUpdateScene(props: Props, state: State, context: Context): boolean {
        return this.width(props, state, context) !== this.width(this.props, this.state, this.context);
      }

      private width(props: Props, state: State, context: Context): number {
        return props.width * state.height * (context.unitScale ?? 1);
      }
    }

    it("draws the final inputs when lifecycle hooks or later edits change a pending update", () => {
      class ClampedMarker extends ScaledMarker {
        protected override propsChanged(next: Props): void {
          super.propsChanged(next);
          if (next.interactive === false && this.props.interactive !== false) this.change({ height: 2 });
        }

        protected override stateChanged(next: State): void {
          super.stateChanged(next);
          if (this.props.width >= 16 && next.height < 2) this.change({ height: 2 });
        }
      }
      const marker = mountMarker(ClampedMarker);
      const rect = () => graph.scene.store.get(marker.getSceneElementId())?.primitives[0];
      const initial = marker.runs;
      marker.setProps({ interactive: false });
      frames(1);
      expect(rect()).toMatchObject({ width: 16 });
      // The requested 16 × 1 would look the same. The new props make stateChanged clamp the height to 2.
      marker.setProps({ width: 16 });
      marker.change({ height: 1 });
      frames(1);
      expect(marker.state.height).toBe(2);
      expect(rect()).toMatchObject({ width: 32 });
      // Context applies immediately. The pending prop that would cancel the scale is reverted before the frame.
      marker.setProps({ width: 8 });
      marker.setContext({ unitScale: 2 });
      marker.setProps({ width: 16 });
      frames(1);
      expect(rect()).toMatchObject({ width: 64 });
      expect(marker.runs).toBe(initial + 3);
    });

    it("reuses geometry for equivalent data and position-only changes, until explicitly invalidated", () => {
      const marker = mountMarker(ScaledMarker);
      const stored = () => graph.scene.store.get(marker.getSceneElementId());
      const primitives = stored()?.primitives;
      const initial = marker.runs;
      expect(primitives?.[0]).toMatchObject({ width: 24 });
      marker.change({ x: 17, height: 1 });
      marker.setProps({ width: 24 });
      frames(1);
      expect(stored()?.x).toBe(17);
      expect(stored()?.primitives).toBe(primitives);
      marker.performRender();
      frames(1);
      expect(marker.runs).toBe(initial);
      marker.refresh();
      frames(1);
      expect(marker.runs).toBe(initial + 1);
    });
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

  it("writes its class's entity type on its elements, whatever their ids", () => {
    class RenamedBox extends Box {
      protected override createSceneElementId(): string {
        return `renamed:${this.props.id}`;
      }
    }
    mount(RenamedBox, { dots: 1 });
    expect(graph.scene.store.get("renamed:b1")?.entityType).toBe("box");
    expect(graph.scene.store.get(entityKey("dot", "b1/0"))?.entityType).toBe("dot");
    expect(graph.scene.query({ x: -1000, y: -1000, width: 2000, height: 2000 }, { entityTypes: ["box"] })).toEqual([
      expect.objectContaining({ id: "renamed:b1", entityType: "box" }),
    ]);
  });

  it("keeps its scene key and primitives across a move, until the element is removed", () => {
    mount();
    const key = box.getSceneKey();
    const primitives = element()?.primitives;
    const runs = box.levelRuns;
    source.x.value = 40;
    frames();
    expect(element()?.x).toBe(40);
    expect(element()?.primitives).toBe(primitives);
    expect(box.levelRuns).toBe(runs);
    expect(box.getSceneKey()).toBe(key);
    layer.setProps({ children: [] });
    frames();
    expect(box.getSceneKey()).toBeUndefined();
  });

  it("coalesces model changes into a single build using the last state", () => {
    mount();
    const runs = box.levelRuns;
    source.title.value = "One";
    source.title.value = "Beta";
    expect(box.levelRuns).toBe(runs);
    frames();
    expect(box.levelRuns).toBe(runs + 1);
    expect(element()?.primitives.some((p) => p.kind === "text" && p.text === "Beta")).toBe(true);
  });

  it("follows a replacement signal after a skipped data update, including during a synchronous export flush", () => {
    mount();
    const runs = box.levelRuns;
    const replacement = boxSource("Alpha", 20);
    box.setProps({ source: replacement });
    frames(1);
    expect(element()?.x).toBe(20);
    source.title.value = "Detached";
    frames(1);
    expect(box.levelRuns).toBe(runs);
    replacement.title.value = "Export";
    batch(() => {
      box.setProps({ zIndex: 300 });
      CoreComponent.applyUpdatesNow(box);
      expect(element()?.primitives).toContainEqual(expect.objectContaining({ text: "Export" }));
    });
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

  it("binds the style to its entity and releases both the style binding and element on unmount", () => {
    mount();
    expect(element()?.styleId).toBeGreaterThan(0);
    expect(graph.scene.explain("box", "b1").target).toBe("Box");
    layer.setProps({ children: [] });
    frames();
    expect(element()).toBeUndefined();
    expect(graph.scene.explain("box", "b1").target).toBeUndefined();
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

  it("walks and paints an immediate subclass without rewriting its unchanged scene element", () => {
    class WalkedBox extends Box {
      public static override readonly mode = "immediate";
      public paints = 0;
      protected override render(): void {
        this.paints++;
      }
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
    expect((box as WalkedBox).paints).toBeGreaterThan(0);
    expect(element()).toBeDefined();
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
      protected override schematic(): TScenePrimitive[] {
        this.width = this.measureText(this.state.title, "12px sans-serif");
        return super.schematic();
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

  it("warns once when a level method reads the camera", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    class CameraBox extends Box {
      protected override schematic(): TScenePrimitive[] {
        this.context.camera.getCameraScale();
        return super.schematic();
      }
    }
    mount(CameraBox);
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
      protected override schematic(): TScenePrimitive[] {
        if (fail) throw broken;
        return super.schematic();
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

      protected override shouldUpdateScene(props: TBoxProps): boolean {
        return props.source !== this.props.source;
      }

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
