import { Graph } from "../../../graph";
import { TConnection } from "../../../store/connection/ConnectionState";
import { TRect } from "../../../utils/types/shapes";

import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { getLabelCoords } from "./labelHelper";

const props: TConnectionProps = {
  id: "c",
  useBezier: false,
  bezierDirection: "horizontal",
  showConnectionArrows: true,
  showConnectionLabels: true,
};

type TSegment = { x1: number; y1: number; x2: number; y2: number };

function createGraph(): Graph {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t", label: "Label" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ x: 0, y: 0, lookup: false });
  state.$targetPortState.value.updatePort({ x: 400, y: 200, lookup: false });
  return graph;
}

function createParent(graph: Graph): BlockConnections {
  return new BlockConnections({}, graph.getGraphLayer());
}

function createContext(): CanvasRenderingContext2D {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected 2d context");
  return ctx;
}

class WideConnection extends BlockConnection<TConnection> {
  public override getStrokeWidth(): number {
    return 7;
  }
}

class RoutedConnection extends BlockConnection<TConnection> {
  public segment: TSegment = { x1: 1000, y1: 1000, x2: 1200, y2: 1100 };

  public renderLabel(ctx: CanvasRenderingContext2D): void {
    // Apply the pending state (with the label) as the scheduler does before rendering
    this.checkData();
    this.renderLabelText(ctx);
  }

  public get label(): BlockConnection<TConnection>["labelGeometry"] {
    return this.labelGeometry;
  }

  protected override getLabelSegment(): TSegment {
    return this.segment;
  }

  protected override isVisible(): boolean {
    return true;
  }
}

class PaddedConnection extends BlockConnection<TConnection> {
  private margin = 0;

  public refresh(): void {
    this.updatePoints();
  }

  public setMargin(margin: number): void {
    this.margin = margin;
    this.updateHitBox();
  }

  protected override getHitBoxRect(): TRect {
    const rect = super.getHitBoxRect();
    return {
      x: rect.x - this.margin,
      y: rect.y - this.margin,
      width: rect.width + this.margin * 2,
      height: rect.height + this.margin * 2,
    };
  }
}

describe("BlockConnection extension points", () => {
  it("strokes 2px by default and 4px when hovered or selected", () => {
    const view = new BlockConnection(props, createParent(createGraph()));

    expect(view.getStrokeWidth({ ...view.state, hovered: false, selected: false })).toBe(2);
    expect(view.getStrokeWidth({ ...view.state, hovered: true, selected: false })).toBe(4);
    expect(view.getStrokeWidth({ ...view.state, hovered: false, selected: true })).toBe(4);
  });

  it("uses getStrokeWidth for the line and the arrow", () => {
    const view = new WideConnection(props, createParent(createGraph()));
    const ctx = createContext();

    view.style(ctx);
    expect(ctx.lineWidth).toBe(7);

    ctx.lineWidth = 1;
    view.styleArrow(ctx);
    expect(ctx.lineWidth).toBe(7);
  });

  it("places the label on the segment returned by getLabelSegment", () => {
    const graph = createGraph();
    const view = new RoutedConnection(props, createParent(graph));

    view.renderLabel(createContext());

    const label = view.label;
    if (!label) throw new Error("Expected label geometry");
    const { x1, y1, x2, y2 } = view.segment;
    const expected = getLabelCoords(x1, y1, x2, y2, label.width, label.height, graph.graphConstants.system.GRID_SIZE);
    expect(label).toMatchObject({ x: expected.x, y: expected.y });
  });

  it("lets subclasses refresh the hit box when getHitBoxRect depends on more than the points", () => {
    const view = new PaddedConnection(props, createParent(createGraph()));
    view.refresh();
    const [x, y, width, height] = view.getHitBox();

    view.setMargin(10);

    expect(view.getHitBox()).toEqual([x - 10, y - 10, width + 20, height + 20]);
  });
});
