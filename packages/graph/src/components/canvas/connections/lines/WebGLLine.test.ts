import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { dashFlow, defineConnectionEffect, toConnectionEffect } from "../effects";
import { bezierSegment, blockGeometry, lineSegment, multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";
import { createEncodedChunk, encodeShapes } from "../webgl/encode";

import { WebGLLine } from "./WebGLLine";
import type { TWebGLStroke } from "./WebGLLine";
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
  public forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void {
    for (const [item, params] of this.items) visit(item, params);
  }
}

type TStubState = Partial<TConnection & { hovered: boolean }>;

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

describe("WebGLLine", () => {
  it("is a webgl line with Path2D style groups for the fallback", () => {
    expect(WebGLLine.renderer).toBe("webgl");
    const { connection, batch } = stubConnection(straight);
    const line = new WebGLLine(connection);
    line.update();
    expect(batch.items.get(line)).toEqual({ zIndex: 0, group: "line/#aaa/2/" });
    expect(batch.items.get(line.arrow)?.group).toBe("arrow/open/#aaa/2//line/#aaa/2/");
  });

  describe("hitTest", () => {
    it("hits within width / 2 + threshold on a straight line and misses beyond", () => {
      const line = new WebGLLine(stubConnection(straight, {}, noArrows).connection);
      expect(line.hitTest(50, 8.9, 8)).toBe(true);
      expect(line.hitTest(50, -9, 8)).toBe(true);
      expect(line.hitTest(50, 9.1, 8)).toBe(false);
      expect(line.hitTest(50, -9.5, 8)).toBe(false);
    });

    it("widens the hit by half the hovered width", () => {
      const line = new WebGLLine(stubConnection(straight, { hovered: true }, noArrows).connection);
      expect(line.hitTest(50, 9.9, 8)).toBe(true);
      expect(line.hitTest(50, 10.1, 8)).toBe(false);
    });

    it("hits within the limit of a bezier and misses beyond", () => {
      const line = new WebGLLine(stubConnection(bezierGeometry, {}, { showConnectionArrows: false }).connection);
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
      expect(new WebGLLine(stubConnection(away).connection).hitTest(tip.x, tip.y, 8)).toBe(true);
      expect(new WebGLLine(stubConnection(away, {}, noArrows).connection).hitTest(tip.x, tip.y, 8)).toBe(false);
      expect(new WebGLLine(stubConnection(away).connection).hitTest(tip.x, tip.y + 100, 8)).toBe(false);
    });

    it("returns false without geometry", () => {
      expect(new WebGLLine(stubConnection(undefined).connection).hitTest(0, 0, 8)).toBe(false);
    });
  });

  describe("getWebGLShape", () => {
    it("returns the geometry segments and the stroke of the line", () => {
      const { connection } = stubConnection(straight);
      const line = new WebGLLine(connection);
      line.update();
      const shape = line.getWebGLShape();
      expect(shape?.segments).toBe(straight.segments);
      expect(shape?.stroke).toEqual({ color: "#aaa", width: 2, dash: undefined });
      expect(shape?.fill).toBeUndefined();
      expect(line.getWebGLShape()).toBe(shape);
    });

    it("rebuilds the shape after update() with a new stroke", () => {
      const { connection } = stubConnection(straight);
      const line = new WebGLLine(connection);
      line.update();
      const before = line.getWebGLShape();
      (connection.state as { hovered?: boolean }).hovered = true;
      line.update();
      const after = line.getWebGLShape();
      expect(after).not.toBe(before);
      expect(after?.stroke.width).toBe(4);
    });

    it("draws a closed arrow as 3 line segments with a fill", () => {
      const { connection } = stubConnection(closedArrowGeometry);
      const line = new WebGLLine(connection);
      line.update();
      const shape = line.arrow.getWebGLShape?.();
      expect(shape?.segments.length).toBe(3 * 8);
      expect(shape?.fill).toBe(closedArrowGeometry.arrow?.points);
      expect(shape?.stroke).toEqual({ color: "#aaa", width: 2 });
      expect(line.arrow.getWebGLShape?.()).toBe(shape);
    });

    it("draws an open arrow as its sides without a fill, and has no shape without an arrow", () => {
      const open = stubConnection(straight);
      const line = new WebGLLine(open.connection);
      line.update();
      const arrow = straight.arrow;
      const shape = line.arrow.getWebGLShape?.();
      expect(shape?.segments.length).toBe(((arrow?.points.length ?? 0) / 2 - 1) * 8);
      expect(shape?.fill).toBeUndefined();

      const bare = new WebGLLine(stubConnection({ segments: straight.segments }).connection);
      expect(bare.arrow.getWebGLShape?.()).toBeUndefined();
      expect(new WebGLLine(stubConnection(undefined).connection).getWebGLShape()).toBeUndefined();
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
      const line = new WebGLLine(connection);
      line.update();
      line.getWebGLShape();
      line.arrow.getWebGLShape?.();
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
      const line = new WebGLLine(closed.connection);
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
      fallback: (stroke, params) => ({ ...stroke, width: stroke.width + params[0] }),
    });

    class EffectLine extends WebGLLine {
      public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
        return { ...super.getStroke(state), effect: pulse.use(3) };
      }
    }

    it("passes the effect and params into the line shape, not the arrow shape", () => {
      const line = new EffectLine(stubConnection(closedArrowGeometry).connection);
      line.update();
      const shape = line.getWebGLShape();
      expect(shape?.effect).toBe(toConnectionEffect(pulse as never));
      expect(shape?.params).toEqual([3]);
      expect(line.arrow.getWebGLShape?.()?.effect).toBeUndefined();
    });

    it("reports the effect of its stroke without geometry; the arrow reports none", () => {
      const line = new EffectLine(stubConnection(undefined).connection);
      line.update();
      expect(line.getWebGLShape()).toBeUndefined();
      expect(line.getWebGLEffect()).toBe(toConnectionEffect(pulse as never));
      expect(line.arrow.getWebGLEffect?.()).toBeUndefined();
      expect(new WebGLLine(stubConnection(straight).connection).getWebGLEffect()).toBeUndefined();
    });

    it("keeps the effect on hover and selection", () => {
      class SelectedEffectLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
          return this.withInteraction({ color: "#2f7cf6", width: 6, effect: pulse.use(3) }, state);
        }
      }
      const selected = new SelectedEffectLine(stubConnection(straight, { selected: true }).connection);
      const stroke = selected.getStroke({ id: "c", selected: true });
      expect(stroke).toMatchObject({ color: "#fc0", width: 8, effect: { params: [3] } });
      selected.update();
      expect(selected.getWebGLShape()?.effect).toBe(toConnectionEffect(pulse as never));
    });

    it("draws and groups the Path2D fallback with the fallback stroke", () => {
      const { connection, batch, ctx } = stubConnection(straight, {}, noArrows);
      const line = new EffectLine(connection);
      line.update();
      expect(batch.items.get(line)?.group).toBe("line/#aaa/5/");
      line.style(ctx);
      expect(ctx.lineWidth).toBe(5);

      const plain = stubConnection(straight, {}, noArrows);
      const other = new WebGLLine(plain.connection);
      other.update();
      expect(plain.batch.items.get(other)?.group).not.toBe(batch.items.get(line)?.group);
    });

    it("falls back to the stroke without the effect by default", () => {
      const bare = defineConnectionEffect({
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
      });
      class BareLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
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
    function lookLine(effect?: typeof flow): new (connection: BlockConnection<TConnection>) => WebGLLine {
      return class LookLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
          const look = { color: "#2f7cf6", width: 6 };
          return this.withInteraction(effect ? { ...look, effect: effect.use([]) } : look, state);
        }
      };
    }

    /** The default stroke with an effect added afterwards. */
    class AddedEffectLine extends WebGLLine {
      public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
        return { ...super.getStroke(state), effect: dashFlow.use({ pattern: [40, 30], speed: 120 }) };
      }
    }

    /** Handles hover and selection itself: red while selected, blue otherwise; no withInteraction(). */
    function ownLook(effect?: typeof flow): new (connection: BlockConnection<TConnection>) => WebGLLine {
      return class OwnLookLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
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
      const look = (stroke: TWebGLStroke): [string, number, boolean] => [
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
      const line = new WebGLLine(stubConnection(straight).connection);
      expect(look(line.getStroke({ id: "c", selected: true }))).toEqual(["#fc0", 4, false]);
    });

    it("draws a line without an effect as its stroke: the selection color comes from withInteraction()", () => {
      const line = new WebGLLine(stubConnection(straight, { selected: true }).connection);
      line.update();
      expect(line.getWebGLShape()?.stroke).toEqual({ color: "#fc0", width: 4, dash: undefined });
      expect(encoded(line.getWebGLShape())).toEqual({ rgba: [255, 204, 0, 1], packed: packed(false, true) });
      // The mark of withInteraction() stays on the stroke it returns, not on what the batches draw.
      expect(Object.getOwnPropertySymbols(line.getStroke({ id: "c", selected: true }))).toHaveLength(1);
      expect(Object.getOwnPropertySymbols(line.getWebGLShape()?.stroke ?? {})).toEqual([]);

      const styles = { selectedBackground: "rgba(255, 0, 0, 0.5)" };
      const styled = new PlainLook(stubConnection(straight, { selected: true, styles }).connection);
      styled.update();
      expect(encoded(styled.getWebGLShape()).rgba).toEqual([255, 0, 0, 0.5]);
    });

    it("gives an effect the line's own color in place of the selection color withInteraction() applied", () => {
      for (const Line of [EffectLook, AddedEffectLine]) {
        const selected = stubConnection(closedArrowGeometry, { selected: true });
        const line = new Line(selected.connection);
        line.update();
        const shape = line.getWebGLShape();
        const own = Line === EffectLook ? "#2f7cf6" : "#aaa";
        expect(shape?.stroke.color).toBe(own);
        expect(shape?.effectShowsSelection).toBe(true);
        expect(shape?.interaction).toEqual({ hovered: false, selected: true, selectionColor: "#fc0" });
        expect(encoded(shape).packed).toBe(packed(false, true, true));
        // The arrow and the Path2D fallback have no effect: they draw the stroke, in the selection color.
        expect(line.arrow.getWebGLShape?.()?.stroke.color).toBe("#fc0");
        line.style(selected.ctx);
        expect(selected.ctx.strokeStyle).toBe("#ffcc00");
      }

      const hovered = new AddedEffectLine(stubConnection(straight, { hovered: true }, noArrows).connection);
      hovered.update();
      expect(hovered.getWebGLShape()?.stroke.color).toBe("#aaa");
      expect(hovered.getWebGLShape()?.effectShowsSelection).toBeUndefined();
      expect(encoded(hovered.getWebGLShape()).packed).toBe(packed(true, false));
    });

    it("keeps a color set over withInteraction() for an effect: drawn as returned", () => {
      class OverriddenLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
          const stroke = { ...super.getStroke(state), effect: flow.use([]) };
          return state.selected ? { ...stroke, color: "#e5484d" } : stroke;
        }
      }
      const selected = stubConnection(closedArrowGeometry, { selected: true });
      const line = new OverriddenLine(selected.connection);
      line.update();
      expect(line.getWebGLShape()?.stroke.color).toBe("#e5484d");
      expect(line.getWebGLShape()?.effectShowsSelection).toBeUndefined();
      expect(line.arrow.getWebGLShape?.()?.stroke.color).toBe("#e5484d");
    });

    it("draws a stroke returned without withInteraction() as it is; its effect still gets the interaction", () => {
      const selected = stubConnection(closedArrowGeometry, { selected: true });
      const line = new (ownLook())(selected.connection);
      line.update();
      expect(line.getWebGLShape()?.stroke).toEqual({ color: "#f00", width: 2 });
      expect(line.arrow.getWebGLShape?.()?.stroke).toEqual({ color: "#f00", width: 2 });
      expect(selected.batch.items.get(line)?.group).toBe("line/#f00/2/");

      const withEffect = stubConnection(closedArrowGeometry, { selected: true });
      const effectLine = new (ownLook(widen as unknown as typeof flow))(withEffect.connection);
      effectLine.update();
      const shape = effectLine.getWebGLShape();
      expect(shape?.stroke).toEqual({ color: "#f00", width: 2 });
      expect(shape?.effectShowsSelection).toBeUndefined();
      expect(shape?.interaction).toEqual({ hovered: false, selected: true, selectionColor: "#fc0" });
      expect(effectLine.arrow.getWebGLShape?.()?.stroke.color).toBe("#f00");
      effectLine.style(withEffect.ctx);
      expect(withEffect.ctx.strokeStyle).toBe("#ff0000");
    });

    it("passes the interaction of the state update() reads into the line shape, not the arrow shape", () => {
      const { connection } = stubConnection(closedArrowGeometry);
      const line = new EffectLook(connection);
      line.update();
      expect(line.getWebGLShape()?.interaction).toEqual({ hovered: false, selected: false, selectionColor: "#fc0" });
      expect(line.arrow.getWebGLShape?.()?.interaction).toBeUndefined();

      // The state passed to update(), not the connection's.
      const selectedBackground = "rgba(255, 0, 0, 0.5)";
      line.update({ id: "c", hovered: true, selected: true, styles: { selectedBackground } }, connection.props);
      expect(line.getWebGLShape()?.interaction).toEqual({
        hovered: true,
        selected: true,
        selectionColor: selectedBackground,
      });
      expect(line.getWebGLShape()?.stroke.color).toBe("#2f7cf6");
    });

    it("rebuilds the shape when only the interaction changes", () => {
      const stroke: TWebGLStroke = { color: "#2f7cf6", width: 6, effect: flow.use([]) };
      class FixedLine extends WebGLLine {
        public override getStroke(): TWebGLStroke {
          return stroke;
        }
      }
      const { connection } = stubConnection(straight, {}, noArrows);
      const line = new FixedLine(connection);
      line.update();
      const before = line.getWebGLShape();
      expect(line.getWebGLShape()).toBe(before);
      line.update({ id: "c", selected: true }, connection.props);
      const after = line.getWebGLShape();
      expect(after).not.toBe(before);
      expect(after?.interaction?.selected).toBe(true);
    });

    it("draws the Path2D fallback of a selected effect line from its stroke, with the fallback's width", () => {
      class WidenLine extends WebGLLine {
        public override getStroke(state: Parameters<WebGLLine["getStroke"]>[0]): TWebGLStroke {
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
