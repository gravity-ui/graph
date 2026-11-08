import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { defineConnectionEffect, toConnectionEffect } from "../effects";
import { bezierSegment, blockGeometry, lineSegment, multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import { WebGLLine } from "./WebGLLine";
import type { TWebGLStroke } from "./WebGLLine";

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

    it("keeps the effect on hover and selection: only the color and the width change", () => {
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
});
