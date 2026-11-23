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

  it("widens the default shaft and arrow on hover", () => {
    expect(drawn((base) => base, { hovered: true })).toEqual({ line: "#aaaaaa/4", arrow: "#aaaaaa/4" });
  });

  it("draws a color set over super.getStroke() while selected: the own color wins", () => {
    expect(drawn((base, state) => (state.selected ? { ...base, color: "#e5484d" } : base), selected)).toEqual({
      line: "#e5484d/4",
      arrow: "#e5484d/4",
    });
  });

  const inheritedStrokes: Record<string, StrokeStyle> = {
    unchanged: (base) => base,
    "picked fields": ({ color, width }) => ({ color, width, dash: { pattern: [4, 4] } }),
    "serialized copy": (base) => JSON.parse(JSON.stringify(base)) as TLineStroke,
  };
  it.each(Object.entries(inheritedStrokes))("preserves selection color and width for %s", (_name, stroke) => {
    expect(drawn(stroke, selected)).toEqual({ line: "#ffcc00/4", arrow: "#ffcc00/4" });
  });

  it("draws a stroke built without withInteraction() as it is", () => {
    const own = (_base: TLineStroke, state: TBaseConnectionState): TLineStroke => ({
      color: state.selected ? "#f00" : "#00f",
      width: 2,
    });
    expect(drawn(own, selected)).toEqual({ line: "#ff0000/2", arrow: "#ff0000/2" });
  });
});
