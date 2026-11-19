import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { dashFlow, defineConnectionEffect, toConnectionEffect } from "../effects";
import { bezierSegment, blockGeometry, lineSegment, multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";
import { createEncodedChunk, encodeShapes } from "../webgl/encode";

import { SceneLine } from "./SceneLine";
import type { TSceneLineStroke } from "./SceneLine";
import type { TWebGLShape } from "./types";

class RecordingBatch implements IConnectionBatch {
  public readonly items = new Map<IConnectionBatchItem, TBatchParams>();
  public readonly dirty: IConnectionBatchItem[] = [];
  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.update(item, params);
  }
  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    const previous = this.items.get(item);
    if (previous && previous.zIndex === params.zIndex && previous.group === params.group) this.dirty.push(item);
    this.items.set(item, { ...params });
  }
  public delete(item: IConnectionBatchItem): void {
    this.items.delete(item);
  }
  public has(item: IConnectionBatchItem): boolean {
    return this.items.has(item);
  }
  public markDirty(item: IConnectionBatchItem): void {
    this.dirty.push(item);
  }
  public markBoundsDirty(): void {}
}

type TStubState = Partial<TConnection & { hovered: boolean; selected: boolean }>;

/** The members of BlockConnection a line reads. */
function stubConnection(
  geometry: TConnectionGeometry | undefined,
  state: TStubState = {},
  props: { showConnectionArrows: boolean; useTightBezierBounds?: boolean } = {
    showConnectionArrows: true,
    useTightBezierBounds: true,
  }
): { connection: BlockConnection<TConnection>; batch: RecordingBatch; ctx: CanvasRenderingContext2D } {
  const batch = new RecordingBatch();
  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  const connection = {
    context: {
      batch,
      ctx,
      colors: { connection: { background: "#aaa", selectedBackground: "#fc0" } },
      camera: { getCameraScale: () => 1 },
    },
    state: { id: "c", ...state },
    props,
    getSceneKey: () => undefined,
    getGeometry: () => geometry,
    getBatchZIndex: () => 0,
    isPathVisible: () => true,
    getPathBounds: () => undefined,
    isInViewport: () => true,
  };
  return { connection: connection as unknown as BlockConnection<TConnection>, batch, ctx };
}

const straight = blockGeometry({
  source: { x: 0, y: 0 },
  target: { x: 100, y: 0 },
  points: [],
  useBezier: false,
  bezierDirection: "horizontal",
  connection: { id: "c" } as TConnection,
}) as TConnectionGeometry;

const closedArrowGeometry = multipointGeometry({
  source: { x: 0, y: 0 },
  target: { x: 100, y: 100 },
  points: [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 100 },
  ],
  useBezier: false,
  bezierDirection: "horizontal",
  connection: { id: "c" } as TConnection,
}) as TConnectionGeometry;

const bezierGeometry: TConnectionGeometry = {
  segments: new Float32Array(bezierSegment({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 20, y: 100 }, { x: 100, y: 100 })),
};

const noArrows = { showConnectionArrows: false };

describe("SceneLine", () => {
  it("builds Path2D style groups for the Canvas batch", () => {
    const { connection, batch } = stubConnection(straight);
    const line = new SceneLine(connection);
    line.update();
    expect(batch.items.get(line)).toEqual({ zIndex: 0, group: "line/#aaa/2/" });
    expect(batch.items.get(line.arrow)?.group).toBe("arrow/open/#aaa/2//line/#aaa/2/");
  });

  describe("hitTest", () => {
    it("hits within width / 2 + threshold on a straight line and misses beyond", () => {
      const line = new SceneLine(stubConnection(straight, {}, noArrows).connection);
      expect(line.hitTest(50, 8.9, 8)).toBe(true);
      expect(line.hitTest(50, -9, 8)).toBe(true);
      expect(line.hitTest(50, 9.1, 8)).toBe(false);
      expect(line.hitTest(50, -9.5, 8)).toBe(false);
    });

    it("widens the hit by half the hovered width", () => {
      const line = new SceneLine(stubConnection(straight, { hovered: true }, noArrows).connection);
      expect(line.hitTest(50, 9.9, 8)).toBe(true);
      expect(line.hitTest(50, 10.1, 8)).toBe(false);
    });

    it("hits within the limit of a bezier and misses beyond", () => {
      const line = new SceneLine(stubConnection(bezierGeometry, {}, { showConnectionArrows: false }).connection);
      // (0, 0) is the curve's start.
      expect(line.hitTest(0, 8.5, 8)).toBe(true);
      expect(line.hitTest(0, 9.5, 8)).toBe(false);
      expect(line.hitTest(-8.5, 0, 8)).toBe(true);
      expect(line.hitTest(-9.5, 0, 8)).toBe(false);
      expect(line.hitTest(300, 300, 8)).toBe(false);
    });

    it("hits the arrow only while arrows are shown", () => {
      const arrow = closedArrowGeometry.arrow;
      if (!arrow) throw new Error("closed arrow expected");
      // The arrow sits 300 units away from the line, so only the arrow can hit near its tip.
      const away: TConnectionGeometry = {
        segments: new Float32Array(lineSegment({ x: 0, y: 0 }, { x: 1000, y: 0 })),
        arrow: { points: arrow.points.map((v, i) => (i % 2 ? v + 300 : v)), closed: arrow.closed },
      };
      const tip = { x: away.arrow?.points[0] ?? 0, y: away.arrow?.points[1] ?? 0 };
      expect(new SceneLine(stubConnection(away).connection).hitTest(tip.x, tip.y, 8)).toBe(true);
      expect(new SceneLine(stubConnection(away, {}, noArrows).connection).hitTest(tip.x, tip.y, 8)).toBe(false);
      expect(new SceneLine(stubConnection(away).connection).hitTest(tip.x, tip.y + 100, 8)).toBe(false);
    });

    it("returns false without geometry", () => {
      expect(new SceneLine(stubConnection(undefined).connection).hitTest(0, 0, 8)).toBe(false);
    });
  });

  describe("getSceneShape", () => {
    it("uses the shared shaft stroke directly when it has no effect", () => {
      const { connection } = stubConnection(straight);
      const line = new SceneLine(connection);
      line.update();
      expect(line.getSceneShape()).toBeUndefined();
      expect(line.getSceneStrokes().shaft).toEqual({ color: "#aaa", width: 2, dash: undefined });
      line.update({ id: "c", hovered: true });
      expect(line.getSceneStrokes().shaft.width).toBe(4);
    });

    it("has no WebGL shape without geometry", () => {
      expect(new SceneLine(stubConnection(undefined).connection).getSceneShape()).toBeUndefined();
    });
  });

  describe("fallback", () => {
    it("builds Path2D from the geometry on demand only", () => {
      const OriginalPath2D = global.Path2D;
      const countPath2D = jest.fn();
      global.Path2D = class extends OriginalPath2D {
        constructor() {
          super();
          countPath2D();
        }
      };
      const { connection } = stubConnection(closedArrowGeometry);
      const line = new SceneLine(connection);
      line.update();
      line.getSceneShape();
      line.hitTest(1, 1, 8);
      expect(countPath2D).not.toHaveBeenCalled();

      expect(line.getPath()).toBeDefined();
      expect(line.getArrowPath()).toBeDefined();
      expect(countPath2D).toHaveBeenCalledTimes(2);
      line.getPath();
      expect(countPath2D).toHaveBeenCalledTimes(2);
      global.Path2D = OriginalPath2D;
    });

    it("applies the stroke in style() and styleArrow()", () => {
      const closed = stubConnection(closedArrowGeometry, { dashed: true });
      const line = new SceneLine(closed.connection);
      line.update();
      expect(line.style(closed.ctx)).toEqual({ type: "stroke" });
      expect(closed.ctx.strokeStyle).toBe("#aaaaaa");
      expect(line.styleArrow(closed.ctx)).toEqual({ type: "both" });
      expect(closed.ctx.fillStyle).toBe("#aaaaaa");
    });
  });

  describe("effects", () => {
    const pulse = defineConnectionEffect<Record<never, never>, number>({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
      encode: (level) => [level],
      fallback: (stroke, params) => {
        stroke.width += params[0];
        return stroke;
      },
    });

    class EffectLine extends SceneLine {
      public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
        return { ...super.getStroke(state), effect: pulse.use(3) };
      }
    }

    it("passes the effect and params into the line shape", () => {
      const line = new EffectLine(stubConnection(closedArrowGeometry).connection);
      line.update();
      const shape = line.getSceneShape();
      expect(shape?.effect).toBe(toConnectionEffect(pulse as never));
      expect(shape?.params).toEqual([3]);
    });

    it("keeps the effect on hover and selection", () => {
      class SelectedEffectLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          return this.withInteraction({ color: "#2f7cf6", width: 6, effect: pulse.use(3) }, state);
        }
      }
      const selected = new SelectedEffectLine(stubConnection(straight, { selected: true }).connection);
      const stroke = selected.getStroke({ id: "c", selected: true });
      expect(stroke).toMatchObject({ color: "#fc0", width: 8, effect: { params: [3] } });
      selected.update();
      expect(selected.getSceneShape()?.effect).toBe(toConnectionEffect(pulse as never));
    });

    it("draws and groups the Path2D fallback with the fallback stroke", () => {
      const { connection, batch, ctx } = stubConnection(straight, {}, noArrows);
      const line = new EffectLine(connection);
      line.update();
      expect(batch.items.get(line)?.group).toBe("line/#aaa/5/");
      line.style(ctx);
      expect(ctx.lineWidth).toBe(5);

      const plain = stubConnection(straight, {}, noArrows);
      const other = new SceneLine(plain.connection);
      other.update();
      expect(plain.batch.items.get(other)?.group).not.toBe(batch.items.get(line)?.group);
    });

    it("uses the compatibility Canvas fallback only inside the scale range without regrouping on zoom", () => {
      const { connection, batch, ctx } = stubConnection(straight, { selected: true }, noArrows);
      let scale = 0.25;
      jest.spyOn(connection.context.camera, "getCameraScale").mockImplementation(() => scale);
      class ScopedLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          return this.withInteraction(
            { color: "#2f7cf6", width: 6, effect: pulse.use(3, { minScale: 0.5, maxScale: 1 }) },
            state
          );
        }
      }
      const line = new ScopedLine(connection);
      line.update();
      const group = batch.items.get(line)?.group;
      for (const [nextScale, width] of [
        [0.25, 8],
        [0.5, 11],
        [0.75, 11],
        [1, 8],
        [0.5, 11],
      ]) {
        scale = nextScale;
        line.style(ctx);
        expect(ctx.lineWidth).toBe(width);
        expect(ctx.strokeStyle).toBe("#ffcc00");
      }
      line.updateItems();
      expect(batch.items.get(line)?.group).toBe(group);
    });

    it("separates compatibility Canvas groups that disagree on effect activity or the plain stroke", () => {
      const group = (minScale: number, width: number, params: number): string | undefined => {
        const { connection, batch } = stubConnection(straight, {}, noArrows);
        class ScopedLine extends SceneLine {
          public override getStroke(): TSceneLineStroke {
            return { color: "#aaa", width, effect: pulse.use(params, { minScale }) };
          }
        }
        const line = new ScopedLine(connection);
        line.update();
        return batch.items.get(line)?.group;
      };
      expect(group(1, 2, 3)).not.toBe(group(2, 2, 3));
      expect(group(1, 2, 3)).not.toBe(group(1, 3, 2));
    });

    it("falls back to the stroke without the effect by default", () => {
      const bare = defineConnectionEffect({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
      });
      class BareLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          return { ...super.getStroke(state), effect: bare.use([]) };
        }
      }
      const { connection, batch } = stubConnection(straight, {}, noArrows);
      const line = new BareLine(connection);
      line.update();
      expect(batch.items.get(line)?.group).toBe("line/#aaa/2/");
    });
  });

  describe("hover and selection", () => {
    const flow = defineConnectionEffect({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
    });
    const widen = defineConnectionEffect<Record<never, never>, number>({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
      encode: (extra) => [extra],
      fallback: (stroke, params) => ({ ...stroke, width: stroke.width + params[0] }),
    });

    /** A custom look built with withInteraction(): blue, 6 wide, with the effect when one is given. */
    function lookLine(effect?: typeof flow): new (connection: BlockConnection<TConnection>) => SceneLine {
      return class LookLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          const look = { color: "#2f7cf6", width: 6 };
          return this.withInteraction(effect ? { ...look, effect: effect.use([]) } : look, state);
        }
      };
    }

    /** The default stroke with an effect added afterwards. */
    class AddedEffectLine extends SceneLine {
      public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
        return { ...super.getStroke(state), effect: dashFlow.use({ pattern: [40, 30], speed: 120 }) };
      }
    }

    /** Handles hover and selection itself: red while selected, blue otherwise; no withInteraction(). */
    function ownLook(effect?: typeof flow): new (connection: BlockConnection<TConnection>) => SceneLine {
      return class OwnLookLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          const look = { color: state.selected ? "#f00" : "#00f", width: 2 };
          return effect ? { ...look, effect: effect.use([]) } : look;
        }
      };
    }

    const EffectLook = lookLine(flow);
    const PlainLook = lookLine();

    /** The straight rgba and the packed interaction of the shape's first encoded instance; rgb in 0..255. */
    function encoded(shape: TWebGLShape | undefined): { rgba: number[]; packed: number } {
      if (!shape) throw new Error("shape expected");
      const out = createEncodedChunk();
      encodeShapes([shape], 0, out);
      const rgba = Array.from(out.lines.data.subarray(8, 12)).map((value, i) =>
        i < 3 ? Math.round(value * 255) : value
      );
      return { rgba, packed: out.lines.data[31] };
    }

    /** The packed interaction: hovered + 2 selected + 4 * 255 (an opaque selection color), + 1024 for the effect. */
    const packed = (hovered: boolean, selected: boolean, effectShows = false): number =>
      (hovered ? 1 : 0) + (selected ? 2 : 0) + 4 * 255 + (effectShows ? 1024 : 0);

    it("withInteraction() recolors like ConnectionLine: the selection color and 2 units wider", () => {
      const look = (stroke: TSceneLineStroke): [string, number, boolean] => [
        stroke.color,
        stroke.width,
        Boolean(stroke.effect),
      ];
      const effectLine = new EffectLook(stubConnection(straight).connection);
      expect(look(effectLine.getStroke({ id: "c" }))).toEqual(["#2f7cf6", 6, true]);
      expect(look(effectLine.getStroke({ id: "c", hovered: true }))).toEqual(["#2f7cf6", 8, true]);
      expect(look(effectLine.getStroke({ id: "c", selected: true }))).toEqual(["#fc0", 8, true]);
      const plainLine = new PlainLook(stubConnection(straight).connection);
      expect(look(plainLine.getStroke({ id: "c", selected: true }))).toEqual(["#fc0", 8, false]);
      const line = new SceneLine(stubConnection(straight).connection);
      expect(look(line.getStroke({ id: "c", selected: true }))).toEqual(["#fc0", 4, false]);
    });

    it("draws a line without an effect as its stroke: the selection color comes from withInteraction()", () => {
      const line = new SceneLine(stubConnection(straight, { selected: true }).connection);
      line.update();
      expect(line.getSceneShape()).toBeUndefined();
      expect(line.getSceneStrokes().shaft).toEqual({ color: "#fc0", width: 4, dash: undefined });

      const styles = { selectedBackground: "rgba(255, 0, 0, 0.5)" };
      const styled = new PlainLook(stubConnection(straight, { selected: true, styles }).connection);
      styled.update();
      expect(styled.getSceneStrokes().shaft.color).toBe(styles.selectedBackground);
    });

    it("gives an effect the line's own color in place of the selection color withInteraction() applied", () => {
      for (const Line of [EffectLook, AddedEffectLine]) {
        const selected = stubConnection(closedArrowGeometry, { selected: true });
        const line = new Line(selected.connection);
        line.update();
        const shape = line.getSceneShape();
        const own = Line === EffectLook ? "#2f7cf6" : "#aaa";
        expect(shape?.stroke.color).toBe(own);
        expect(shape?.effectShowsSelection).toBe(true);
        expect(shape?.interaction).toEqual({ hovered: false, selected: true, selectionColor: "#fc0" });
        expect(encoded(shape).packed).toBe(packed(false, true, true));
        // The arrow and the Path2D fallback have no effect: they draw the stroke, in the selection color.
        expect(line.getSceneStrokes().arrow?.color).toBe("#fc0");
        line.style(selected.ctx);
        expect(selected.ctx.strokeStyle).toBe("#ffcc00");
      }

      const hovered = new AddedEffectLine(stubConnection(straight, { hovered: true }, noArrows).connection);
      hovered.update();
      expect(hovered.getSceneShape()?.stroke.color).toBe("#aaa");
      expect(hovered.getSceneShape()?.effectShowsSelection).toBeUndefined();
      expect(encoded(hovered.getSceneShape()).packed).toBe(packed(true, false));
    });

    it("keeps a color set over withInteraction() for an effect: drawn as returned", () => {
      class OverriddenLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          const stroke = { ...super.getStroke(state), effect: flow.use([]) };
          return state.selected ? { ...stroke, color: "#e5484d" } : stroke;
        }
      }
      const selected = stubConnection(closedArrowGeometry, { selected: true });
      const line = new OverriddenLine(selected.connection);
      line.update();
      expect(line.getSceneShape()?.stroke.color).toBe("#e5484d");
      expect(line.getSceneShape()?.effectShowsSelection).toBeUndefined();
      expect(line.getSceneStrokes().arrow?.color).toBe("#e5484d");
    });

    it("draws a stroke returned without withInteraction() as it is; its effect still gets the interaction", () => {
      const selected = stubConnection(closedArrowGeometry, { selected: true });
      const line = new (ownLook())(selected.connection);
      line.update();
      expect(line.getSceneStrokes().shaft).toEqual({ color: "#f00", width: 2 });
      expect(line.getSceneStrokes().arrow).toEqual({ color: "#f00", width: 2 });
      expect(selected.batch.items.get(line)?.group).toBe("line/#f00/2/");

      const withEffect = stubConnection(closedArrowGeometry, { selected: true });
      const effectLine = new (ownLook(widen as unknown as typeof flow))(withEffect.connection);
      effectLine.update();
      const shape = effectLine.getSceneShape();
      expect(shape?.stroke).toEqual({ color: "#f00", width: 2 });
      expect(shape?.effectShowsSelection).toBeUndefined();
      expect(shape?.interaction).toEqual({ hovered: false, selected: true, selectionColor: "#fc0" });
      expect(effectLine.getSceneStrokes().arrow?.color).toBe("#f00");
      effectLine.style(withEffect.ctx);
      expect(withEffect.ctx.strokeStyle).toBe("#ff0000");
    });

    it("passes the interaction of the state update() reads into the line shape", () => {
      const { connection } = stubConnection(closedArrowGeometry);
      const line = new EffectLook(connection);
      line.update();
      expect(line.getSceneShape()?.interaction).toEqual({ hovered: false, selected: false, selectionColor: "#fc0" });

      // The state passed to update(), not the connection's.
      const selectedBackground = "rgba(255, 0, 0, 0.5)";
      line.update({ id: "c", hovered: true, selected: true, styles: { selectedBackground } }, connection.props);
      expect(line.getSceneShape()?.interaction).toEqual({
        hovered: true,
        selected: true,
        selectionColor: selectedBackground,
      });
      expect(line.getSceneShape()?.stroke.color).toBe("#2f7cf6");
    });

    it("rebuilds the shape when only the interaction changes", () => {
      const stroke: TSceneLineStroke = { color: "#2f7cf6", width: 6, effect: flow.use([]) };
      class FixedLine extends SceneLine {
        public override getStroke(): TSceneLineStroke {
          return stroke;
        }
      }
      const { connection } = stubConnection(straight, {}, noArrows);
      const line = new FixedLine(connection);
      line.update();
      const before = line.getSceneShape();
      expect(line.getSceneShape()).toBe(before);
      line.update({ id: "c", selected: true }, connection.props);
      const after = line.getSceneShape();
      expect(after).not.toBe(before);
      expect(after?.interaction?.selected).toBe(true);
    });

    it("draws the Path2D fallback of a selected effect line from its stroke, with the fallback's width", () => {
      class WidenLine extends SceneLine {
        public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TSceneLineStroke {
          return this.withInteraction({ color: "#2f7cf6", width: 6, effect: widen.use(3) }, state);
        }
      }
      const selected = stubConnection(straight, { selected: true }, noArrows);
      const line = new WidenLine(selected.connection);
      line.update();
      expect(selected.batch.items.get(line)?.group).toBe("line/#fc0/11/");
      line.style(selected.ctx);
      expect(selected.ctx.strokeStyle).toBe("#ffcc00");
      expect(selected.ctx.lineWidth).toBe(11);

      const hovered = stubConnection(straight, { hovered: true }, noArrows);
      const hoveredLine = new WidenLine(hovered.connection);
      hoveredLine.update();
      expect(hovered.batch.items.get(hoveredLine)?.group).toBe("line/#2f7cf6/11/");
    });
  });
});
