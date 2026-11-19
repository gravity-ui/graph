import { signal } from "@preact/signals-core";

import { Graph } from "../../../../graph";
import type { ChildDescriptor } from "../../../../lib/CoreComponent";
import { globalScheduler } from "../../../../lib/Scheduler";
import type { TTileRect } from "../../../../lib/culling/TileIndex";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import { Camera } from "../../../../services/camera/Camera";
import { ECameraScaleLevel } from "../../../../services/camera/cameraScaleEnums";
import type { DragOperationCallbacks } from "../../../../services/drag";
import type { TSceneLevel } from "../../../../services/scene/types";
import { hoveredTag } from "../../../../services/tags/builtinTags";
import { anchorEntityId } from "../../../../store/anchor/anchorEntityId";
import type { TRect } from "../../../../utils/types/shapes";
import type { TGraphComponentProps } from "../../GraphComponent";
import { Anchor } from "../../anchors";
import type { TAnchorClass } from "../../anchors";
import { Block } from "../../blocks/Block";
import type { TBlock } from "../../blocks/Block";
import { SceneComponent } from "../SceneComponent";
import type { TSceneParent } from "../SceneComponent";

import { Box, TestLayer, boxSource, frames } from "./utils/sceneTestKit";

type TPinProps = TGraphComponentProps & { id: string; inner?: ChildDescriptor[] };

/** A child of its box: a radius-4 dot at (100, 10) in the box's frame, on the schematic level only. */
class Pin extends SceneComponent<TPinProps> {
  public static override entityType = "pin";

  public override getEntityId(): string {
    return this.props.id;
  }

  // Both empty on purpose: without them encodeLevels gives these levels the schematic list.
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "circle", cx: 100, cy: 10, r: 4 }];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** No look: a hit region of its box's look at the same place, without a declaration. */
class RegionPin extends Pin {
  protected override schematic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override getHitRect(_bounds: TTileRect | undefined): TRect | undefined {
    return { x: 96, y: 6, width: 8, height: 8 };
  }
}

/** The same region, declared where its box's look shows it. */
class DeclaredRegionPin extends RegionPin {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

/** Declared hittable on the schematic level only, whatever shows it. */
class SchematicPin extends Pin {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

/** Declared hittable on the minimalistic level only, whatever it draws. */
class MinimalisticPin extends Pin {
  public static override hitLevels: readonly TSceneLevel[] = ["minimalistic"];
}

/** A pin that hides itself with its hit box removed, as a component that is not shown does. */
class HidingPin extends Pin {
  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  public show(): void {
    this.setVisibility(true, { removeHitbox: true });
  }
}

/** A pin hidden in the scene by an input of its own (an `isSceneHidden` override), not through `setVisibility`. */
class ConcealedPin extends Pin {
  private concealed = false;

  public conceal(): void {
    this.concealed = true;
    this.performRender();
  }

  protected override isSceneHidden(): boolean {
    return this.concealed || super.isSceneHidden();
  }
}

/** A child whose element is never added (its parent element does not exist), with a hit box of its own. */
class OrphanPin extends Pin {
  protected override getSceneParent(): TSceneParent | undefined {
    return { elementId: "missing", order: 0 };
  }

  protected override willMount(): void {
    super.willMount();
    this.setHitBox(96, 6, 104, 14);
  }
}

type TMovingState = { readonly level: TSceneLevel };

/** The level `MovingPin` draws its dot on, read as a signal: a change rewrites the pin. */
const dotLevel = signal<TSceneLevel>("schematic");

/** A pin whose dot (the `Pin` dot, at the same place) is drawn on the level `dotLevel` names: its bounds stay. */
class MovingPin extends SceneComponent<TPinProps, TMovingState> {
  public static override entityType = "pin";

  public override getEntityId(): string {
    return this.props.id;
  }

  public override state = { level: dotLevel.peek() };

  protected override willMount(): void {
    super.willMount();
    this.subscribeSignal(dotLevel, (level) => {
      if (this.getState().level !== level) this.setState({ level });
    });
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return this.state.level === "minimalistic" ? [{ kind: "circle", cx: 100, cy: 10, r: 4 }] : [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return this.state.level === "schematic" ? [{ kind: "circle", cx: 100, cy: 10, r: 4 }] : [];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return this.state.level === "detailed" ? [{ kind: "circle", cx: 100, cy: 10, r: 4 }] : [];
  }
}

/** The pin of the next box, set by each test before it mounts one. */
let pin: ChildDescriptor = Pin.create({ id: "pin" });

class PinnedBox extends Box {
  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  protected override updateChildren(): ChildDescriptor[] {
    return [pin];
  }
}

/** An element owner declared hittable on the schematic level only. */
class SchematicBox extends PinnedBox {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

describe("hit levels of scene components", () => {
  let graph: Graph;
  let box: PinnedBox | undefined;
  const pins: Record<string, Pin> = {};
  const keep =
    (id: string) =>
    (component: Pin): void => {
      pins[id] = component;
    };

  function mount(descriptor: ChildDescriptor, Owner: typeof PinnedBox = PinnedBox): void {
    pin = descriptor;
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 0.5 });
    graph.addLayer(TestLayer, {
      children: [
        Owner.create(
          { id: "box", source: boxSource("box") },
          {
            ref: (component: PinnedBox): void => {
              box = component;
            },
          }
        ),
      ],
    });
    frames(5);
  }

  /** The component the pointer hits at the pin at a camera scale: 0.1 minimalistic, 0.5 schematic, 1 detailed. */
  const hitAt = (scale: number): unknown => {
    graph.cameraService.set({ scale });
    return graph.getElementOverPoint({ x: 100, y: 10 });
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("hits a sub-component with a look on the levels its primitives are on", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(0.1)).toBe(box);
    expect(hitAt(1)).toBe(box);
  });

  it("hits a look-less sub-component only on the levels it declares, and warns when it declares none", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(RegionPin.create({ id: "pin" }, { ref: keep("pin") }));
    for (const scale of [0.1, 0.5, 1]) expect(hitAt(scale)).toBe(box);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("hitLevels"))).toHaveLength(1);
    graph.unmount();
    mount(DeclaredRegionPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(0.1)).toBe(box);
    expect(hitAt(1)).toBe(box);
  });

  it("takes the levels a class declares", () => {
    mount(MinimalisticPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.1)).toBe(pins.pin);
    expect(hitAt(0.5)).toBe(box);
  });

  it("hits an element owner on every level", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    for (const scale of [0.1, 0.5, 1]) {
      graph.cameraService.set({ scale });
      expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(box);
    }
  });

  it("hits every level while its owner is shown outside the scene, and keeps a declaration", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    box?.setRenderDelegated(true);
    frames(2);
    expect(box?.isShownOutsideScene()).toBe(true);
    expect(hitAt(0.1)).toBe(pins.pin);
    expect(hitAt(1)).toBe(pins.pin);
    graph.unmount();
    mount(SchematicPin.create({ id: "pin" }, { ref: keep("pin") }));
    box?.setRenderDelegated(true);
    frames(2);
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(1)).toBe(box);
  });

  it("follows the nesting: a hidden middle hides what is nested in it, a delegated middle shows it", () => {
    // pin "mid" at (100, 10) with a nested pin "deep" at the same place (its parent's origin).
    mount(Pin.create({ id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] }, { ref: keep("mid") }));
    expect(hitAt(0.5)).toBe(pins.deep);
    pins.mid.setRenderDelegated(true);
    frames(2);
    // Delegated: drawn hidden, shown outside the scene, so "deep" is hit on every level.
    expect(hitAt(1)).toBe(pins.deep);
    pins.mid.setRenderDelegated(false);
    box?.hide();
    frames(2);
    expect(hitAt(0.5)).toBeUndefined();
  });

  it("does not hit a grandchild under a hidden middle child, and a still pointer leaves it for the box", () => {
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        { id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pins at world (100, 10) are at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value).toBe(pins.deep);
    mid?.hide();
    frames(3);
    // The middle child's own box is out, and what is nested in it is drawn hidden: the box under them is hit.
    expect(hitAt(0.5)).toBe(box);
    expect(graph.getElementsOverRect({ x: 95, y: 5, width: 10, height: 10 }).includes(pins.deep)).toBe(false);
    expect(layer.$hoveredComponent.value).toBe(box);
    mid?.show();
    frames(3);
    expect(hitAt(0.5)).toBe(pins.deep);
  });

  it("does not hit a sub-component of a hidden owner, and a still pointer leaves both", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const layer = graph.getGraphLayer();
    const left: string[] = [];
    pins.pin.addEventListener("mouseleave", () => left.push("pin"));
    box?.addEventListener("mouseleave", () => left.push("box"));
    // Scale 0.5 at the origin: the pin at world (100, 10) is at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value).toBe(pins.pin);
    box?.hide();
    frames(3);
    expect(hitAt(0.5)).toBeUndefined();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(left).toEqual(["pin", "box"]);
  });

  it("hides a hidden middle child's subtree from hits under an owner shown outside the scene, as in the DOM", () => {
    // A component hidden for a reason other than delegation is a hit barrier for its
    // subtree, under an HTML-held (here: delegated) owner too, and whatever its descendants declare.
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        {
          id: "mid",
          inner: [
            Pin.create({ id: "deep" }, { key: "deep", ref: keep("deep") }),
            SchematicPin.create({ id: "declared" }, { key: "declared", ref: keep("declared") }),
          ],
        },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    box?.setRenderDelegated(true);
    frames(2);
    const hits = (scale: number): unknown[] => {
      graph.cameraService.set({ scale });
      return graph.getElementsOverPoint({ x: 100, y: 10 });
    };
    const inRect = (): unknown[] => graph.getElementsOverRect({ x: 95, y: 5, width: 10, height: 10 });
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pins at world (100, 10) are at client (50, 5).
    graph.cameraService.set({ scale: 0.5 });
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    const target = layer.$hoveredComponent.value;
    expect(target === pins.declared || target === pins.deep).toBe(true);
    mid?.hide();
    frames(3);
    // The target leaves the grandchild at the frame's end: the box, shown outside the scene, keeps its hit box.
    expect(layer.$hoveredComponent.value === box).toBe(true);
    for (const scale of [0.5, 1]) {
      const found = hits(scale);
      expect(found.includes(pins.deep) || found.includes(pins.declared)).toBe(false);
      expect(inRect().includes(pins.deep) || inRect().includes(pins.declared)).toBe(false);
    }
    mid?.show();
    frames(3);
    // Shown again: as before, the undeclared one on every level (its owner is shown outside), the declared one where
    // it declares.
    expect(hits(0.5).includes(pins.deep) && hits(0.5).includes(pins.declared)).toBe(true);
    expect(hits(1).includes(pins.deep)).toBe(true);
    expect(hits(1).includes(pins.declared)).toBe(false);
  });

  it("finds the target again when a middle child's own isSceneHidden input hides it, under a still pointer", () => {
    let mid: ConcealedPin | undefined;
    mount(
      ConcealedPin.create(
        { id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] },
        {
          ref: (component: ConcealedPin): void => {
            mid = component;
          },
        }
      )
    );
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pins at world (100, 10) are at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value === pins.deep).toBe(true);
    mid?.conceal();
    frames(3);
    // A hit barrier now: its subtree takes no hits, and the written hidden flag asks for the retarget.
    expect(graph.getElementsOverPoint({ x: 100, y: 10 }).includes(pins.deep)).toBe(false);
    expect(layer.$hoveredComponent.value === box).toBe(true);
  });

  it("finds the target again when a middle child is delegated, under a still pointer", () => {
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        { id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    // Detailed, where the schematic-only pins are not shown: the pointer is on the box.
    graph.cameraService.set({ scale: 1 });
    const layer = graph.getGraphLayer();
    // Scale 1 at the origin: world = client.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 10 }));
    // The level change's own retarget runs here, so it cannot stand in for the delegation's below.
    frames(3);
    expect(layer.$hoveredComponent.value === box).toBe(true);
    // Shown outside the scene now: "deep" is hit on every level, and the delegation itself asks for the retarget.
    mid?.setRenderDelegated(true);
    frames(3);
    expect(graph.getElementOverPoint({ x: 100, y: 10 }) === pins.deep).toBe(true);
    expect(layer.$hoveredComponent.value === pins.deep).toBe(true);
  });

  it("hides the subtree of a delegated middle child that an input of its own hides, as in the DOM", () => {
    // Delegation must not mask another, still active, reason to hide.
    let mid: ConcealedPin | undefined;
    mount(
      ConcealedPin.create(
        {
          id: "mid",
          inner: [
            Pin.create({ id: "deep" }, { key: "deep", ref: keep("deep") }),
            SchematicPin.create({ id: "declared" }, { key: "declared", ref: keep("declared") }),
          ],
        },
        {
          ref: (component: ConcealedPin): void => {
            mid = component;
          },
        }
      )
    );
    mid?.setRenderDelegated(true);
    frames(2);
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pins at world (100, 10) are at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    const target = layer.$hoveredComponent.value;
    expect(target === pins.declared || target === pins.deep).toBe(true);
    mid?.conceal();
    frames(3);
    const found = graph.getElementsOverPoint({ x: 100, y: 10 });
    const inRect = graph.getElementsOverRect({ x: 95, y: 5, width: 10, height: 10 });
    for (const grandchild of [pins.deep, pins.declared]) {
      expect(found.includes(grandchild) || inRect.includes(grandchild)).toBe(false);
    }
    expect(layer.$hoveredComponent.value === box).toBe(true);
  });

  it("keeps a hidden component hidden through a delegation and its end", () => {
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        { id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    mid?.hide();
    mid?.setRenderDelegated(true);
    mid?.setRenderDelegated(false);
    frames(3);
    // The explicit hide outlasts delegation.
    expect(mid?.getSceneElementView()?.hidden).toBe(true);
    expect(graph.getElementsOverPoint({ x: 100, y: 10 }).includes(pins.deep)).toBe(false);
    expect(mid?.isHiddenForOtherReason()).toBe(true);
  });

  it("keeps a delegated component delegated through a hide and its end, with its hit box", () => {
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        { id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    mid?.setRenderDelegated(true);
    mid?.hide();
    mid?.show();
    frames(3);
    // Hidden in the scene, still shown outside it, its hit box back: it and "deep" are hit on every level.
    expect(mid?.getSceneElementView()?.hidden).toBe(true);
    expect(mid?.isShownOutsideScene()).toBe(true);
    graph.cameraService.set({ scale: 1 });
    const found = graph.getElementsOverPoint({ x: 100, y: 10 });
    expect(found.includes(mid) && found.includes(pins.deep)).toBe(true);
  });

  it("takes the hit box of a delegated component out when setVisibility hides it with removeHitbox", () => {
    let mid: HidingPin | undefined;
    mount(
      HidingPin.create(
        { id: "mid" },
        {
          ref: (component: HidingPin): void => {
            mid = component;
          },
        }
      )
    );
    mid?.setRenderDelegated(true);
    frames(2);
    const boxes = (): unknown[] => graph.hitTest.testBox({ minX: 95, minY: 5, maxX: 105, maxY: 15 });
    expect(boxes().includes(mid)).toBe(true);
    mid?.hide();
    frames(2);
    expect(boxes().includes(mid)).toBe(false);
  });

  it("finds the target again when a child's look moves to another level under a still pointer", () => {
    dotLevel.value = "schematic";
    let moving: MovingPin | undefined;
    mount(
      MovingPin.create(
        { id: "pin" },
        {
          ref: (component: MovingPin): void => {
            moving = component;
          },
        }
      )
    );
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the dot at world (100, 10) is at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value === moving).toBe(true);
    const hitBox = moving?.getHitBox();
    dotLevel.value = "detailed";
    frames(3);
    // The same bounds, so its hit box asks for nothing; the change of its hit levels does.
    expect(moving?.getHitBox()).toEqual(hitBox);
    expect(layer.$hoveredComponent.value === box).toBe(true);
  });

  it("hits an element owner on the levels it declares", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }), SchematicBox);
    const at = (scale: number): unknown => {
      graph.cameraService.set({ scale });
      return graph.getElementOverPoint({ x: 50, y: 25 });
    };
    expect(at(0.5) === box).toBe(true);
    expect(at(0.1)).toBeUndefined();
    expect(at(1)).toBeUndefined();
  });

  it("does not hit a declared child under a hidden owner that is not shown outside the scene", () => {
    mount(SchematicPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.5) === pins.pin).toBe(true);
    box?.hide();
    frames(2);
    expect(hitAt(0.5)).toBeUndefined();
  });

  it("does not take a child whose element was never added for an element owner", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mount(OrphanPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(error.mock.calls.some(([message]) => String(message).includes("is not in the scene"))).toBe(true);
    for (const scale of [0.1, 0.5, 1]) {
      expect(hitAt(scale) === box).toBe(true);
      // Not hit at all (it would sort below the box anyway: it has no scene key).
      expect(graph.getElementOverPoint({ x: 100, y: 10 }, [OrphanPin])).toBeUndefined();
      expect(graph.getElementsOverRect({ x: 95, y: 5, width: 10, height: 10 }).includes(pins.pin)).toBe(false);
    }
  });

  it("leaves components the level does not hit out of rect queries", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const rect = { x: 95, y: 5, width: 10, height: 10 };
    graph.cameraService.set({ scale: 0.1 });
    expect(graph.getElementsOverRect(rect).includes(pins.pin)).toBe(false);
    graph.cameraService.set({ scale: 0.5 });
    expect(graph.getElementsOverRect(rect).includes(pins.pin)).toBe(true);
  });

  it("finds the target again under a stationary pointer when the level changes without a camera move", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pin at world (100, 10) is at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value).toBe(pins.pin);
    graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed });
    frames(3);
    expect(layer.$hoveredComponent.value).toBe(box);
  });
});

/** A look on the minimalistic level too, created there. */
class FarDotAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

/** The stock look, declared hittable on the schematic level only. */
class SchematicAnchor extends Anchor {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

class FarDotBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return FarDotAnchor;
  }
}

class SchematicAnchorBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return SchematicAnchor;
  }
}

/** No look on any level, without a declaration: its hit box is its own (`Anchor` sets it from its port). */
class LooklessAnchor extends Anchor {
  protected override schematic(): readonly TScenePrimitive[] {
    return [];
  }
}

class LooklessAnchorBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return LooklessAnchor;
  }
}

describe("hit levels of anchors", () => {
  const anchored = (id: string, x: number, is = "Block"): TBlock => ({
    id,
    is,
    name: id,
    x,
    y: 100,
    width: 200,
    height: 100,
    anchors: [
      { id: "in", blockId: id, type: "IN" },
      { id: "out", blockId: id, type: "OUT" },
    ],
  });

  let graph: Graph;
  const frame = (): void => {
    for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
  };
  const state = (id: string): ReturnType<Graph["rootStore"]["blocksList"]["getBlockState"]> =>
    graph.rootStore.blocksList.getBlockState(id);
  const out = (id: string): Anchor | undefined => state(id)?.getAnchorById("out")?.getViewComponent();

  beforeEach(() => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        settings: {
          useBlocksAnchors: true,
          blockComponents: { FarDot: FarDotBlock, Declared: SchematicAnchorBlock, Lookless: LooklessAnchorBlock },
        },
      },
      root
    );
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({
      blocks: [anchored("plain", 100), anchored("dot", 400, "FarDot"), anchored("declared", 700, "Declared")],
      connections: [],
    });
    frame();
  });

  afterEach(() => graph.unmount());

  it("hits a stock anchor where it is shown, a class drawn on minimalistic there, and keeps a declaration", () => {
    // The OUT anchors lie at x + 200, y 188 (HEAD_HEIGHT 64 + BODY_PADDING 24 below the block's top).
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(out("plain"));
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    frame();
    // Detailed without an HTML view: not shown, not hit; the block is.
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(state("plain")?.getViewComponent());
    state("plain")?.getViewComponent()?.setRenderDelegated(true);
    state("declared")?.getViewComponent()?.setRenderDelegated(true);
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(out("plain"));
    expect(graph.getElementOverPoint({ x: 900, y: 188 })).toBe(state("declared")?.getViewComponent());
    state("plain")?.getViewComponent()?.setRenderDelegated(false);
    graph.cameraService.set({ scale: 0.1, x: 0, y: 0 });
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(state("plain")?.getViewComponent());
    expect(graph.getElementOverPoint({ x: 600, y: 188 })).toBe(out("dot"));
  });

  it("gives an unshown detailed anchor's pointer gestures, hover and rect queries to the block", () => {
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    frame();
    const layer = graph.getGraphLayer();
    const anchor = out("plain");
    const block = state("plain")?.getViewComponent();
    const entered: string[] = [];
    anchor?.addEventListener("mouseenter", () => entered.push("anchor"));
    const targets: unknown[] = [];
    graph.on("mousedown", (event) => {
      targets.push(event.detail.target);
    });
    graph.on("click", (event) => {
      targets.push(event.detail.target);
    });
    const busEntered: unknown[] = [];
    graph.on("mouseenter", (event) => {
      busEntered.push(event.detail.target);
    });
    // Scale 1 at the origin: world = client.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    for (const type of ["mousedown", "mouseup", "click"]) {
      layer.handleEvent(new MouseEvent(type, { clientX: 300, clientY: 188 }));
    }
    expect(layer.$hoveredComponent.value).toBe(block);
    expect(entered).toEqual([]);
    // The graph bus names the block as the entered target, as the component events do.
    expect(busEntered.length === 1 && busEntered[0] === block).toBe(true);
    expect(graph.scene.tags.peekOf("anchor", anchorEntityId("plain", "out")).has(hoveredTag)).toBe(false);
    expect(targets.length === 2 && targets.every((target) => target === block)).toBe(true);
    expect(state("plain")?.getAnchorById("out")?.$selected.value).toBe(false);
    const rect = { x: 290, y: 178, width: 20, height: 20 };
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([]);
    expect(graph.getElementsInViewport([Anchor]).includes(anchor as Anchor)).toBe(false);
    // The schematic level shows the anchor: the same queries find it.
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    frame();
    expect(graph.getElementsOverRect(rect, [Anchor]).includes(anchor as Anchor)).toBe(true);
  });

  it("does not hit the anchors of a block its group hides, also while the block's drawing is delegated", () => {
    const block = state("plain")?.getViewComponent();
    block?.setRenderDelegated(true);
    frame();
    // Delegated: shown outside the scene, so its anchor is hit on every level.
    expect(graph.getElementOverPoint({ x: 300, y: 188 }, [Anchor]) === out("plain")).toBe(true);
    // Hidden by its group (`setHiddenBlock`): a reason other than delegation, so a hit barrier for its anchors.
    block?.setHiddenBlock(true);
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 }, [Anchor])).toBeUndefined();
    block?.setHiddenBlock(false);
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 }, [Anchor]) === out("plain")).toBe(true);
  });

  it("warns once per look-less anchor class that sets its own hit box without a declaration", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph.setEntities({
      blocks: [anchored("l1", 100, "Lookless"), anchored("l2", 400, "Lookless")],
      connections: [],
    });
    frame();
    // Four anchors of one class, each with its own hit box from its port.
    for (const id of ["l1", "l2"]) {
      for (const anchorId of ["in", "out"]) {
        expect(state(id)?.getAnchorById(anchorId)?.getViewComponent() instanceof LooklessAnchor).toBe(true);
      }
    }
    const warnings = warn.mock.calls.filter(([message]) => String(message).includes("hitLevels"));
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]?.[0])).toContain("LooklessAnchor");
    // Not hit: the block under it is.
    expect(graph.getElementOverPoint({ x: 300, y: 188 }) === state("l1")?.getViewComponent()).toBe(true);
  });

  it("leaves an unshown detailed anchor out of a rect selection that includes anchors", () => {
    graph.api.updateGraphConstants({ selectionLayer: { SELECTABLE_ENTITY_TYPES: [Block, Anchor] } });
    let callbacks: DragOperationCallbacks | undefined;
    jest.spyOn(graph.dragService, "startDrag").mockImplementation((dragCallbacks) => {
      callbacks = dragCallbacks;
      return undefined as unknown as ReturnType<Graph["dragService"]["startDrag"]>;
    });
    // Inspect candidates before selection filters them: the stock anchor bucket defines no isRelatedElement.
    const related = jest.spyOn(graph.rootStore.selectionService, "selectRelatedElements");
    const given = (call: number): unknown[] => related.mock.calls[call]?.[0] ?? [];
    /** A meta-key rect selection from empty space (the camera) over the plain block's OUT anchor at (300, 188). */
    const selectAroundOut = (): void => {
      // SelectionLayer starts a selection only when the press lands on the camera (empty space).
      const target = Object.create(Camera.prototype) as Camera;
      graph.emit("mousedown", { sourceEvent: new MouseEvent("mousedown", { metaKey: true }), target });
      const event = new MouseEvent("mouseup");
      callbacks?.onStart?.(event, [290, 178]);
      callbacks?.onUpdate?.(event, [310, 198]);
      callbacks?.onEnd?.(event, [310, 198]);
    };
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    frame();
    selectAroundOut();
    // Detailed without an HTML view: the anchor is not shown, so the rect gives its block only.
    expect(given(0).includes(state("plain")?.getViewComponent())).toBe(true);
    expect(given(0).includes(out("plain"))).toBe(false);
    expect(state("plain")?.$selected.value).toBe(true);
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    frame();
    selectAroundOut();
    expect(given(1).includes(out("plain"))).toBe(true);
  });

  it("keeps the target when a pan at one level creates anchors under a still pointer, until the next move", () => {
    // `emulateMouseEventsOnCameraChange` is off (the default): a camera move finds no new target, and the first hit
    // mask of a lazily created anchor asks for no retarget either (Step 3).
    graph.setEntities({ blocks: [anchored("plain", 100), anchored("far", 3000)], connections: [] });
    frame();
    const layer = graph.getGraphLayer();
    const entered: unknown[] = [];
    graph.on("mouseenter", (event) => {
      entered.push(event.detail.target);
    });
    // Client (600, 94) is world (1200, 188) at scale 0.5 from the origin: empty space. The far block lies past the
    // camera's anchor search, so its anchors do not exist yet.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 600, clientY: 94 }));
    expect(out("far")).toBeUndefined();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    entered.splice(0);
    // A pan at the same scale puts the far block's OUT anchor point (3200, 188) under the pointer (600 - 3200 * 0.5).
    graph.cameraService.set({ x: -1000 });
    frame();
    expect(out("far") instanceof Anchor).toBe(true);
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(entered).toEqual([]);
    // The next pointer move, 4 px on (past the 3 px threshold), finds the anchor: world (3208, 188).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 604, clientY: 94 }));
    expect(layer.$hoveredComponent.value).toBe(out("far"));
  });
});
