import { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import type { TScenePrimitive } from "../../../lib/scene/types";
import type { TSceneLevel } from "../../../services/scene/types";
import { entityKey } from "../../../services/tags/TagStore";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { anchorEntityId } from "../../../store/anchor/anchorEntityId";
import type { TRect } from "../../../utils/types/shapes";
import { isWithinComponent, pointerTargetAfter } from "../EventedComponent/EventedComponent";
import type { TGraphComponentProps } from "../GraphComponent";
import { Anchor } from "../anchors";
import type { TAnchor, TAnchorClass } from "../anchors";
import { Block } from "../blocks/Block";
import type { TBlock } from "../blocks/Block";

import { SceneComponent } from "./SceneComponent";
import { Box, TestLayer, boxSource, frames } from "./sceneTestKit";
import type { TBoxProps, TBoxSource } from "./sceneTestKit";

const EVENTS = ["click", "mouseenter", "mouseleave", "mouseover", "mouseout"] as const;

/** Every component event of the current test, as `listener:type:target`, in the order they arrive. */
let events: string[] = [];

const targetOf = (event: Event): unknown => (event as CustomEvent<{ target?: unknown }>).detail?.target;

type TChipProps = TGraphComponentProps & {
  id: string;
  /** Left edge of its 20 x 10 look in its parent's frame; its top is at 10. */
  x: number;
  look?: boolean;
  /** Stops the propagation of its clicks. */
  stop?: boolean;
  inner?: ChildDescriptor[];
};

type TChipView = { x: number; look: boolean; width: number };

/** The chips of the next box, set by each test before it mounts one. */
let chips: ChildDescriptor[] = [];

/**
 * A box with chips that logs the events it gets, its own and its chips' bubbling up, as `box:type:target`. It puts
 * `hoveredTag` on itself while the target is the box or one of its chips (`Block`'s recipe, D5).
 */
class ChipBox extends Box {
  public chipWidth = 20;

  constructor(props: TBoxProps, parent: Component) {
    super(props, parent);
    EVENTS.forEach((type) => {
      this.addEventListener(type, (event: Event) => events.push(`box:${type}:${nameOf(targetOf(event))}`));
    });
  }

  public refreshChildren(): void {
    this.invalidateChildren();
  }

  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  public setChips(next: ChildDescriptor[]): void {
    chips = next;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(isWithinComponent(this, pointerTargetAfter(event)));
    }
  }

  protected override updateChildren(): ChildDescriptor[] {
    return chips;
  }
}

/**
 * A child chip: a 20 x 10 rect drawn on every level (one schematic list), logging the events it gets. It puts
 * `hoveredTag` on itself while it is the pointer's target (the recipe for a child, D5).
 */
class Chip extends SceneComponent<TChipView, TChipProps> {
  public static override entityType = "chip";

  public override readonly cursor = "pointer";

  constructor(props: TChipProps, parent: Component) {
    super(props, parent);
    EVENTS.forEach((type) => {
      this.addEventListener(type, (event: Event) => {
        events.push(`${this.props.id}:${type}:${nameOf(targetOf(event))}`);
        if (type === "click" && this.props.stop) event.stopPropagation();
        if (type === "mouseenter" || type === "mouseleave") this.setHoveredTag(pointerTargetAfter(event) === this);
      });
    });
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  public show(): void {
    this.setVisibility(true, { removeHitbox: true });
  }

  /** An HTML view draws it instead (`setRenderDelegated`): hidden in the scene, its hit box kept. */
  public delegate(delegated: boolean): void {
    this.setRenderDelegated(delegated);
  }

  public touch(): void {
    this.performRender();
  }

  protected override propsChanged(next: TChipProps): void {
    this.shouldUpdateChildren = true;
    super.propsChanged(next);
  }

  protected override getViewData(): TChipView {
    const box = this.getParent();
    return { x: this.props.x, look: this.props.look ?? true, width: box instanceof ChipBox ? box.chipWidth : 20 };
  }

  protected override schematic(view: TChipView): readonly TScenePrimitive[] {
    return view.look ? [{ kind: "rect", part: "chip", x: view.x, y: 10, width: view.width, height: 10 }] : [];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** The id a log entry gives an event's target: a chip's id, "box", or "none" (the camera or no target). */
function nameOf(component: unknown): string {
  if (component instanceof Chip) return component.props.id;
  if (component instanceof ChipBox) return "box";
  return "none";
}

/** A chip without a look and a hit rect of its own; a look-less child declares where it is hit (`hitLevels`). */
class HitChip extends Chip {
  public static override hitLevels: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override getHitRect(_bounds: TTileRect | undefined): TRect | undefined {
    return { x: 70, y: 10, width: 20, height: 10 };
  }
}

/** An element owner without primitives: it sets its own hit box (Box's) and draws nothing. */
class Frame extends ChipBox {
  protected override minimalistic(): TScenePrimitive[] {
    return [];
  }

  protected override schematic(): TScenePrimitive[] {
    return [];
  }
}

/** A badge drawn right of its anchor's point (x 14..22), outside the anchor's own hit square of +-11 world units. */
class AnchorBadge extends SceneComponent<object, TGraphComponentProps & { id: string }> {
  public static override entityType = "badge";

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override getViewData(): object {
    return {};
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "badge", x: 14, y: -4, width: 8, height: 8 }];
  }
}

/** An anchor with a child: its badge. */
class BadgeAnchor extends Anchor {
  protected override updateChildren(): ChildDescriptor[] {
    return [AnchorBadge.create({ id: this.getEntityId() }, { key: "badge" })];
  }
}

class BadgeBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return BadgeAnchor;
  }
}

/** A block that is not hovered over its anchors: the documented override of `Block.isHoveredBy`. */
class SelfHoverBlock extends Block {
  protected override isHoveredBy(target: unknown): boolean {
    return target === this;
  }
}

/**
 * A block that keeps its own events to itself, as a consumer's `dispatchEvent` override does (facts §9): while
 * interactive it fires its own listeners and lets nothing walk on, so its own events skip the parent walk.
 */
class KeepingBlock extends Block {
  protected override willMount(): void {
    // A hover state of its own, set from its own enter and leave.
    this.addEventListener("mouseenter", () => undefined);
    this.addEventListener("mouseleave", () => undefined);
    super.willMount();
  }

  public override dispatchEvent(event: Event): boolean {
    if (!this.isInteractive()) return this._dipping(this, event);
    if (this._hasListener(this, event.type)) this._fireEvent(this, event);
    return false;
  }
}

/** The migration guide's recipe (Task 12): the same stopping, and its own events reach the hover hook first (D5). */
class AdaptedKeepingBlock extends KeepingBlock {
  public override dispatchEvent(event: Event): boolean {
    if (!this.isInteractive()) return this._dipping(this, event);
    this.onDispatchedEvent(event);
    if (this._hasListener(this, event.type)) this._fireEvent(this, event);
    return false;
  }
}

describe("child scene components", () => {
  let graph: Graph;
  let box: ChipBox | undefined;
  let source: TBoxSource;
  const kept: Record<string, Chip> = {};
  const keep =
    (id: string) =>
    (chip: Chip): void => {
      kept[id] = chip;
    };
  const chip = (id: string, x: number, extra: Partial<TChipProps> = {}): ChildDescriptor =>
    Chip.create({ id, x, ...extra }, { key: id, ref: keep(id) });

  function mount(children: ChildDescriptor[]): void {
    chips = children;
    events = [];
    source = boxSource("box");
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    graph.addLayer(TestLayer, {
      children: [
        ChipBox.create(
          { id: "b", source },
          {
            ref: (component: ChipBox): void => {
              box = component;
            },
          }
        ),
      ],
    });
    frames(5);
  }

  const childIds = (): string[] => graph.scene.store.childrenOf(entityKey("box", "b")).map((element) => element.id);
  const chipKey = (id: string): string => entityKey("chip", id);
  /** A pointer move to a world point (scale 1, camera at the origin: world = client). */
  const move = (x: number, y: number): void =>
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
  /** The enter and leave entries so far; the log is cleared. */
  const take = (): string[] => {
    const taken = events.filter((entry) => /:mouse(enter|leave):/.test(entry));
    events = [];
    return taken;
  };
  const tagged = (type: string, id: string): boolean => graph.scene.tags.peekOf(type, id).has(hoveredTag);

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("draws a child in its parent's element, in child order, at its parent's origin", () => {
    mount([chip("c1", 5), chip("c2", 40)]);
    expect(childIds()).toEqual([chipKey("c1"), chipKey("c2")]);
    const element = (): ReturnType<Graph["scene"]["store"]["get"]> => graph.scene.store.get(chipKey("c1"));
    expect([element()?.x, element()?.y]).toEqual([0, 0]);
    source.x.value = 300;
    frames(3);
    expect([element()?.x, element()?.y]).toEqual([300, 0]);
    expect(graph.getElementOverPoint({ x: 315, y: 15 })).toBe(kept.c1);
  });

  it("is the pointer's target over its look, above its parent; its click bubbles to the parent unless stopped", () => {
    mount([chip("c1", 5), chip("stop", 40, { stop: true })]);
    expect(graph.getElementOverPoint({ x: 15, y: 15 })).toBe(kept.c1);
    expect(graph.getElementOverPoint({ x: 60, y: 30 })).toBe(box);
    kept.c1.dispatchEvent(new CustomEvent("click", { detail: { target: kept.c1 } }));
    kept.stop.dispatchEvent(new CustomEvent("click", { detail: { target: kept.stop } }));
    // The child's handler runs first, then the parent's through the parent walk; a stopped click stays with the child.
    expect(events).toEqual(["c1:click:c1", "box:click:c1", "stop:click:stop"]);
  });

  it("nests to any depth: the pre-order, a reorder moves the subtree, a late child lands after its parent's", () => {
    mount([chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] })] }), chip("z", 80)]);
    expect(childIds()).toEqual([chipKey("a"), chipKey("a1"), chipKey("a11"), chipKey("z")]);
    expect(graph.scene.store.get(chipKey("a11"))?.nestedIn).toBe(chipKey("a1"));
    expect(graph.getElementOverPoint({ x: 60, y: 15 })).toBe(kept.a11);
    box?.setChips([chip("z", 80), chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] })] })]);
    frames(3);
    expect(childIds()).toEqual([chipKey("z"), chipKey("a"), chipKey("a1"), chipKey("a11")]);
    box?.setChips([
      chip("z", 80),
      chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] }), chip("a2", 45)] }),
    ]);
    frames(3);
    expect(childIds()).toEqual([chipKey("z"), chipKey("a"), chipKey("a1"), chipKey("a11"), chipKey("a2")]);
  });

  it("hides what is nested in a hidden child, and writes the nested elements again after a re-add", () => {
    mount([chip("a", 5, { inner: [chip("a1", 30)] })]);
    kept.a.hide();
    frames(2);
    const all = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    expect(graph.scene.store.query(all).map((element) => element.id)).toEqual([entityKey("box", "b")]);
    // An element deleted behind its component (its nested ones go with it): the component's update adds it again,
    // and its children write theirs again.
    graph.scene.store.delete(chipKey("a"));
    kept.a.touch();
    frames(3);
    expect(childIds()).toEqual([chipKey("a"), chipKey("a1")]);
  });

  it("keeps a hidden child's removed hit box out of hit tests and the usable rect until it is shown again", () => {
    mount([chip("c1", 5)]);
    const usableWidth = (): number => graph.hitTest.$usableRect.value.width;
    expect(usableWidth()).toBe(100);
    kept.c1.hide();
    frames(3);
    // A geometry patch while hidden (the look moves to x 5000..5020) keeps the box out.
    box?.setChips([chip("c1", 5000)]);
    frames(3);
    expect(usableWidth()).toBe(100);
    expect(graph.getElementOverPoint({ x: 5010, y: 15 })).toBeUndefined();
    // Shown again: the box comes back where the look is now.
    kept.c1.show();
    frames(3);
    expect(graph.getElementOverPoint({ x: 5010, y: 15 })).toBe(kept.c1);
    expect(usableWidth()).toBe(5020);
  });

  it("keeps a delegated child's hit box and moves it with its look", () => {
    mount([chip("c1", 5)]);
    kept.c1.delegate(true);
    frames(3);
    expect(graph.getElementOverPoint({ x: 15, y: 15 })).toBe(kept.c1);
    box?.setChips([chip("c1", 200)]);
    frames(3);
    expect(graph.getElementOverPoint({ x: 210, y: 15 })).toBe(kept.c1);
    expect(graph.hitTest.$usableRect.value.width).toBe(220);
  });

  it("gets no hit box without a look, and the one it declares", () => {
    mount([chip("plain", 5, { look: false }), HitChip.create({ id: "hit", x: 70, look: false }, { key: "hit" })]);
    expect(graph.getElementOverPoint({ x: 15, y: 15 })).toBe(box);
    expect(graph.scene.store.get(entityKey("chip", "hit"))?.primitives).toEqual([]);
    const view = graph.getElementsOverPoint({ x: 80, y: 15 }).find((item) => item instanceof HitChip);
    // getHitBox() is [x, y, width, height].
    expect(view?.getHitBox().slice(0, 4)).toEqual([70, 10, 20, 10]);
  });

  it("reads its view data again when its parent invalidates its children", () => {
    mount([chip("c1", 5)]);
    const width = (): number | undefined => {
      const [primitive] = graph.scene.store.get(chipKey("c1"))?.primitives ?? [];
      return primitive?.kind === "rect" ? primitive.width : undefined;
    };
    expect(width()).toBe(20);
    if (box) box.chipWidth = 30;
    frames(2);
    expect(width()).toBe(20);
    box?.refreshChildren();
    frames(2);
    expect(width()).toBe(30);
  });

  it("reports two children with one key in development builds", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mount([Chip.create({ id: "x", x: 5 }, { key: "same" }), Chip.create({ id: "y", x: 40 }, { key: "same" })]);
    expect(error.mock.calls.filter(([message]) => String(message).includes('share the key "same"'))).toHaveLength(1);
  });

  describe("hover events (D5) and hoveredTag", () => {
    it("bubbles a child's enter and leave to its parent; the box stays tagged over a chip, a chip while target", () => {
      mount([chip("c1", 5), chip("c2", 40)]);
      move(60, 30);
      expect(take()).toEqual(["box:mouseenter:box"]);
      move(15, 15);
      // The box's own leave (its relatedTarget is c1, inside the box), then c1's enter, bubbling up to the box.
      expect(take()).toEqual(["box:mouseleave:box", "c1:mouseenter:c1", "box:mouseenter:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, true]);
      move(50, 15);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "c2:mouseenter:c2", "box:mouseenter:c2"]);
      expect([tagged("box", "b"), tagged("chip", "c1"), tagged("chip", "c2")]).toEqual([true, false, true]);
      move(500, 500);
      expect(take()).toEqual(["c2:mouseleave:c2", "box:mouseleave:c2"]);
      expect([tagged("box", "b"), tagged("chip", "c2")]).toEqual([false, false]);
    });

    it("gives the related target: the other side of the change, none for the camera", () => {
      mount([chip("c1", 5)]);
      const related: string[] = [];
      const relatedOf = (event: Event): unknown =>
        (event as CustomEvent<{ relatedTarget?: unknown }>).detail?.relatedTarget;
      box?.addEventListener("mouseleave", (event: Event) => related.push(`leave:${nameOf(relatedOf(event))}`));
      box?.addEventListener("mouseenter", (event: Event) => related.push(`enter:${nameOf(relatedOf(event))}`));
      move(60, 30);
      move(15, 15);
      move(500, 500);
      // Enter the box from the camera; leave it for c1 and enter c1 from it; leave c1 for the camera.
      expect(related).toEqual(["enter:none", "leave:c1", "enter:box", "leave:none"]);
    });

    it("sends the graph's hover events with both sides of the change, only for the sides that exist", () => {
      mount([chip("c1", 5)]);
      const bus: string[] = [];
      // `relatedTarget` is typed on the bus's `GraphMouseEvent` (`graphEvents.ts`): typecheck checks these lines.
      graph.on("mouseenter", (event) => {
        bus.push(`enter:${nameOf(event.detail.target)}:${nameOf(event.detail.relatedTarget)}`);
      });
      graph.on("mouseleave", (event) => {
        bus.push(`leave:${nameOf(event.detail.target)}:${nameOf(event.detail.relatedTarget)}`);
      });
      // The first entry has no old side, so no leave (HEAD's bus named the new target in a false one).
      move(60, 30);
      expect(bus.splice(0)).toEqual(["enter:box:none"]);
      move(15, 15);
      expect(bus.splice(0)).toEqual(["leave:box:c1", "enter:c1:box"]);
      // The root exit has no new side, so no enter.
      graph.getGraphLayer().handleEvent(new MouseEvent("mouseleave"));
      expect(bus.splice(0)).toEqual(["leave:c1:none"]);
    });

    it("finds the target again under a still pointer: a child's look goes, moves away, the child unmounts", () => {
      mount([chip("c1", 5)]);
      move(15, 15);
      take();
      box?.setChips([chip("c1", 5, { look: false })]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, false]);

      // `look: true` explicitly: a reconcile merges the new props into the old ones (`setProps`), so a descriptor
      // without `look` would keep `look: false`.
      box?.setChips([chip("c1", 5, { look: true })]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(kept.c1);
      take();
      // The look moves away from the pointer: its automatic hit rect changes geometry (re-review 5).
      box?.setChips([chip("c1", 60)]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);

      box?.setChips([chip("c1", 5)]);
      frames(3);
      take();
      box?.setChips([]);
      frames(3);
      // An unmounted child gets no event and takes its own tag off; the box is entered as the new target.
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["box:mouseenter:box"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, false]);
    });

    it("ends the box's hover when a chip that sticks out of it is removed under a still pointer", () => {
      // "out" draws at 110-130, right of the box's 100 x 50 hit box.
      mount([chip("c1", 5), chip("out", 110)]);
      move(120, 15);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(kept.out);
      expect([tagged("box", "b"), tagged("chip", "out")]).toEqual([true, true]);
      take();
      box?.setChips([chip("c1", 5)]);
      frames(3);
      // The pointer is over the camera now. The removed chip gets nothing; the box, the nearest graph component above
      // it, takes its place as the old side and gets the leave (round 3, finding 3).
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual(["box:mouseleave:box"]);
      expect([tagged("box", "b"), tagged("chip", "out")]).toEqual([false, false]);
    });

    it("changes the target to none when the pointer leaves the root, straight from a child, and back", () => {
      mount([chip("c1", 5)]);
      move(15, 15);
      take();
      graph.getGraphLayer().handleEvent(new MouseEvent("mouseleave"));
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
      // The exit has no new side: leaves only.
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([false, false]);
      // Back in: enters only. HEAD's helper sent the new target a leave first (round 3, finding 2).
      move(15, 15);
      expect(take()).toEqual(["c1:mouseenter:c1", "box:mouseenter:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, true]);
    });

    it("finds no target after a root exit when the camera moves, also after a capture's release outside", () => {
      mount([chip("c1", 5)]);
      graph.updateSettings({ emulateMouseEventsOnCameraChange: true });
      const layer = graph.getGraphLayer();
      move(15, 15);
      layer.handleEvent(new MouseEvent("mouseleave"));
      take();
      // c1 stays under the last position (world 16, 15): the emulation must not enter it from outside the root.
      graph.cameraService.set({ x: -1 });
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual([]);
      // A drag on c1 leaves the root; its release ends the hover outside, and a later camera move finds nothing.
      move(15, 15);
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 15, clientY: 15 }));
      layer.captureEvents(kept.c1);
      layer.handleEvent(new MouseEvent("mouseleave"));
      take();
      layer.handleEvent(new MouseEvent("mouseup", { clientX: 15, clientY: 15 }));
      layer.releaseCapture();
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1"]);
      graph.cameraService.set({ x: -2 });
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual([]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([false, false]);
    });

    it("keeps the latest pointer position during a capture and finds the target again at its release", () => {
      mount([chip("c1", 5)]);
      const layer = graph.getGraphLayer();
      move(15, 15);
      // A press on the chip, then the drag listener's capture (`dragListener.ts:166`).
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 15, clientY: 15 }));
      layer.captureEvents(kept.c1);
      // A drag moves the pointer onto the body: the captured chip stays the target.
      move(60, 30);
      frames(2);
      expect(layer.$hoveredComponent.value).toBe(kept.c1);
      take();
      // The drag listener releases the capture on mouseup (`dragListener.ts:209`), with no mousemove after it.
      layer.handleEvent(new MouseEvent("mouseup", { clientX: 60, clientY: 30 }));
      layer.releaseCapture();
      frames(3);
      expect(layer.$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);
    });

    it("finds the target again at a capture's release from the latest position, after a short move off a child", () => {
      // c1 spans x 5..25; a point query reaches 1 world unit around the point, so x 25 hits it and x 27 does not.
      mount([chip("c1", 5)]);
      const layer = graph.getGraphLayer();
      move(15, 15);
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 15, clientY: 15 }));
      layer.captureEvents(kept.c1);
      move(25, 15);
      // 2 px: under the 3 px a target query waits for, but the position is the latest one.
      move(27, 15);
      layer.handleEvent(new MouseEvent("mouseup", { clientX: 27, clientY: 15 }));
      layer.releaseCapture();
      frames(3);
      expect(layer.$hoveredComponent.value).toBe(box);
    });

    it("reads no canvas rect for moves under the 3 px throttle; a retarget converts the latest one", () => {
      mount([chip("c1", 5)]);
      const layer = graph.getGraphLayer();
      move(15, 15);
      expect(layer.$hoveredComponent.value).toBe(kept.c1);
      const reads = jest.spyOn(layer.getCanvas(), "getBoundingClientRect");
      // Three short moves (1, 2 and 2 px from the last queried position): no target query, no rect read.
      move(16, 15);
      move(17, 15);
      move(13, 15);
      expect(reads).not.toHaveBeenCalled();
      // The chip goes from under the still pointer: the retarget converts the latest position once.
      box?.setChips([chip("c1", 60)]);
      frames(3);
      expect(layer.$hoveredComponent.value).toBe(box);
      expect(reads).toHaveBeenCalledTimes(1);
    });

    it("tags an anchor only while it is the target, not while its child is, and passes hover on to the block", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents: { Badged: BadgeBlock } } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const block: TBlock = {
        id: "a",
        is: "Badged",
        name: "a",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: "a", type: "OUT" }],
      };
      graph.setEntities({ blocks: [block], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      // The OUT anchor's point is (300, 188), client (150, 94); its badge covers x 314..322, client x 157..161.
      move(100, 75);
      move(159, 94);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeInstanceOf(AnchorBadge);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, false]);
      move(150, 94);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeInstanceOf(BadgeAnchor);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, true]);
      move(159, 94);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, false]);
    });

    it("tags a non-interactive anchor and its block as before (the tag does not follow interactivity)", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const block: TBlock = {
        id: "a",
        is: "Block",
        name: "a",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: "a", type: "OUT" }],
      };
      graph.setEntities({ blocks: [block], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
      anchor?.setInteractive(false);
      for (let i = 0; i < 2; i++) globalScheduler.performUpdate();
      move(100, 75);
      move(150, 94);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(anchor);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, true]);
      move(100, 75);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, false]);
    });

    it("keeps a block hovered while the pointer is on its anchor, unless its class decides by target", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents: { Self: SelfHoverBlock } } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const anchored = (id: string, x: number, is = "Block"): TBlock => ({
        id,
        is,
        name: id,
        x,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: id, type: "OUT" }],
      });
      graph.setEntities({ blocks: [anchored("a", 100), anchored("s", 500, "Self")], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      // At scale 0.5 an OUT anchor's point (x + 200, 188) is at client ((x + 200) / 2, 94); a body at (x / 2 + 50, 75).
      move(100, 75);
      move(150, 94);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(
        graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent()
      );
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, true]);
      move(100, 75);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, false]);
      move(300, 75);
      move(350, 94);
      expect(tagged("block", "s")).toBe(false);
      move(300, 75);
      expect(tagged("block", "s")).toBe(true);
    });

    it("finds the target again when an anchor or its block moves through the API under a still pointer", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const out = (id: string): TAnchor => ({ id, blockId: "a", type: "OUT" });
      const block: TBlock = { id: "a", is: "Block", name: "a", x: 100, y: 100, width: 200, height: 100, anchors: [] };
      graph.setEntities({ blocks: [{ ...block, anchors: [out("o1"), out("o2")] }], connections: [] });
      const update = (): void => {
        for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      };
      update();
      const layer = graph.getGraphLayer();
      const state = graph.rootStore.blocksList.getBlockState("a");
      const o2 = state?.getAnchorById("o2")?.getViewComponent();
      // The second OUT anchor's point is (300, 220): GRID_SIZE * 2 below the first one's (300, 188). Client (150, 110).
      move(150, 110);
      expect(layer.$hoveredComponent.value).toBe(o2);
      // Without o1, o2 is the first OUT anchor, at (300, 188): only its own hit box moves (`onPositionChanged`); the
      // block's stays. No mousemove and no capture follow (round 3, finding 4).
      graph.api.updateBlock({ id: "a", anchors: [out("o2")] });
      update();
      // The same component, keyed by its id: a moved box, not a removal.
      expect(state?.getAnchorById("o2")?.getViewComponent()).toBe(o2);
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "o2"))]).toEqual([false, false]);
      // The block moves away from a still pointer on its body through the API: its own hit box moves.
      move(100, 75);
      expect(layer.$hoveredComponent.value).toBe(state?.getViewComponent());
      graph.api.updateBlock({ id: "a", x: 400 });
      update();
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(tagged("block", "a")).toBe(false);
    });

    it("keeps a block's hover consistent when its class keeps its own events, with the migration recipe", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      const blockComponents = { Keeping: KeepingBlock, Adapted: AdaptedKeepingBlock };
      graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const anchored = (id: string, x: number, is: string): TBlock => ({
        id,
        is,
        name: id,
        x,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: id, type: "OUT" }],
      });
      graph.setEntities({ blocks: [anchored("k", 100, "Keeping"), anchored("ad", 500, "Adapted")], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      /** The block's tag after each move of body, anchor, body, outside (client points at scale 0.5, as above). */
      const route = (id: string, x: number): boolean[] =>
        [
          [x / 2 + 50, 75],
          [(x + 200) / 2, 94],
          [x / 2 + 50, 75],
          [x / 2 + 50, 10],
        ].map(([clientX, clientY]) => {
          move(clientX, clientY);
          return tagged("block", id);
        });
      // The recipe calls the hook for its own events: hovered over its body and its anchor, not outside.
      expect(route("ad", 500)).toEqual([true, true, true, false]);
      // Without it, its own enter and leave skip the hook and only its anchor's events reach it: not hovered over its
      // body, and still hovered outside (round 3, finding 6).
      expect(route("k", 100)).toEqual([false, true, true, true]);
    });
  });
});

describe("an element owner without primitives (spec §5.1)", () => {
  it("keeps a key, a hit box, events and the usable rect", () => {
    chips = [];
    events = [];
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    let frame: Frame | undefined;
    graph.addLayer(TestLayer, {
      children: [
        Frame.create(
          { id: "f", source: boxSource("frame") },
          {
            ref: (component: Frame): void => {
              frame = component;
            },
          }
        ),
      ],
    });
    frames(5);
    expect(frame?.getSceneKey()?.elementId).toBe(entityKey("box", "f"));
    expect(graph.scene.store.get(entityKey("box", "f"))?.primitives).toEqual([]);
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(frame);
    frame?.dispatchEvent(new CustomEvent("click", { detail: { target: frame } }));
    expect(events).toEqual(["box:click:box"]);
    expect(graph.hitTest.$usableRect.value).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    graph.unmount();
  });
});
