import type { TBaseConnectionState } from "../../BaseConnection";
import { SceneLine } from "../SceneLine";
import type { TLineStroke } from "../types";

import { closedArrowGeometry, stubConnection } from "./utils/lineFixture";

type StrokeStyle = (base: TLineStroke, state: TBaseConnectionState) => TLineStroke;

function drawn(getStroke: StrokeStyle, state: Partial<TBaseConnectionState>): { line: string; arrow: string } {
  class StyledLine extends SceneLine {
    public override getStroke(currentState: TBaseConnectionState): TLineStroke {
      return getStroke(super.getStroke(currentState), currentState);
    }
  }
  const { connection, ctx } = stubConnection(closedArrowGeometry, state);
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
