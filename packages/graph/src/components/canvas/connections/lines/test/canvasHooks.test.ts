import type { TConnectionGeometry } from "../../geometry";
import { SceneLine } from "../SceneLine";
import type { TLineStroke } from "../types";

import { closedArrowGeometry, straight, stubConnection } from "./utils/lineFixture";
import type { TStubState } from "./utils/lineFixture";

describe("SceneLine Canvas hooks", () => {
  it("keeps data-driven strokes and custom hit tests in the scene", () => {
    class StatusLine extends SceneLine {
      public override getStroke(): TLineStroke {
        return { color: "#079", width: 4 };
      }
      public override hitTest(): boolean {
        return true;
      }
    }
    expect(new StatusLine(stubConnection(straight).connection).usesCanvasDrawing()).toBe(false);
  });

  it("detects inherited Canvas paths and instance-level paint hooks", () => {
    class CustomPath extends SceneLine {
      protected override createArrowPath(geometry: TConnectionGeometry): Path2D {
        return super.createArrowPath(geometry);
      }
    }
    class InheritedPath extends CustomPath {}
    class CustomPaint extends SceneLine {
      public override style = (ctx: CanvasRenderingContext2D) => super.style(ctx);
    }
    const { connection } = stubConnection(straight);
    expect(new InheritedPath(connection).usesCanvasDrawing()).toBe(true);
    expect(new CustomPaint(connection).usesCanvasDrawing()).toBe(true);
  });

  it("distinguishes the connection's existing decoration from a line's own Canvas callback", () => {
    const { connection, ctx } = stubConnection(straight);
    const decoration = jest.fn();
    connection.afterRender = decoration;
    const line = new SceneLine(connection);
    expect(line.usesCanvasDrawing()).toBe(false);
    const draw = line.afterRender;
    draw?.(ctx);
    expect(decoration).toHaveBeenCalledWith(ctx);
    line.afterRender = jest.fn();
    expect(line.usesCanvasDrawing()).toBe(true);
  });

  it("registers the line and the arrow one level below with Path2D style groups", () => {
    const { connection, batch } = stubConnection(straight);
    const line = new SceneLine(connection);
    line.update();
    expect(batch.items.get(line)).toEqual({ zIndex: 0, group: "line/#aaa/2/" });
    expect(batch.items.get(line.arrow)).toEqual({ zIndex: -1, group: "arrow/open/#aaa/2//line/#aaa/2/" });

    const hovered = stubConnection(straight, { hovered: true });
    const hoveredLine = new SceneLine(hovered.connection);
    hoveredLine.update();
    expect(hovered.batch.items.get(hoveredLine)?.group).toBe("line/#aaa/4/");
    expect(hovered.batch.items.get(hoveredLine.arrow)?.group).toBe("arrow/open/#aaa/4//line/#aaa/4/");
  });

  it("deletes the arrow item when arrows are off", () => {
    const { connection, batch } = stubConnection(straight, {}, { showConnectionArrows: false });
    const line = new SceneLine(connection);
    line.update();
    expect(batch.has(line)).toBe(true);
    expect(batch.has(line.arrow)).toBe(false);
  });

  it("reads the stroke once per update and the arrow stroke only while arrows are shown", () => {
    const { connection } = stubConnection(straight);
    const line = new SceneLine(connection);
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
    const hiddenLine = new SceneLine(hidden.connection);
    const hiddenStroke = jest.spyOn(hiddenLine, "getStroke");
    const hiddenArrowStroke = jest.spyOn(hiddenLine, "getArrowStroke");
    hiddenLine.update();
    expect(hiddenStroke).toHaveBeenCalledTimes(1);
    expect(hiddenArrowStroke).not.toHaveBeenCalled();
  });

  it("puts closed and open arrows in different groups", () => {
    const open = stubConnection(straight);
    const openLine = new SceneLine(open.connection);
    openLine.update();
    const closed = stubConnection(closedArrowGeometry);
    const closedLine = new SceneLine(closed.connection);
    closedLine.update();
    expect(closed.batch.items.get(closedLine.arrow)?.group).toContain("arrow/closed/");
    expect(closed.batch.items.get(closedLine.arrow)?.group).not.toBe(open.batch.items.get(openLine.arrow)?.group);
  });

  it("invalidate() runs the connection's invalidateLine(), which also keeps bounds and the label in step", () => {
    const { connection } = stubConnection(straight);
    const invalidateLine = jest.fn();
    Object.assign(connection, { invalidateLine });
    const line = new SceneLine(connection);
    line.update();
    line.invalidate();
    expect(invalidateLine).toHaveBeenCalledTimes(1);
  });

  it("update() with an unchanged stroke marks the line dirty", () => {
    const { connection, batch } = stubConnection(straight);
    const line = new SceneLine(connection);
    line.update();
    batch.dirty.length = 0;
    line.update();
    expect(batch.dirty).toContain(line);
  });

  it("applies the stroke in style() and styleArrow()", () => {
    const { connection, ctx } = stubConnection(straight, { dashed: true, styles: { dashes: [3, 2] } });
    const line = new SceneLine(connection);
    line.update();
    const setLineDash = jest.spyOn(ctx, "setLineDash");
    expect(line.style(ctx)).toEqual({ type: "stroke" });
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe("#aaaaaa");
    expect(setLineDash).toHaveBeenCalledWith([3, 2]);
    expect(line.styleArrow(ctx)).toEqual({ type: "stroke" });

    const closed = stubConnection(closedArrowGeometry);
    const closedLine = new SceneLine(closed.connection);
    closedLine.update();
    expect(closedLine.styleArrow(closed.ctx)).toEqual({ type: "both" });
    expect(closed.ctx.fillStyle).toBe("#aaaaaa");
  });

  it("builds the path once per geometry object", () => {
    let created = 0;
    class CountingLine extends SceneLine {
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

    const none = new SceneLine(stubConnection(undefined).connection);
    expect(none.getPath()).toBeUndefined();
    expect(none.getArrowPath()).toBeUndefined();
  });

  describe("hitTest", () => {
    class CustomPathLine extends SceneLine {
      protected override createPath(geometry: TConnectionGeometry): Path2D {
        return super.createPath(geometry);
      }
    }

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
      const line = new CustomPathLine(connection);
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
      const line = new CustomPathLine(connection);
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
      const line = new CustomPathLine(connection);
      jest.spyOn(ctx, "isPointInStroke").mockReturnValue(false);
      const inPath = jest.spyOn(ctx, "isPointInPath").mockReturnValue(true);
      expect(line.hitTest(5, 6, 8)).toBe(true);
      expect(inPath).toHaveBeenCalledWith(line.getArrowPath(), 5, 6);

      const open = stubConnection(straight);
      jest.spyOn(open.ctx, "isPointInStroke").mockReturnValue(false);
      const openInPath = jest.spyOn(open.ctx, "isPointInPath").mockReturnValue(true);
      expect(new CustomPathLine(open.connection).hitTest(5, 6, 8)).toBe(false);
      expect(openInPath).not.toHaveBeenCalled();
    });

    it("skips the arrow when arrows are off", () => {
      const { connection, ctx } = stubConnection(closedArrowGeometry, {}, { showConnectionArrows: false });
      const line = new CustomPathLine(connection);
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
    const tight = new SceneLine(stubConnection(bezier).connection).getBounds(bezier);
    const loose = new SceneLine(
      stubConnection(bezier, {}, { showConnectionArrows: true, useTightBezierBounds: false }).connection
    ).getBounds(bezier);
    expect(tight).toBeDefined();
    expect(loose).toBeDefined();
    expect(tight?.[3]).toBeLessThan(loose?.[3] as number);
  });
});

describe("ConnectionLine.withInteraction()", () => {
  /** A custom look through withInteraction(): a 6-unit dashed line. */
  class StyledLine extends SceneLine {
    public override getStroke(state: Parameters<SceneLine["getStroke"]>[0]): TLineStroke {
      return this.withInteraction({ color: "#123456", width: 6, dash: { pattern: [3, 2] } }, state);
    }
  }

  it("keeps the dash and changes only the color and the width on hover and selection", () => {
    const stroke = (state: TStubState): TLineStroke =>
      new StyledLine(stubConnection(straight, state).connection).getStroke({ id: "c", ...state });
    expect(stroke({})).toEqual({ color: "#123456", width: 6, dash: { pattern: [3, 2] } });
    expect(stroke({ hovered: true })).toEqual({ color: "#123456", width: 8, dash: { pattern: [3, 2] } });
    expect(stroke({ selected: true })).toMatchObject({ color: "#fc0", width: 8, dash: { pattern: [3, 2] } });
    expect(stroke({ selected: true, styles: { selectedBackground: "#0f0" } })).toMatchObject({
      color: "#0f0",
      width: 8,
      dash: { pattern: [3, 2] },
    });
  });

  it("returns the stroke itself when the line is neither hovered nor selected", () => {
    class Probe extends SceneLine {
      public probe(stroke: TLineStroke, state: TStubState): TLineStroke {
        return this.withInteraction(stroke, { id: "c", ...state });
      }
    }
    const probe = new Probe(stubConnection(straight).connection);
    const stroke = { color: "#123456", width: 6 };
    expect(probe.probe(stroke, {})).toBe(stroke);
    expect(probe.probe(stroke, { hovered: true })).not.toBe(stroke);
  });

  it("is what the default stroke is built on: the theme color, width 2, selected 4 in the selected color", () => {
    const stroke = (state: TStubState): TLineStroke =>
      new SceneLine(stubConnection(straight, state).connection).getStroke({ id: "c", ...state });
    expect(stroke({ dashed: true })).toEqual({ color: "#aaa", width: 2, dash: { pattern: [6, 4] } });
    expect(stroke({ dashed: true, selected: true })).toEqual({ color: "#fc0", width: 4, dash: { pattern: [6, 4] } });
    expect(stroke({ hovered: true })).toEqual({ color: "#aaa", width: 4, dash: undefined });
  });
});
