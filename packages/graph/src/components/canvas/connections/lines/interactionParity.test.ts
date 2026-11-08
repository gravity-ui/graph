import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import type { ConnectionLine } from "./ConnectionLine";
import { Path2DLine } from "./Path2DLine";
import { WebGLLine } from "./WebGLLine";
import type { TWebGLStroke } from "./WebGLLine";
import type { TLineStroke } from "./types";

class RecordingBatch implements IConnectionBatch {
  public readonly items = new Map<IConnectionBatchItem, TBatchParams>();
  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.update(item, params);
  }
  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    this.items.set(item, { ...params });
  }
  public delete(item: IConnectionBatchItem): void {
    this.items.delete(item);
  }
  public has(item: IConnectionBatchItem): boolean {
    return this.items.has(item);
  }
  public markDirty(): void {}
  public markBoundsDirty(): void {}
  public forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void {
    for (const [item, params] of this.items) visit(item, params);
  }
}

const closedArrow = multipointGeometry({
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

type TLineClass = new (connection: BlockConnection<TConnection>) => ConnectionLine;

/** What a line draws: its line and arrow colors and widths, from the Path2D style of both line kinds. */
function drawn(Line: TLineClass, state: Partial<TBaseConnectionState>): { line: string; arrow: string } {
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
    props: { showConnectionArrows: true, useTightBezierBounds: true },
    getGeometry: () => closedArrow,
    getBatchZIndex: () => 0,
    isPathVisible: () => true,
    getPathBounds: () => undefined,
    isInViewport: () => true,
  } as unknown as BlockConnection<TConnection>;
  const line = new Line(connection);
  line.update();
  line.style(ctx);
  const lineStyle = `${ctx.strokeStyle}/${ctx.lineWidth}`;
  line.styleArrow(ctx);
  return { line: lineStyle, arrow: `${ctx.fillStyle}/${ctx.lineWidth}` };
}

/** The same getStroke() on both line kinds. */
function twins(getStroke: (base: TLineStroke, state: TBaseConnectionState) => TLineStroke): TLineClass[] {
  class CanvasLine extends Path2DLine {
    public override getStroke(state: TBaseConnectionState): TLineStroke {
      return getStroke(super.getStroke(state), state);
    }
  }
  class GLLine extends WebGLLine {
    public override getStroke(state: TBaseConnectionState): TWebGLStroke {
      return getStroke(super.getStroke(state), state);
    }
  }
  return [CanvasLine, GLLine];
}

describe("hover and selection: one getStroke(), the same look in Path2DLine and WebGLLine", () => {
  const selected = { selected: true };

  it("draws the default stroke in the selection color, 2 units wider", () => {
    for (const Line of twins((base) => base)) {
      expect(drawn(Line, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
      expect(drawn(Line, { hovered: true })).toEqual({ line: "#aaaaaa/4", arrow: "#aaaaaa/4" });
    }
  });

  it("draws a color set over super.getStroke() while selected: the own color wins", () => {
    for (const Line of twins((base, state) => (state.selected ? { ...base, color: "#e5484d" } : base))) {
      expect(drawn(Line, selected)).toEqual({ line: "#e5484d/4", arrow: "#e5484d/4" });
    }
  });

  it("keeps the selection color of fields picked from super.getStroke()", () => {
    const pick = (base: TLineStroke): TLineStroke => ({
      color: base.color,
      width: base.width,
      dash: { pattern: [4, 4] },
    });
    for (const Line of twins(pick)) {
      expect(drawn(Line, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
    }
  });

  it("keeps the selection color of a copy of super.getStroke()", () => {
    const copy = (base: TLineStroke): TLineStroke => JSON.parse(JSON.stringify(base)) as TLineStroke;
    for (const Line of twins(copy)) {
      expect(drawn(Line, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
    }
  });

  it("draws a stroke built without withInteraction() as it is", () => {
    const own = (_base: TLineStroke, state: TBaseConnectionState): TLineStroke => ({
      color: state.selected ? "#f00" : "#00f",
      width: 2,
    });
    for (const Line of twins(own)) {
      expect(drawn(Line, selected)).toEqual({ line: "#ff0000/2", arrow: "#ff0000/2" });
    }
  });
});
