import type { TBatchParams } from "../../../../lib/batch/types";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import type { BlockConnection } from "../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";
import { multipointGeometry } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import { SceneLine } from "./SceneLine";
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

type StrokeStyle = (base: TLineStroke, state: TBaseConnectionState) => TLineStroke;

function drawn(getStroke: StrokeStyle, state: Partial<TBaseConnectionState>): { line: string; arrow: string } {
  class StyledLine extends SceneLine {
    public override getStroke(currentState: TBaseConnectionState): TLineStroke {
      return getStroke(super.getStroke(currentState), currentState);
    }
  }
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
    getSceneKey: () => undefined,
    getGeometry: () => closedArrow,
    getBatchZIndex: () => 0,
    isPathVisible: () => true,
    getPathBounds: () => undefined,
    isInViewport: () => true,
  } as unknown as BlockConnection<TConnection>;
  const line = new StyledLine(connection);
  line.update();
  line.style(ctx);
  const lineStyle = `${ctx.strokeStyle}/${ctx.lineWidth}`;
  line.styleArrow(ctx);
  return { line: lineStyle, arrow: `${ctx.fillStyle}/${ctx.lineWidth}` };
}

describe("Canvas compatibility painting follows the scene line's interaction styles", () => {
  const selected = { selected: true };

  it("draws the default stroke in the selection color, 2 units wider", () => {
    expect(drawn((base) => base, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
    expect(drawn((base) => base, { hovered: true })).toEqual({ line: "#aaaaaa/4", arrow: "#aaaaaa/4" });
  });

  it("draws a color set over super.getStroke() while selected: the own color wins", () => {
    expect(drawn((base, state) => (state.selected ? { ...base, color: "#e5484d" } : base), selected)).toEqual({
      line: "#e5484d/4",
      arrow: "#e5484d/4",
    });
  });

  it("keeps the selection color of fields picked from super.getStroke()", () => {
    const pick = (base: TLineStroke): TLineStroke => ({
      color: base.color,
      width: base.width,
      dash: { pattern: [4, 4] },
    });
    expect(drawn(pick, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
  });

  it("keeps the selection color of a copy of super.getStroke()", () => {
    const copy = (base: TLineStroke): TLineStroke => JSON.parse(JSON.stringify(base)) as TLineStroke;
    expect(drawn(copy, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
  });

  it("draws a stroke built without withInteraction() as it is", () => {
    const own = (_base: TLineStroke, state: TBaseConnectionState): TLineStroke => ({
      color: state.selected ? "#f00" : "#00f",
      width: 2,
    });
    expect(drawn(own, selected)).toEqual({ line: "#ff0000/2", arrow: "#ff0000/2" });
  });
});
