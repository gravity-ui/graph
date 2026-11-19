import { effect } from "@preact/signals-core";

import { Graph } from "../../../../graph";
import type { Component } from "../../../../lib/Component";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import { Layer } from "../../../../services/Layer";
import type { LayerProps } from "../../../../services/Layer";
import { entityKey } from "../../../../services/tags/TagStore";
import type { AnchorState } from "../../../../store/anchor/Anchor";
import { createAnchorPortId } from "../../../../store/connection/port/utils";
import type { TPoint } from "../../../../utils/types/shapes";
import { Anchor } from "../../anchors";
import type { TAnchor, TAnchorClass, TAnchorProps, TAnchorView } from "../../anchors";
import { Block } from "../Block";
import type { TBlockComponentState } from "../Block";
import { exportAnchorStats } from "../Blocks";
import { LegacyCanvasBlock } from "../LegacyCanvasBlock";

import { FAR, NEAR, anchored, frames, startAnchoredGraph } from "./utils/anchoredGraph";

type TCanvasEvent = { type: string; props: Record<string, unknown> };

function events(canvas: HTMLCanvasElement): TCanvasEvent[] {
  return (canvas.getContext("2d") as unknown as { __getEvents(): TCanvasEvent[] }).__getEvents();
}

/** Circles drawn: the default block look draws none (its badge is hidden), so these are anchor dots. */
const arcs = (canvas: HTMLCanvasElement): number => events(canvas).filter((event) => event.type === "arc").length;

const fills = (canvas: HTMLCanvasElement): unknown[] =>
  events(canvas)
    .filter((event) => event.type === "fillStyle")
    .map((event) => event.props.value);

/** A square of its own colour instead of the default dot and ring. */
class SquareAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -4, y: -4, width: 8, height: 8, fill: "#00ff00" }];
  }
}

/** Draws a look at the minimalistic level too (a subclass of the far-zoom kind the anchors docs describe). */
class FarAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -4, y: -4, width: 8, height: 8, fill: "#0000ff" }];
  }
}

/** A look far wider than the default anchor's (11.5 world units), with the reach declared. */
class WideAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  public static override LOOK_EXTENT = 100;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: WideAnchor.LOOK_EXTENT, fill: "#ff00ff" }];
  }
}

/** The same wide look without a declared reach: it keeps `Anchor.LOOK_EXTENT`. */
class UndeclaredWideAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 100, fill: "#ff00ff" }];
  }
}

/**
 * A level method as an instance property: TypeScript accepts it (TS2425 forbids only a method over a property), but
 * `Anchor.drawsOnLevel` reads the prototype and cannot see it, so the development check reports it.
 */
class FieldLevelAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  protected override minimalistic = (): readonly TScenePrimitive[] => [
    { kind: "rect", part: "anchor", x: -4, y: -4, width: 8, height: 8, fill: "#0000ff" },
  ];

  protected override detailed = (): readonly TScenePrimitive[] => [
    { kind: "rect", part: "anchor", x: -4, y: -4, width: 8, height: 8, fill: "#00ffff" },
  ];
}

/** A small look with its reach declared; `DataChosenBlock` picks it or `WideAnchor` from its data. */
class SmallAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  public static override LOOK_EXTENT = 4;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 2, fill: "#00ff00" }];
  }
}

/** Anchors at the top corners of a block whose class comes from `wide`, a value its pending props decide. */
abstract class PropsChosenBlock extends Block {
  public override getAnchorPosition(anchor: TAnchor): TPoint {
    return { x: anchor.id === "out" ? this.connectedState.width : 0, y: 0 };
  }

  protected abstract isWide(): boolean;

  protected override getAnchorClass(): TAnchorClass {
    return this.isWide() ? WideAnchor : SmallAnchor;
  }
}

/** `propsChanged()` derives `meta.wide` from a prop and queues it as state; the class follows `this.state`. */
class PropsDerivedStateBlock extends PropsChosenBlock {
  protected override isWide(): boolean {
    return Boolean((this.state.meta as { wide?: boolean } | undefined)?.wide);
  }

  protected override propsChanged(next: Parameters<Block["propsChanged"]>[0]): void {
    super.propsChanged(next);
    if ((next as { flag?: boolean }).flag) this.setState({ meta: { wide: true } });
  }
}

/** The class follows view data derived from a prop, read through `readSceneView()` (a cached computed). */
class PropsViewDataBlock extends PropsChosenBlock {
  protected override isWide(): boolean {
    return Boolean((this.readSceneView() as { wide?: boolean } | undefined)?.wide);
  }

  protected override getViewData(): ReturnType<Block["getViewData"]> {
    const data: ReturnType<Block["getViewData"]> & { wide?: boolean } = super.getViewData();
    data.wide = Boolean((this.props as { flag?: boolean }).flag);
    return data;
  }
}

/** `FieldLevelAnchor` again: the development warning fires once per class, and another test checks it. */
class FieldExportAnchor<T extends TAnchorProps = TAnchorProps> extends FieldLevelAnchor<T> {}

/** Anchors at the block's top corners, as `SmallAnchor` or `WideAnchor` by `meta.wide`: read from `this.state`. */
class DataChosenBlock extends Block {
  public override getAnchorPosition(anchor: TAnchor): TPoint {
    return { x: anchor.id === "out" ? this.connectedState.width : 0, y: 0 };
  }

  protected override getAnchorClass(): TAnchorClass {
    return (this.state.meta as { wide?: boolean } | undefined)?.wide ? WideAnchor : SmallAnchor;
  }
}

/** Switches of `BrokenAnchor`, and how often its instances mounted. */
const broken = { on: false, mounts: 0 };

/**
 * While `broken.on`, its constructor throws for the "out" anchor after Anchor's constructor bound it to its anchor
 * state and queued its first state (Codex 17g finding 2).
 */
class BrokenAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  constructor(props: T, parent: Component) {
    super(props, parent);
    if (broken.on && props.id === "out") throw new Error("anchor constructor failed");
  }

  protected override willMount(): void {
    broken.mounts++;
    super.willMount();
  }
}

/** Renders its anchors as `anchorClass`. */
class ClassAnchorBlock extends Block {
  protected anchorClass: TAnchorClass = Anchor;

  protected override getAnchorClass(): TAnchorClass {
    return this.anchorClass;
  }
}

class SquareBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = SquareAnchor;
}

class FarBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = FarAnchor;
}

/** Its OUT anchor lies 300 world units left of the block. */
class OutlierBlock extends Block {
  public override getAnchorPosition(anchor: TAnchor): TPoint {
    return anchor.id === "out" ? { x: -300, y: 50 } : super.getAnchorPosition(anchor);
  }
}

/** Wide anchors at the block's top corners. */
class CornerWideBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = WideAnchor;

  public override getAnchorPosition(anchor: TAnchor): TPoint {
    return { x: anchor.id === "out" ? this.connectedState.width : 0, y: 0 };
  }
}

class UndeclaredWideBlock extends CornerWideBlock {
  protected override anchorClass: TAnchorClass = UndeclaredWideAnchor;
}

class FieldLevelBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = FieldLevelAnchor;
}

class FieldExportBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = FieldExportAnchor;
}

class BrokenAnchorBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = BrokenAnchor;
}

/** What the exporting test classes saw: their hook calls, and each export's image or error message. */
const hooks = {
  /** The rects an exporting hook exports, in order, at the schematic level. */
  rects: [] as { x: number; y: number; width: number; height: number }[],
  log: [] as string[],
  results: [] as { image?: HTMLCanvasElement; error?: string }[],
  /** `IterateExportBlock` exports in its next update while armed. */
  armed: false,
};

function exportFromHook(graph: Graph): void {
  for (const rect of hooks.rects) {
    try {
      hooks.results.push({ image: graph.scene.toImage({ rect, scale: 0.5, pixelRatio: 1, level: "schematic" }) });
    } catch (error) {
      hooks.results.push({ error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** Exports `hooks.rects` from its own stateChanged() when its name changes (Codex 17g finding 1). */
class StateExportBlock extends Block {
  protected override stateChanged(next: TBlockComponentState): void {
    if (next.name !== this.state.name) {
      hooks.log.push(`${this.props.id}:stateChanged:${next.name}`);
      exportFromHook(this.context.graph);
    }
    super.stateChanged(next);
  }
}

/** Logs its stateChanged() calls that change its name. */
class NameLogBlock extends Block {
  protected override stateChanged(next: TBlockComponentState): void {
    if (next.name !== this.state.name) hooks.log.push(`${this.props.id}:stateChanged:${next.name}`);
    super.stateChanged(next);
  }
}

/** Exports `hooks.rects` from its own willIterate() once armed; logs every willIterate() while armed. */
class IterateExportBlock extends Block {
  protected override willIterate(): void {
    super.willIterate();
    if (!hooks.armed) return;
    hooks.log.push(`${this.props.id}:willIterate`);
    if (hooks.log.length > 1) return;
    try {
      exportFromHook(this.context.graph);
    } finally {
      hooks.armed = false;
    }
  }
}

/** Exports `hooks.rects` from its render() once armed: in the frame, while no component update runs. */
class ExportLayer extends Layer {
  public armed = false;

  constructor(props: LayerProps) {
    super({ ...props, canvas: { zIndex: 9 } });
  }

  protected override render(): void {
    super.render();
    if (!this.armed) return;
    this.armed = false;
    hooks.log.push("layer:render");
    exportFromHook(this.props.graph);
  }
}

/**
 * Reads its component state in its view data (invalidated once the state is assigned): its first update applies
 * before the selection state its mount queues (`checkData()` runs before `willMount()`), so it needs a second one.
 */
class SelectionAwareAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  private drawnSelected = false;

  protected override willIterate(): void {
    if (this.state.selected !== this.drawnSelected) {
      this.drawnSelected = this.state.selected;
      this.invalidate();
    }
    super.willIterate();
  }

  protected override getViewData(): TAnchorView & { selected: boolean } {
    return { ...super.getViewData(), selected: this.state.selected };
  }

  protected override schematic(view: TAnchorView & { selected?: boolean }): readonly TScenePrimitive[] {
    return [{ kind: "rect", x: -4, y: -4, width: 8, height: 8, fill: view.selected ? "#ff0000" : "#888888" }];
  }
}

class AwareBlock extends ClassAnchorBlock {
  protected override anchorClass: TAnchorClass = SelectionAwareAnchor;
}

describe("toImage with lazily created anchors", () => {
  let graph: Graph;

  const anchorOf = (id: string, anchorId: string): Anchor | undefined =>
    graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId)?.getViewComponent();
  const anchorChildren = (id: string): number => graph.scene.store.childrenOf(entityKey("block", id)).length;
  /** Shows the world point (x, y) at the view's top left corner. */
  const lookAt = (x: number, y: number, scale: number): void =>
    graph.cameraService.set({ scale, x: -x * scale, y: -y * scale });
  /** Runs `probe` inside every export, after the blocks prepared it. */
  const duringExport = (probe: () => void): (() => void) =>
    graph.scene.addExportPreparer(() => {
      probe();
      return undefined;
    });
  const schematic = (rect: { x: number; y: number; width: number; height: number }): HTMLCanvasElement =>
    graph.scene.toImage({ rect, scale: 0.5, pixelRatio: 1, level: "schematic" });

  const blockOf = (id: string): Block | undefined => graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
  const anchorStates = (id: string): (AnchorState | undefined)[] =>
    ["in", "out"].map((anchorId) => graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId));
  const magenta = (canvas: HTMLCanvasElement): number => fills(canvas).filter((value) => value === "#ff00ff").length;

  afterEach(() => {
    graph.unmount();
    exportAnchorStats.enabled = false;
    exportAnchorStats.reset();
    jest.restoreAllMocks();
    hooks.rects = [];
    hooks.log = [];
    hooks.results = [];
    hooks.armed = false;
    broken.on = false;
    broken.mounts = 0;
  });

  it("gives the same picture before and after a schematic visit", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], FAR);
    const rect = { x: 0, y: 0, width: 6000, height: 400 };
    const before = schematic(rect);
    // Both anchors of both blocks appear in the export.
    expect(arcs(before)).toBe(4);

    graph.cameraService.set({ scale: NEAR });
    frames();
    lookAt(4900, 0, NEAR);
    frames();
    graph.cameraService.set({ scale: FAR, x: 0, y: 0 });
    frames();
    expect(anchorOf("near", "out")).toBeInstanceOf(Anchor);
    expect(anchorOf("far", "out")).toBeInstanceOf(Anchor);

    expect(events(schematic(rect))).toEqual(events(before));
  });

  it("keeps the anchors that existed and drops the ones it created, with their ports as they were", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], NEAR);
    graph.cameraService.set({ scale: FAR });
    frames();
    graph.api.addConnection({
      id: "nf",
      sourceBlockId: "near",
      sourceAnchorId: "out",
      targetBlockId: "far",
      targetAnchorId: "in",
    });
    frames();
    const kept = anchorOf("near", "out");
    expect(kept).toBeInstanceOf(Anchor);
    expect(anchorOf("far", "in")).toBeUndefined();
    const farBlock = graph.rootStore.blocksList.getBlockState("far")?.getViewComponent();
    const ports = graph.rootStore.connectionsList;
    const port = ports.getPort(createAnchorPortId("far", "in"));
    // A delegated port keeps mirroring its delegate.
    const delegated = ports.getPort(createAnchorPortId("far", "out"));
    const delegate = ports.getPort(createAnchorPortId("near", "in"));
    if (!port || !delegated || !delegate) throw new Error("missing ports");
    delegated.delegate(delegate);
    const before = { owner: port.owner, lookup: port.lookup, point: port.getPoint() };
    const geometry = graph.rootStore.connectionsList.getConnectionState("nf")?.$geometry.value;
    const elements = graph.scene.store.size;
    let during: Anchor | undefined;
    let duringChildren = 0;
    const remove = duringExport(() => {
      during = anchorOf("far", "in");
      duringChildren = anchorChildren("far");
    });

    schematic({ x: 0, y: 0, width: 6000, height: 400 });
    remove();

    expect(during).toBeInstanceOf(Anchor);
    expect(duringChildren).toBe(2);
    expect(during?.isMounted()).toBe(false);
    expect(anchorOf("far", "in")).toBeUndefined();
    expect(anchorChildren("far")).toBe(0);
    expect(anchorOf("near", "out")).toBe(kept);
    expect(kept?.isMounted()).toBe(true);
    expect(graph.scene.store.size).toBe(elements);
    expect(ports.getPort(createAnchorPortId("far", "in"))).toBe(port);
    expect(port.owner).toBe(farBlock);
    expect(before.owner).toBe(farBlock);
    expect(port.lookup).toBe(before.lookup);
    expect(port.getPoint()).toEqual(before.point);
    expect(delegated.isDelegated).toBe(true);
    expect(delegated.getPoint()).toEqual(delegate.getPoint());
    expect(graph.rootStore.connectionsList.getConnectionState("nf")?.$geometry.value).toEqual(geometry);

    // The hit test catches up with nothing of them, and the next frames create none at the minimalistic level.
    frames();
    const { x, y } = port.getPoint();
    const hit = graph.hitTest.testBox({ minX: x - 20, minY: y - 20, maxX: x + 20, maxY: y + 20 });
    expect(hit.some((item) => item instanceof Anchor)).toBe(false);
    expect(anchorOf("far", "in")).toBeUndefined();
  });

  it("gives a port the lookup it had, which a temporary anchor's mount and unmount reset", () => {
    graph = startAnchoredGraph([anchored("far", 100)], FAR);
    const port = graph.rootStore.connectionsList.getPort(createAnchorPortId("far", "in"));
    if (!port) throw new Error("missing port");
    const owner = port.owner;
    port.updatePort({ lookup: true });
    schematic({ x: 0, y: 0, width: 600, height: 400 });
    expect(port.owner).toBe(owner);
    expect(port.lookup).toBe(true);
  });

  it("drops the anchors it created when the draw throws, and the next export runs", () => {
    graph = startAnchoredGraph([anchored("far", 100)], FAR);
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    // The image's context is created inside toImage, after this: its setTransform throws.
    const setTransform = jest.spyOn(CanvasRenderingContext2D.prototype, "setTransform").mockImplementation(() => {
      throw new Error("draw failed");
    });
    let during: Anchor | undefined;
    const remove = duringExport(() => {
      during = anchorOf("far", "in");
    });
    expect(() => schematic(rect)).toThrow("draw failed");
    setTransform.mockRestore();
    remove();
    expect(during).toBeInstanceOf(Anchor);
    expect(during?.isMounted()).toBe(false);
    expect(anchorOf("far", "in")).toBeUndefined();
    expect(anchorChildren("far")).toBe(0);
    expect(arcs(schematic(rect))).toBe(2);
  });

  it("drops the anchors of the blocks it prepared when a later block's anchors throw", () => {
    graph = startAnchoredGraph([anchored("ok", 100), anchored("broken", 400, 100, "Broken")], FAR, {
      blockComponents: { Broken: BrokenAnchorBlock },
    });
    broken.on = true;
    const created = jest.spyOn(Block.prototype, "createExportAnchors");
    expect(() => schematic({ x: 0, y: 0, width: 1000, height: 400 })).toThrow("anchor constructor failed");
    // "ok" created its anchors before "broken" threw.
    expect(created.mock.results[0]).toEqual({ type: "return", value: true });
    expect(anchorOf("ok", "in")).toBeUndefined();
    expect(anchorChildren("ok")).toBe(0);
    expect(anchorChildren("broken")).toBe(0);
    // A rect without the broken block exports.
    expect(arcs(schematic({ x: 0, y: 0, width: 350, height: 400 }))).toBe(2);
  });

  it("asks a block's getAnchorClass() for its anchor classes, and an export fails when it throws", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    class NoAnchorsBlock extends Block {
      protected override getAnchorClass(): TAnchorClass {
        throw new Error("no anchors");
      }
    }
    graph = startAnchoredGraph([anchored("ok", 100), anchored("broken", 2000, 100, "Broken")], FAR, {
      blockComponents: { Broken: NoAnchorsBlock },
    });
    // The block's update read its classes and reported the failure once; with its classes unknown it is a candidate of
    // every export's search, and creating its anchors asks getAnchorClass() again.
    expect(error).toHaveBeenCalledTimes(1);
    expect(() => schematic({ x: 0, y: 0, width: 600, height: 400 })).toThrow("no anchors");
    expect(anchorChildren("ok")).toBe(0);
    expect(anchorOf("ok", "in")).toBeUndefined();
    error.mockRestore();
  });

  it("uses a subclass's anchor look", () => {
    graph = startAnchoredGraph([anchored("square", 100, 100, "Square")], FAR, {
      blockComponents: { Square: SquareBlock },
    });
    const image = schematic({ x: 0, y: 0, width: 600, height: 400 });
    expect(fills(image).filter((value) => value === "#00ff00")).toHaveLength(2);
    expect(anchorOf("square", "in")).toBeUndefined();
  });

  it("creates no default anchors for a level they draw nothing on, and a subclass's that draw there", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = startAnchoredGraph([anchored("plain", 100), anchored("far", 600, 100, "Far")], FAR, {
      blockComponents: { Far: FarBlock },
    });
    exportAnchorStats.enabled = true;
    const created: string[] = [];
    const remove = duringExport(() => {
      for (const id of ["plain", "far"]) if (anchorOf(id, "in")) created.push(id);
    });
    const rect = { x: 0, y: 0, width: 1000, height: 400 };
    const minimalistic = graph.scene.toImage({ rect, scale: FAR, pixelRatio: 1, level: "minimalistic" });
    expect(created).toEqual(["far"]);
    expect(exportAnchorStats.blocks).toBe(1);
    expect(fills(minimalistic).filter((value) => value === "#0000ff")).toHaveLength(2);

    created.length = 0;
    const detailed = graph.scene.toImage({ rect, scale: FAR, pixelRatio: 1, level: "detailed" });
    // Only the stock Anchor may skip a level: a subclass counts as drawing (it may draw there by other means), so its
    // temporary anchors exist for the export even though FarAnchor draws nothing at this level.
    expect(created).toEqual(["far"]);
    expect(fills(detailed).filter((value) => value === "#0000ff")).toHaveLength(0);
    remove();
    expect(anchorOf("far", "in")).toBeUndefined();
    // FarAnchor declares no CREATION_LEVELS: its temporary anchors draw on the minimalistic level, which development
    // builds report once, naming the class.
    const reports = warn.mock.calls
      .map(([message]) => String(message))
      .filter((text) => text.includes("CREATION_LEVELS"));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain("FarAnchor");
  });

  it("finds anchors outside their block, and an anchor whose look alone meets the rect", () => {
    graph = startAnchoredGraph([anchored("outlier", 1000, 100, "Outlier")], FAR, {
      blockComponents: { Outlier: OutlierBlock },
    });
    // The OUT anchor's point is (700, 150); the block is from x 1000.
    const port = graph.rootStore.connectionsList.getPort(createAnchorPortId("outlier", "out"));
    expect(port?.getPoint()).toEqual({ x: 700, y: 150 });
    expect(arcs(schematic({ x: 650, y: 100, width: 100, height: 100 }))).toBe(1);
    // The rect starts 5 units right of the point: only the dot (radius 9) reaches into it.
    expect(arcs(schematic({ x: 705, y: 100, width: 100, height: 100 }))).toBe(1);
    expect(arcs(schematic({ x: 730, y: 100, width: 100, height: 100 }))).toBe(0);
  });

  it("finds a block whose anchors' looks alone reach the rect by its anchor class's LOOK_EXTENT", () => {
    // The block starts 30 below the rect; its anchors' circles (radius 100, declared) reach into it.
    graph = startAnchoredGraph([anchored("wide", 100, 330, "Wide")], FAR, {
      blockComponents: { Wide: CornerWideBlock },
    });
    exportAnchorStats.enabled = true;
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    const before = schematic(rect);
    expect(exportAnchorStats.blocks).toBe(1);
    expect(magenta(before)).toBe(2);
    expect(anchorOf("wide", "in")).toBeUndefined();

    lookAt(0, 230, NEAR);
    frames();
    expect(anchorOf("wide", "in")).toBeInstanceOf(Anchor);
    graph.cameraService.set({ scale: FAR, x: 0, y: 0 });
    frames();
    expect(events(schematic(rect))).toEqual(events(before));
  });

  it("exports the current LOOK_EXTENT of an already selected anchor class without rereading getAnchorClass", () => {
    const extent = jest.replaceProperty(WideAnchor, "LOOK_EXTENT", 4);
    graph = startAnchoredGraph([anchored("wide", 100, 330, "Wide")], FAR, {
      blockComponents: { Wide: CornerWideBlock },
    });
    const select = jest.spyOn(
      CornerWideBlock.prototype as unknown as { getAnchorClass(): TAnchorClass },
      "getAnchorClass"
    );
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    expect(magenta(schematic(rect))).toBe(0);
    extent.replaceValue(100);
    expect(magenta(schematic(rect))).toBe(2);
    extent.replaceValue(4);
    expect(magenta(schematic(rect))).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });

  it("finds the anchors of a block whose pending data picks their class, and leaves its data as it was", () => {
    graph = startAnchoredGraph([anchored("data", 100, 330, "Data")], FAR, {
      blockComponents: { Data: DataChosenBlock },
    });
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    // The small class (extent 4) cannot reach the rect from 30 units below it.
    expect(magenta(schematic(rect))).toBe(0);
    graph.api.updateBlock({ id: "data", meta: { wide: true } });
    // The store has the change; the component applies it in its next frame. The export finds the wide class now.
    expect((blockOf("data")?.state.meta as { wide?: boolean } | undefined)?.wide).toBeFalsy();
    exportAnchorStats.enabled = true;
    const image = schematic(rect);
    expect(magenta(image)).toBe(2);
    expect(exportAnchorStats.blocks).toBe(1);
    expect(anchorOf("data", "in")).toBeUndefined();
    frames();
    expect((blockOf("data")?.state.meta as { wide?: boolean } | undefined)?.wide).toBe(true);
    expect(events(schematic(rect))).toEqual(events(image));
  });

  it.each([
    ["propsChanged() derives the state its class follows", "PropsState", PropsDerivedStateBlock],
    ["its view data derives from props, read through readSceneView()", "PropsView", PropsViewDataBlock],
  ])("finds the anchors of a block whose pending props pick their class: %s", (_name, is, klass) => {
    graph = startAnchoredGraph([anchored("p", 100, 330, is)], FAR, { blockComponents: { [is]: klass } });
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    expect(magenta(schematic(rect))).toBe(0);
    blockOf("p")?.setProps({ flag: true } as unknown as Parameters<Block["setProps"]>[0]);
    // Not applied yet: the export finds the wide class's anchors all the same.
    expect(magenta(schematic(rect))).toBe(2);
    expect(anchorOf("p", "in")).toBeUndefined();
    frames();
    expect(magenta(schematic(rect))).toBe(2);
  });

  it("gives instance-field level overrides the same anchors before and after a camera visit", () => {
    graph = startAnchoredGraph([anchored("field", 100, 100, "Field")], FAR, {
      blockComponents: { Field: FieldExportBlock },
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    const at = (level: "minimalistic" | "detailed"): HTMLCanvasElement =>
      graph.scene.toImage({ rect, scale: FAR, pixelRatio: 1, level });
    const before = { minimalistic: at("minimalistic"), detailed: at("detailed") };
    expect(fills(before.minimalistic).filter((value) => value === "#0000ff")).toHaveLength(2);
    expect(fills(before.detailed).filter((value) => value === "#00ffff")).toHaveLength(2);
    lookAt(0, 0, NEAR);
    frames();
    expect(anchorOf("field", "in")).toBeInstanceOf(FieldExportAnchor);
    graph.cameraService.set({ scale: FAR, x: 0, y: 0 });
    frames();
    expect(events(at("minimalistic"))).toEqual(events(before.minimalistic));
    expect(events(at("detailed"))).toEqual(events(before.detailed));
  });

  it("keeps the element bounds and raises no warning for an anchor created selected and then hovered", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = startAnchoredGraph([anchored("sel", 100), anchored("other", 600)], FAR);
    graph.rootStore.blocksList.getBlockState("sel")?.getAnchorById("in")?.setSelection(true);
    lookAt(0, 0, NEAR);
    frames();
    const created = anchorOf("sel", "in");
    expect(created).toBeInstanceOf(Anchor);
    const bounds = graph.scene.store.get(created?.getSceneElementId() ?? "")?.bounds;
    // The anchor's own hover event, as GraphLayer sends it to a target: the anchor tags itself.
    created?.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: created } }));
    frames();
    // Hovered, scaled by x1.8 as a style row: its element bounds, which the development check reads, are the same.
    // This says nothing about crop completeness: the scaled look can draw outside these bounds (tracked separately).
    expect(graph.scene.store.get(created?.getSceneElementId() ?? "")?.bounds).toEqual(bounds);
    expect(Math.max(bounds?.maxX ?? 0, bounds?.maxY ?? 0)).toBeLessThanOrEqual(Anchor.LOOK_EXTENT);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("LOOK_EXTENT"))).toEqual([]);
  });

  it("warns in development when an anchor's look reaches past its class's LOOK_EXTENT", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = startAnchoredGraph([anchored("wide", 100, 100, "Undeclared"), anchored("ok", 600, 100, "Wide")], FAR, {
      blockComponents: { Undeclared: UndeclaredWideBlock, Wide: CornerWideBlock },
    });
    schematic({ x: 0, y: 0, width: 1000, height: 400 });
    const reports = warn.mock.calls.map(([message]) => String(message)).filter((text) => text.includes("LOOK_EXTENT"));
    // Once for the class, not for each of its two anchors; nothing for the class that declares its reach.
    expect(reports).toEqual([
      expect.stringContaining("UndeclaredWideAnchor: its anchors' look reaches 100 world units from their point"),
    ]);
    expect(reports[0]).toContain("static override LOOK_EXTENT = 100");
  });

  it("warns in development when an anchor's level method is an instance property", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    // At the schematic level the camera creates its anchors.
    graph = startAnchoredGraph([anchored("field", 100, 100, "Field"), anchored("plain", 400)], NEAR, {
      blockComponents: { Field: FieldLevelBlock },
    });
    expect(anchorOf("field", "in")).toBeInstanceOf(FieldLevelAnchor);
    const reports = warn.mock.calls.map(([message]) => String(message)).filter((text) => text.includes("instance"));
    expect(reports).toEqual([
      expect.stringContaining("FieldLevelAnchor: minimalistic is an instance property, not a prototype method"),
    ]);
  });

  it("creates none for a block React draws", () => {
    graph = startAnchoredGraph([anchored("react", 100), anchored("canvas", 600)], FAR);
    exportAnchorStats.enabled = true;
    blockOf("react")?.setRenderDelegated(true);
    frames();
    const created: string[] = [];
    const remove = duringExport(() => {
      for (const id of ["react", "canvas"]) if (anchorOf(id, "in")) created.push(id);
    });
    // The block's element is hidden, so its anchors would draw nothing either: only "canvas" creates them.
    expect(arcs(schematic({ x: 0, y: 0, width: 1000, height: 400 }))).toBe(2);
    remove();
    expect(created).toEqual(["canvas"]);
    expect(exportAnchorStats.blocks).toBe(1);
  });

  it("drops every anchor of a failed export, the one whose constructor threw included", () => {
    graph = startAnchoredGraph([anchored("broken", 100, 100, "Broken")], FAR, {
      blockComponents: { Broken: BrokenAnchorBlock },
    });
    const block = blockOf("broken");
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    broken.on = true;
    // "in" is constructed, then "out" throws after binding itself to its anchor state and queueing its state.
    expect(() => schematic(rect)).toThrow("anchor constructor failed");
    broken.on = false;
    const states = anchorStates("broken");
    expect(states.map((state) => state?.getViewComponent())).toEqual([undefined, undefined]);
    expect(states.map((state) => state?.$viewComponentReady.value)).toEqual([false, false]);
    const ports = ["in", "out"].map((id) => graph.rootStore.connectionsList.getPort(createAnchorPortId("broken", id)));
    expect(ports.map((port) => port?.owner)).toEqual([block, block]);

    // Nothing of them mounts in later frames, and the block's records hold none of them.
    frames();
    expect(broken.mounts).toBe(0);
    expect(anchorChildren("broken")).toBe(0);
    expect(states.map((state) => state?.getViewComponent())).toEqual([undefined, undefined]);
    const hit = graph.hitTest.testBox({ minX: 0, minY: 0, maxX: 600, maxY: 400 });
    expect(hit.some((item) => item instanceof Anchor)).toBe(false);

    // The next export creates and drops both, as usual.
    expect(arcs(schematic(rect))).toBe(2);
    expect(broken.mounts).toBe(2);
    expect(states.map((state) => state?.getViewComponent())).toEqual([undefined, undefined]);
    expect(anchorChildren("broken")).toBe(0);
  });

  it.each([
    ["opacity", { opacity: 0 }],
    ["dim", { dim: 0.8 }],
  ])("gives anchors the element %s their block gains only at the export's level", (_name, style) => {
    graph = startAnchoredGraph([anchored("block", 100)], FAR);
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    const plain = fills(schematic(rect));
    graph.scene.styles.add([{ target: Block, scope: { levels: ["schematic"] }, style }]);
    frames();
    const fromFar = schematic(rect);
    // Every paint fades or dims, the anchors' dots included: none keeps a colour of the export without the rule.
    expect(arcs(fromFar)).toBe(2);
    expect(fills(fromFar).filter((value) => plain.includes(value))).toEqual([]);

    // The live camera at the schematic level composes the anchors' rows itself: the same picture.
    graph.cameraService.set({ scale: NEAR });
    frames();
    expect(anchorOf("block", "in")).toBeInstanceOf(Anchor);
    expect(events(schematic(rect))).toEqual(events(fromFar));
    // And back at the minimalistic level, after the visit.
    graph.cameraService.set({ scale: FAR });
    frames();
    expect(events(schematic(rect))).toEqual(events(fromFar));
  });

  it("exports from a block's stateChanged(): without that block's anchors it works, with them it throws", () => {
    graph = startAnchoredGraph([anchored("self", 100, 100, "StateExport"), anchored("other", 600)], FAR, {
      blockComponents: { StateExport: StateExportBlock },
    });
    hooks.rects = [
      { x: 500, y: 0, width: 500, height: 400 },
      { x: 0, y: 0, width: 1000, height: 400 },
    ];
    graph.api.updateBlock({ id: "self", name: "renamed" });
    frames();
    // The hook ran once for the change: the export did not enter the block's update again.
    expect(hooks.log).toEqual(["self:stateChanged:renamed"]);
    expect(hooks.results).toHaveLength(2);
    expect(arcs(hooks.results[0].image as HTMLCanvasElement)).toBe(2);
    expect(hooks.results[1].error).toMatch(
      /^graph\.scene\.toImage\(\) cannot create the anchors of block self from that block's own update/
    );
    // The update went on, and no anchor stayed.
    expect(blockOf("self")?.state.name).toBe("renamed");
    for (const id of ["self", "other"]) {
      expect(anchorOf(id, "in")).toBeUndefined();
      expect(anchorChildren(id)).toBe(0);
    }
    expect(arcs(schematic({ x: 0, y: 0, width: 1000, height: 400 }))).toBe(4);
  });

  it("exports from a block's willIterate(): the export does not enter that update again", () => {
    graph = startAnchoredGraph([anchored("self", 100, 100, "IterateExport"), anchored("other", 600)], FAR, {
      blockComponents: { IterateExport: IterateExportBlock },
    });
    hooks.rects = [
      { x: 500, y: 0, width: 500, height: 400 },
      { x: 0, y: 0, width: 1000, height: 400 },
    ];
    hooks.armed = true;
    blockOf("self")?.performRender();
    frames();
    expect(hooks.log).toEqual(["self:willIterate"]);
    expect(arcs(hooks.results[0].image as HTMLCanvasElement)).toBe(2);
    expect(hooks.results[1].error).toMatch(
      /^graph\.scene\.toImage\(\) cannot create the anchors of block self from that block's own update/
    );
    expect(anchorChildren("self")).toBe(0);
    expect(anchorChildren("other")).toBe(0);
  });

  it("exports from another block's hook inside the frame's flush, applying a queued block's update once", () => {
    graph = startAnchoredGraph(
      [anchored("trigger", 2000, 100, "StateExport"), anchored("queued", 100, 100, "NameLog")],
      FAR,
      {
        blockComponents: { StateExport: StateExportBlock, NameLog: NameLogBlock },
      }
    );
    hooks.rects = [{ x: 0, y: 0, width: 1000, height: 400 }];
    // Both updates are queued; the trigger's applies first and exports the queued block, which applies its own there.
    graph.api.updateBlock({ id: "trigger", name: "t2" });
    graph.api.updateBlock({ id: "queued", name: "q2" });
    frames();
    expect(hooks.log).toEqual(["trigger:stateChanged:t2", "queued:stateChanged:q2"]);
    expect(hooks.results.map((result) => result.error)).toEqual([undefined]);
    expect(arcs(hooks.results[0].image as HTMLCanvasElement)).toBe(2);
    expect(blockOf("queued")?.state.name).toBe("q2");
    expect(anchorChildren("queued")).toBe(0);
    expect(anchorOf("queued", "in")).toBeUndefined();
  });

  it("exports from a layer's render() in the frame as from outside it", () => {
    graph = startAnchoredGraph([anchored("a", 100), anchored("b", 600)], FAR);
    const rect = { x: 0, y: 0, width: 1000, height: 400 };
    const outside = schematic(rect);
    hooks.rects = [rect];
    const layer = graph.addLayer(ExportLayer, {});
    frames();
    layer.armed = true;
    layer.performRender();
    frames();
    expect(hooks.log).toEqual(["layer:render"]);
    expect(hooks.results.map((result) => result.error)).toEqual([undefined]);
    expect(events(hooks.results[0].image as HTMLCanvasElement)).toEqual(events(outside));
    expect(anchorChildren("a") + anchorChildren("b")).toBe(0);
  });

  it("throws the first failed cleanup and logs the later ones", () => {
    graph = startAnchoredGraph([anchored("a", 100), anchored("b", 400)], FAR);
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const rect = { x: 0, y: 0, width: 1000, height: 400 };
    // The scene runs its preparers' cleanups last prepared first.
    const removeFirst = graph.scene.addExportPreparer(() => () => {
      throw new Error("first preparer's cleanup");
    });
    const removeSecond = graph.scene.addExportPreparer(() => () => {
      throw new Error("second preparer's cleanup");
    });
    expect(() => schematic(rect)).toThrow("second preparer's cleanup");
    expect(logged).toHaveBeenCalledWith(
      "graph.scene.toImage(): undoing an export's preparation failed",
      new Error("first preparer's cleanup")
    );
    removeFirst();
    removeSecond();
    expect(anchorChildren("a") + anchorChildren("b")).toBe(0);

    // The blocks' cleanup: both blocks fail to drop their anchors.
    logged.mockClear();
    jest
      .spyOn(Block.prototype, "releaseExportAnchors")
      .mockImplementationOnce(() => {
        throw new Error("block a's release");
      })
      .mockImplementationOnce(() => {
        throw new Error("block b's release");
      });
    expect(() => schematic(rect)).toThrow("block a's release");
    expect(logged).toHaveBeenCalledWith(
      "graph.scene.toImage(): dropping the anchors an export created failed",
      new Error("block b's release")
    );
  });

  it("applies the state a new anchor's mount queues before it draws", () => {
    graph = startAnchoredGraph([anchored("aware", 100, 100, "Aware")], FAR, {
      blockComponents: { Aware: AwareBlock },
    });
    graph.rootStore.blocksList.getBlockState("aware")?.getAnchorById("in")?.setSelection(true);
    const image = schematic({ x: 0, y: 0, width: 600, height: 400 });
    expect(fills(image)).toContain("#ff0000");
    expect(fills(image).filter((value) => value === "#888888")).toHaveLength(1);
  });

  it("creates them for an immediate legacy block too", () => {
    graph = startAnchoredGraph([anchored("legacy", 100, 100, "Legacy")], FAR, {
      blockComponents: { Legacy: LegacyCanvasBlock },
    });
    expect(arcs(schematic({ x: 0, y: 0, width: 600, height: 400 }))).toBe(2);
    expect(anchorOf("legacy", "in")).toBeUndefined();
    expect(anchorChildren("legacy")).toBe(0);
  });

  it("creates none for hidden blocks or with useBlocksAnchors off", () => {
    graph = startAnchoredGraph([anchored("hidden", 100), anchored("shown", 600)], FAR);
    graph.rootStore.blocksList.getBlockState("hidden")?.requestHidden(true);
    frames();
    const rect = { x: 0, y: 0, width: 1000, height: 400 };
    expect(arcs(schematic(rect))).toBe(2);
    graph.updateSettings({ useBlocksAnchors: false });
    frames();
    expect(arcs(schematic(rect))).toBe(0);
  });

  it("keeps the anchors the camera's own rule wants by the time it cleans up", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], NEAR);
    // The camera now shows "far" at schematic: its anchors are requested, not created yet.
    lookAt(4900, 0, NEAR);
    expect(anchorOf("far", "in")).toBeUndefined();
    schematic({ x: 4900, y: 0, width: 600, height: 400 });
    const anchor = anchorOf("far", "in");
    expect(anchor).toBeInstanceOf(Anchor);
    frames();
    expect(anchorOf("far", "in")).toBe(anchor);
  });

  it("refuses an export started while another one runs, and still cleans up", () => {
    graph = startAnchoredGraph([anchored("far", 100)], FAR);
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    const remove = duringExport(() => {
      schematic(rect);
    });
    expect(() => schematic(rect)).toThrow(/cannot be called while another toImage\(\)/);
    remove();
    expect(anchorOf("far", "in")).toBeUndefined();
    expect(anchorChildren("far")).toBe(0);
    expect(arcs(schematic(rect))).toBe(2);
  });

  it("exports from an effect without making it follow what the export reads", () => {
    graph = startAnchoredGraph([anchored("far", 100)], FAR);
    let runs = 0;
    let drawn = 0;
    const dispose = effect(() => {
      runs++;
      drawn = arcs(schematic({ x: 0, y: 0, width: 600, height: 400 }));
    });
    graph.api.updateBlock({ id: "far", x: 150 });
    frames();
    dispose();
    expect([runs, drawn]).toEqual([1, 2]);
  });

  it("styles the picture at the export's level and scale, not the live ones", () => {
    graph = startAnchoredGraph([anchored("block", 100)], FAR);
    graph.scene.styles.add([
      { target: Block, scope: { levels: ["schematic"] }, style: { parts: { body: { color: "#123456" } } } },
    ]);
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    expect(fills(schematic(rect))).toContain("#123456");
    expect(fills(graph.scene.toImage({ rect, scale: FAR, pixelRatio: 1, level: "minimalistic" }))).not.toContain(
      "#123456"
    );
  });
});
