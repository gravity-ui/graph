import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { blockGeometry, multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import { Path2DLine } from "./Path2DLine";

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

describe("Path2DLine", () => {
  it("registers the line and the arrow one level below with Path2D style groups", () => {
    const { connection, batch } = stubConnection(straight);
    const line = new Path2DLine(connection);
    line.update();
    expect(batch.items.get(line)).toEqual({ zIndex: 0, group: "line/#aaa/2/" });
    expect(batch.items.get(line.arrow)).toEqual({ zIndex: -1, group: "arrow/open/#aaa/2//line/#aaa/2/" });

    const hovered = stubConnection(straight, { hovered: true });
    const hoveredLine = new Path2DLine(hovered.connection);
    hoveredLine.update();
    expect(hovered.batch.items.get(hoveredLine)?.group).toBe("line/#aaa/4/");
    expect(hovered.batch.items.get(hoveredLine.arrow)?.group).toBe("arrow/open/#aaa/4//line/#aaa/4/");
  });

  it("deletes the arrow item when arrows are off", () => {
    const { connection, batch } = stubConnection(straight, {}, { showConnectionArrows: false });
    const line = new Path2DLine(connection);
    line.update();
    expect(batch.has(line)).toBe(true);
    expect(batch.has(line.arrow)).toBe(false);
  });

  it("reads the stroke once per update and the arrow stroke only while arrows are shown", () => {
    const { connection } = stubConnection(straight);
    const line = new Path2DLine(connection);
    const stroke = jest.spyOn(line, "getStroke");
    const arrowStroke = jest.spyOn(line, "getArrowStroke");
    line.update();
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(arrowStroke).toHaveBeenCalledTimes(1);
    expect(arrowStroke.mock.results[0].value).toEqual({ color: "#aaa", width: 2 });
    // Outside update() the arrow stroke reads getStroke() itself.
    line.getArrowStroke(connection.state);
    expect(stroke).toHaveBeenCalledTimes(2);

    const hidden = stubConnection(straight, {}, { showConnectionArrows: false });
    const hiddenLine = new Path2DLine(hidden.connection);
    const hiddenStroke = jest.spyOn(hiddenLine, "getStroke");
    const hiddenArrowStroke = jest.spyOn(hiddenLine, "getArrowStroke");
    hiddenLine.update();
    expect(hiddenStroke).toHaveBeenCalledTimes(1);
    expect(hiddenArrowStroke).not.toHaveBeenCalled();
  });

  it("puts closed and open arrows in different groups", () => {
    const open = stubConnection(straight);
    const openLine = new Path2DLine(open.connection);
    openLine.update();
    const closed = stubConnection(closedArrowGeometry);
    const closedLine = new Path2DLine(closed.connection);
    closedLine.update();
    expect(closed.batch.items.get(closedLine.arrow)?.group).toContain("arrow/closed/");
    expect(closed.batch.items.get(closedLine.arrow)?.group).not.toBe(open.batch.items.get(openLine.arrow)?.group);
  });

  it("invalidate() with an unchanged stroke marks the line dirty", () => {
    const { connection, batch } = stubConnection(straight);
    const line = new Path2DLine(connection);
    line.update();
    batch.dirty.length = 0;
    line.invalidate();
    expect(batch.dirty).toContain(line);
  });

  it("applies the stroke in style() and styleArrow()", () => {
    const { connection, ctx } = stubConnection(straight, { dashed: true, styles: { dashes: [3, 2] } });
    const line = new Path2DLine(connection);
    line.update();
    const setLineDash = jest.spyOn(ctx, "setLineDash");
    expect(line.style(ctx)).toEqual({ type: "stroke" });
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe("#aaaaaa");
    expect(setLineDash).toHaveBeenCalledWith([3, 2]);
    expect(line.styleArrow(ctx)).toEqual({ type: "stroke" });

    const closed = stubConnection(closedArrowGeometry);
    const closedLine = new Path2DLine(closed.connection);
    closedLine.update();
    expect(closedLine.styleArrow(closed.ctx)).toEqual({ type: "both" });
    expect(closed.ctx.fillStyle).toBe("#aaaaaa");
  });

  it("builds the path once per geometry object", () => {
    let created = 0;
    class CountingLine extends Path2DLine {
      protected override createPath(geometry: TConnectionGeometry): Path2D {
        created++;
        return super.createPath(geometry);
      }
    }
    const { connection } = stubConnection(straight);
    const geometry = { current: straight as TConnectionGeometry };
    (connection as unknown as { getGeometry: () => TConnectionGeometry }).getGeometry = () => geometry.current;
    const line = new CountingLine(connection);
    expect(line.getPath()).toBeDefined();
    line.getPath();
    expect(created).toBe(1);

    const next = { segments: new Float32Array(straight.segments) };
    geometry.current = next;
    line.getPath();
    line.getPath();
    expect(created).toBe(2);

    const none = new Path2DLine(stubConnection(undefined).connection);
    expect(none.getPath()).toBeUndefined();
    expect(none.getArrowPath()).toBeUndefined();
  });

  describe("hitTest", () => {
    type TSeen = {
      lineWidth: number;
      lineCap: CanvasLineCap;
      lineJoin: CanvasLineJoin;
      dash: number[];
      transform: [number, number, number, number, number, number];
    };

    function spyStroke(ctx: CanvasRenderingContext2D, seen: TSeen[], result = false): jest.SpyInstance {
      return jest.spyOn(ctx, "isPointInStroke").mockImplementation(() => {
        const m = ctx.getTransform();
        seen.push({
          lineWidth: ctx.lineWidth,
          lineCap: ctx.lineCap,
          lineJoin: ctx.lineJoin,
          dash: ctx.getLineDash(),
          transform: [m.a, m.b, m.c, m.d, m.e, m.f],
        });
        return result;
      });
    }

    function dirtyContext(ctx: CanvasRenderingContext2D): void {
      ctx.setTransform(3, 0, 0, 3, 20, 30);
      ctx.setLineDash([5, 5]);
    }

    function expectRestored(ctx: CanvasRenderingContext2D): void {
      const m = ctx.getTransform();
      expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([3, 0, 0, 3, 20, 30]);
      expect(ctx.getLineDash()).toEqual([5, 5]);
      expect(ctx.lineCap).toBe("butt");
      expect(ctx.lineJoin).toBe("miter");
    }

    it("strokes the line with width + 2 * threshold, identity transform, no dash and round caps and joins", () => {
      const { connection, ctx } = stubConnection({ segments: straight.segments });
      const line = new Path2DLine(connection);
      const seen: TSeen[] = [];
      spyStroke(ctx, seen);
      dirtyContext(ctx);
      expect(line.hitTest(10, 0, 8)).toBe(false);
      expect(seen).toEqual([
        { lineWidth: 18, lineCap: "round", lineJoin: "round", dash: [], transform: [1, 0, 0, 1, 0, 0] },
      ]);
      expectRestored(ctx);
    });

    it("strokes the arrow with the arrow width + 2 * threshold on the arrow path", () => {
      const { connection, ctx } = stubConnection(straight, { hovered: true });
      const line = new Path2DLine(connection);
      const seen: TSeen[] = [];
      const spy = spyStroke(ctx, seen);
      dirtyContext(ctx);
      expect(line.hitTest(10, 0, 8)).toBe(false);
      expect(seen.map((entry) => entry.lineWidth)).toEqual([20, 20]);
      expect(seen[1]).toMatchObject({ lineCap: "round", lineJoin: "round", dash: [], transform: [1, 0, 0, 1, 0, 0] });
      expect(spy.mock.calls[0][0]).toBe(line.getPath());
      expect(spy.mock.calls[1][0]).toBe(line.getArrowPath());
      expectRestored(ctx);
    });

    it("hits a closed arrow by its fill", () => {
      const { connection, ctx } = stubConnection(closedArrowGeometry);
      const line = new Path2DLine(connection);
      jest.spyOn(ctx, "isPointInStroke").mockReturnValue(false);
      const inPath = jest.spyOn(ctx, "isPointInPath").mockReturnValue(true);
      expect(line.hitTest(5, 6, 8)).toBe(true);
      expect(inPath).toHaveBeenCalledWith(line.getArrowPath(), 5, 6);

      const open = stubConnection(straight);
      jest.spyOn(open.ctx, "isPointInStroke").mockReturnValue(false);
      const openInPath = jest.spyOn(open.ctx, "isPointInPath").mockReturnValue(true);
      expect(new Path2DLine(open.connection).hitTest(5, 6, 8)).toBe(false);
      expect(openInPath).not.toHaveBeenCalled();
    });

    it("skips the arrow when arrows are off", () => {
      const { connection, ctx } = stubConnection(closedArrowGeometry, {}, { showConnectionArrows: false });
      const line = new Path2DLine(connection);
      const seen: TSeen[] = [];
      spyStroke(ctx, seen);
      const inPath = jest.spyOn(ctx, "isPointInPath").mockReturnValue(true);
      expect(line.hitTest(5, 6, 8)).toBe(false);
      expect(seen).toHaveLength(1);
      expect(inPath).not.toHaveBeenCalled();
    });
  });

  it("uses tight bounds unless useTightBezierBounds is false", () => {
    const bezier = {
      segments: new Float32Array([0, 0, 0, 100, 100, 100, 100, 0]),
    };
    const tight = new Path2DLine(stubConnection(bezier).connection).getBounds(bezier);
    const loose = new Path2DLine(
      stubConnection(bezier, {}, { showConnectionArrows: true, useTightBezierBounds: false }).connection
    ).getBounds(bezier);
    expect(tight).toBeDefined();
    expect(loose).toBeDefined();
    expect(tight?.[3]).toBeLessThan(loose?.[3] as number);
  });
});
