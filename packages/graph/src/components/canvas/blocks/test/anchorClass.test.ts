import { Graph } from "../../../../graph";
import type { TScenePrimitive } from "../../../../lib/scene/types";
import type { TSceneLevel } from "../../../../services/scene/types";
import { entityKey } from "../../../../services/tags/TagStore";
import { Anchor } from "../../anchors";
import type { TAnchor, TAnchorClass, TAnchorProps } from "../../anchors";
import { anchorLimitsOf } from "../../anchors/utils/anchorLayout";
import { Block } from "../Block";
import type { TBlock } from "../Block";
import { LegacyCanvasBlock } from "../LegacyCanvasBlock";

import { FAR, NEAR, anchored as anchoredBlock, frames, startAnchoredGraph } from "./utils/anchoredGraph";

const anchored = (id: string, x: number, is = "Block", meta?: Record<string, unknown>): TBlock => ({
  ...anchoredBlock(id, x, 100, is),
  meta,
});

/** A square smaller than the stock dot, with its size and reach on the class. */
class SquareAnchor extends Anchor {
  public static override SIZE = 12;
  public static override LINE_WIDTH = 1;
  public static override LOOK_EXTENT = 8;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -6, y: -6, width: 12, height: 12 }];
  }
}

/** The stock look, with a reach of 40 declared. */
class WideAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  public static override LOOK_EXTENT = 40;
}

/** A look on the minimalistic level too, declared in its creation levels. */
class FarDotAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

/** A minimalistic look without the declaration: never created there; development builds warn. */
class UndeclaredFarAnchor extends Anchor {
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

class SquareOutBlock extends Block {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SquareAnchor : Anchor;
  }
}

class WideBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return WideAnchor;
  }
}

class FarDotBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return FarDotAnchor;
  }
}

class UndeclaredBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return UndeclaredFarAnchor;
  }
}

/** The class follows the block's meta, as Nirvana picks shapes from `meta.anchorsMeta`. */
class MetaChosenBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    const meta = this.state.meta as { far?: boolean; square?: boolean } | undefined;
    if (meta?.far) return FarDotAnchor;
    return meta?.square ? SquareAnchor : Anchor;
  }
}

/** Throws while its meta says `broken`; otherwise OUT anchors are squares and IN anchors far dots. */
class ThrowingBlock extends Block {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    if ((this.state.meta as { broken?: boolean } | undefined)?.broken) throw new Error("no classes");
    return anchor.type === "OUT" ? SquareAnchor : FarDotAnchor;
  }
}

/** Still defines the hook `getAnchorClass` replaced: blocks never call it. */
class RenderAnchorBlock extends Block {
  protected renderAnchor(): void {
    // the removed hook
  }
}

/** The same on a legacy canvas block, which is not told about imperative members. */
class RenderAnchorLegacyBlock extends LegacyCanvasBlock {
  protected renderAnchor(): void {
    // the removed hook
  }
}

describe("anchor classes from getAnchorClass", () => {
  let graph: Graph;

  function start(blocks: TBlock[], scale: number): void {
    graph = startAnchoredGraph(blocks, scale, {
      blockComponents: {
        Square: SquareOutBlock,
        Wide: WideBlock,
        FarDot: FarDotBlock,
        Undeclared: UndeclaredBlock,
        Meta: MetaChosenBlock,
        Throwing: ThrowingBlock,
        OldAnchors: RenderAnchorBlock,
        OldLegacyAnchors: RenderAnchorLegacyBlock,
      },
    });
  }

  const anchorOf = (id: string, anchorId: string): Anchor | undefined =>
    graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId)?.getViewComponent();
  const anchorChildren = (id: string): number => graph.scene.store.childrenOf(entityKey("block", id)).length;

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("creates each anchor with its class, sized by the class's SIZE and LINE_WIDTH", () => {
    start([anchored("a", 100, "Square")], NEAR);
    const square = anchorOf("a", "out");
    expect(square).toBeInstanceOf(SquareAnchor);
    expect([square?.props.size, square?.props.lineWidth]).toEqual([12, 1]);
    expect(anchorOf("a", "in")?.constructor).toBe(Anchor);
    expect(anchorOf("a", "in")?.props.size).toBe(18);
    const element = square ? graph.scene.store.get(square.getSceneElementId()) : undefined;
    expect(element?.primitives.map((primitive) => primitive.kind)).toEqual(["rect"]);
  });

  it("widens the camera search for an offscreen class and narrows it again when that block leaves", () => {
    // The minimalistic level creates no anchor components, so only the block's own update reads the classes.
    start([anchored("w", 100, "Wide")], FAR);
    expect(anchorChildren("w")).toBe(0);
    expect(anchorLimitsOf(graph).reach).toBe(40);
    graph.rootStore.blocksList.deleteBlocks(["w"]);
    frames();
    expect(anchorLimitsOf(graph).reach).toBe(Anchor.LOOK_EXTENT);
  });

  it("creates anchors on the minimalistic level for a class that declares it, and none for the stock class", () => {
    start([anchored("dot", 100, "FarDot"), anchored("plain", 400)], FAR);
    expect(anchorChildren("dot")).toBe(2);
    expect(anchorChildren("plain")).toBe(0);
  });

  it("creates them when the camera shows such a block on the minimalistic level", () => {
    // At 0.1 the view spans world x 0..10000: the block at 20000 is out of it.
    start([anchored("dot", 20_000, "FarDot")], FAR);
    expect(anchorChildren("dot")).toBe(0);
    graph.cameraService.set({ scale: FAR, x: -20_000 * FAR, y: 0 });
    frames();
    expect(anchorChildren("dot")).toBe(2);
  });

  it("does not create a class on the minimalistic level that only draws there, and warns once", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    start([anchored("u", 100, "Undeclared")], NEAR);
    expect(anchorChildren("u")).toBe(2);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("CREATION_LEVELS"))).toHaveLength(1);
    graph.setEntities({ blocks: [anchored("u2", 100, "Undeclared")], connections: [] });
    graph.cameraService.set({ scale: FAR, x: 0, y: 0 });
    frames();
    expect(anchorChildren("u2")).toBe(0);
  });

  it("swaps the anchor components when a meta change picks another class", () => {
    start([anchored("m", 100, "Meta")], NEAR);
    expect(anchorOf("m", "out")?.constructor).toBe(Anchor);
    graph.api.updateBlock({ id: "m", meta: { square: true } });
    frames();
    expect(anchorOf("m", "out")).toBeInstanceOf(SquareAnchor);
  });

  it("learns the creation levels of an offscreen block whose meta changes, and creates its anchors when shown", () => {
    start([anchored("m", 20_000, "Meta")], FAR);
    expect(anchorLimitsOf(graph).levels).toBe(6);
    graph.api.updateBlock({ id: "m", meta: { far: true } });
    frames();
    expect(anchorLimitsOf(graph).levels).toBe(7);
    graph.cameraService.set({ scale: FAR, x: -20_000 * FAR, y: 0 });
    frames();
    expect(anchorOf("m", "out")).toBeInstanceOf(FarDotAnchor);
  });

  it("does not ask getAnchorClass again for a move", () => {
    start([anchored("m", 100, "Meta")], NEAR);
    const ask = jest.spyOn(
      MetaChosenBlock.prototype as unknown as { getAnchorClass(): TAnchorClass },
      "getAnchorClass"
    );
    graph.api.updateBlock({ id: "m", x: 300 });
    frames();
    expect(ask).not.toHaveBeenCalled();
  });

  it("narrows the graph's creation levels again once the block that declared the minimalistic level is gone", () => {
    start([anchored("dot", 100, "FarDot"), anchored("plain", 400)], FAR);
    expect(anchorLimitsOf(graph).levels).toBe(7);
    graph.rootStore.blocksList.deleteBlocks(["dot"]);
    frames();
    expect(anchorLimitsOf(graph).levels).toBe(6);
  });

  it("warns once per class that still defines renderAnchor, a legacy canvas block too", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    start(
      [anchored("r1", 100, "OldAnchors"), anchored("r2", 400, "OldAnchors"), anchored("l", 700, "OldLegacyAnchors")],
      NEAR
    );
    const messages = warn.mock.calls.map(([message]) => String(message));
    const reports = messages.filter((text) => text.includes("renderAnchor"));
    expect(reports.map((text) => text.slice(0, text.indexOf(":"))).sort()).toEqual([
      "RenderAnchorBlock",
      "RenderAnchorLegacyBlock",
    ]);
    for (const text of reports) expect(text).toMatch(/getAnchorClass\(anchor\).*SIZE and LINE_WIDTH/);
    // A legacy canvas block keeps its imperative members: it is not told they never draw.
    expect(messages.some((text) => text.startsWith("RenderAnchorLegacyBlock") && text.includes("imperative"))).toBe(
      false
    );
  });

  describe("a getAnchorClass that throws", () => {
    const reportsOf = (error: jest.SpyInstance): string[] =>
      error.mock.calls.map(([message]) => String(message)).filter((text) => text.includes("getAnchorClass() threw"));

    it("is reported with what the block uses until it returns classes", () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
      start([anchored("t", 100, "Throwing", { broken: true })], FAR);
      const reports = reportsOf(error);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toContain("ThrowingBlock (block t)");
      expect(reports[0]).toContain("until it returns classes, the block uses the graph's anchor reach and creation");
      expect(anchorChildren("t")).toBe(0);
    });

    it("keeps the classes and creation levels read before, and is reported by each block, again after a recovery", () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
      start([anchored("t1", 100, "Throwing"), anchored("t2", 400, "Throwing")], NEAR);
      const levelsOf = (id: string): number | undefined =>
        graph.rootStore.blocksList.getBlockState(id)?.getViewComponent()?.getAnchorLevels();
      expect([levelsOf("t1"), levelsOf("t2")]).toEqual([7, 7]);
      const setBroken = (broken: boolean, step: number): void => {
        for (const id of ["t1", "t2"]) graph.api.updateBlock({ id, meta: { broken, step } });
        frames();
      };

      setBroken(true, 1);
      // Each block reports its own failure, not only the first block of the class.
      expect(
        reportsOf(error)
          .map((text) => text.slice(0, text.indexOf(":")))
          .sort()
      ).toEqual(["ThrowingBlock (block t1)", "ThrowingBlock (block t2)"]);
      expect(reportsOf(error).every((text) => text.includes("keeps the anchor classes it read before"))).toBe(true);
      expect(anchorOf("t1", "out")).toBeInstanceOf(SquareAnchor);
      expect(anchorOf("t1", "in")).toBeInstanceOf(FarDotAnchor);
      expect([levelsOf("t1"), levelsOf("t2"), anchorLimitsOf(graph).levels]).toEqual([7, 7, 7]);

      // Still failing: the same failure is not reported again.
      setBroken(true, 2);
      expect(reportsOf(error)).toHaveLength(2);

      // A read that succeeds ends the failure; a later throw is reported again.
      setBroken(false, 3);
      setBroken(true, 4);
      expect(reportsOf(error)).toHaveLength(4);
    });
  });
});
