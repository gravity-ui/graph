import { Graph } from "../../../graph";
import { TConnection } from "../../../store/connection/ConnectionState";
import { TRect } from "../../../utils/types/shapes";

import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";
import { getLabelCoords } from "./labelHelper";

const props: TConnectionProps = {
  id: "c",
  useBezier: false,
  bezierDirection: "horizontal",
  showConnectionArrows: true,
  showConnectionLabels: true,
};

type TSegment = { x1: number; y1: number; x2: number; y2: number };

function createGraph(target: { x: number; y: number } = { x: 400, y: 200 }): Graph {
  const graph = new Graph(
    { connections: [{ id: "c", sourcePortId: "s", targetPortId: "t", label: "Label" }] },
    document.createElement("div")
  );
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ x: 0, y: 0, lookup: false });
  state.$targetPortState.value.updatePort({ ...target, lookup: false });
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

class ThickConnection extends BlockConnection<TConnection> {
  public get canvasContext(): CanvasRenderingContext2D {
    return this.context.ctx;
  }

  public refresh(): void {
    this.updatePoints();
  }

  public override getStrokeWidth(): number {
    return 40;
  }
}

class TolerantConnection extends ThickConnection {
  protected override getHitTolerance(): number {
    return 25;
  }
}

class TolerantMultipointConnection extends MultipointConnection {
  public get canvasContext(): CanvasRenderingContext2D {
    return this.context.ctx;
  }

  protected override getHitTolerance(): number {
    return 25;
  }
}

class HoverableConnection extends BlockConnection<TConnection> {
  public get canvasContext(): CanvasRenderingContext2D {
    return this.context.ctx;
  }

  public refresh(): void {
    this.updatePoints();
  }

  public hover(hovered: boolean): void {
    this.setState({ hovered });
    this.checkData();
  }
}

class LabelledConnection extends BlockConnection<TConnection> {
  public refresh(): void {
    this.updatePoints();
  }

  public renderLabel(ctx: CanvasRenderingContext2D): void {
    // Apply the pending state (with the label) as the scheduler does before rendering
    this.checkData();
    this.renderLabelText(ctx);
  }

  /** Runs the per-frame overlay pass that decides whether the label is drawn */
  public renderOverlay(ctx: CanvasRenderingContext2D): void {
    this.checkData();
    this.afterRender?.(ctx);
  }

  public get label(): BlockConnection<TConnection>["labelGeometry"] {
    return this.labelGeometry;
  }

  protected override isVisible(): boolean {
    return true;
  }
}

class RoutedConnection extends LabelledConnection {
  public segment: TSegment = { x1: 1000, y1: 1000, x2: 1200, y2: 1100 };

  protected override getLabelSegment(): TSegment {
    return this.segment;
  }
}

function expectLabelInsideHitBox(view: LabelledConnection): void {
  const label = view.label;
  if (!label) throw new Error("Expected label geometry");
  const [x, y, width, height] = view.getHitBox();
  expect(label.x).toBeGreaterThanOrEqual(x);
  expect(label.y).toBeGreaterThanOrEqual(y);
  expect(label.x + label.width).toBeLessThanOrEqual(x + width);
  expect(label.y + label.height).toBeLessThanOrEqual(y + height);
}

function recordHitTestLineWidth(view: BlockConnection<TConnection>, ctx: CanvasRenderingContext2D): number[] {
  const widths: number[] = [];
  const spy = jest.spyOn(ctx, "isPointInStroke").mockImplementation(() => {
    widths.push(ctx.lineWidth);
    return false;
  });
  view.onHitBox({ minX: 0, minY: 0, maxX: 2, maxY: 2, x: 1, y: 1 });
  spy.mockRestore();
  return widths;
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

  it("puts connections with different stroke widths into different batch groups", () => {
    const graph = createGraph();
    const regular = new BlockConnection(props, createParent(graph));
    const wide = new WideConnection(props, createParent(graph));

    // Each batch chunk is styled by its first item, so the group key must include the width
    expect(wide.getClassName()).not.toBe(regular.getClassName());
  });

  it("hit-tests a stroke wider than the tolerance with the default tolerance", () => {
    const graph = createGraph();
    const view = new ThickConnection(props, createParent(graph));
    view.refresh();

    const tolerance = graph.graphConstants.connection.THRESHOLD_LINE_HIT * 2;
    expect(recordHitTestLineWidth(view, view.canvasContext)).toEqual([tolerance]);
  });

  it("keeps the hit-test tolerance when the connection is hovered", () => {
    const graph = createGraph();
    // A tolerance below the hovered stroke width (4)
    graph.setConstants({ connection: { THRESHOLD_LINE_HIT: 1 } });
    const view = new HoverableConnection(props, createParent(graph));
    view.refresh();

    const idle = recordHitTestLineWidth(view, view.canvasContext);
    view.hover(true);
    const hovered = recordHitTestLineWidth(view, view.canvasContext);

    expect(idle).toEqual([2]);
    expect(hovered).toEqual([2]);
  });

  it("hit-tests with the tolerance returned by getHitTolerance", () => {
    const view = new TolerantConnection(props, createParent(createGraph()));
    view.refresh();

    expect(recordHitTestLineWidth(view, view.canvasContext)).toEqual([25]);
  });

  it("pads the hit box by half of the default hit tolerance", () => {
    const graph = createGraph();
    const view = new ThickConnection(props, createParent(graph));
    view.refresh();

    // The ports span [0, 0]–[400, 200]; the 40px stroke width does not matter
    const padding = graph.graphConstants.connection.THRESHOLD_LINE_HIT;
    expect(view.getHitBox()).toEqual([-padding, -padding, 400 + padding * 2, 200 + padding * 2]);
  });

  it("pads the hit box by half of the tolerance returned by getHitTolerance", () => {
    const view = new TolerantConnection(props, createParent(createGraph()));
    view.refresh();

    // getHitTolerance() is 25, so the hit box covers every point the stroke hit test can accept
    expect(view.getHitBox()).toEqual([-12.5, -12.5, 425, 225]);
  });

  it("hit-tests a multipoint connection with the tolerance returned by getHitTolerance", () => {
    const view = new TolerantMultipointConnection(props, createParent(createGraph()));
    view.updatePoints();

    expect(recordHitTestLineWidth(view, view.canvasContext)).toEqual([25]);
  });

  it("keeps the label of a horizontal connection inside the hit box", () => {
    const view = new LabelledConnection(props, createParent(createGraph({ x: 400, y: 0 })));
    view.refresh();

    view.renderLabel(createContext());

    expectLabelInsideHitBox(view);
  });

  it("stops catching the pointer on the label once the label is no longer drawn", () => {
    const graph = createGraph({ x: 400, y: 0 });
    const view = new LabelledConnection(props, createParent(graph));
    view.refresh();
    const ctx = createContext();

    view.renderOverlay(ctx);
    const label = view.label;
    if (!label) throw new Error("Expected the label to be drawn");
    const x = label.x + label.width / 2;
    const y = label.y + label.height / 2;
    const hitLabel = (): boolean => view.onHitBox({ minX: x - 1, minY: y - 1, maxX: x + 1, maxY: y + 1, x: -1, y: -1 });
    expect(hitLabel()).toBe(true);

    // Labels are not drawn below MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL
    graph.cameraService.set({ scale: graph.graphConstants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL / 2 });
    view.renderOverlay(ctx);

    expect(view.label).toBeUndefined();
    expect(hitLabel()).toBe(false);
    // The hit box shrinks back to the line: a horizontal line padded by half of the hit tolerance
    const padding = graph.graphConstants.connection.THRESHOLD_LINE_HIT;
    expect(view.getHitBox()).toEqual([-padding, -padding, 400 + padding * 2, padding * 2]);
  });

  it("keeps a label placed off the route by getLabelSegment inside the hit box", () => {
    const view = new RoutedConnection(props, createParent(createGraph()));
    view.refresh();

    view.renderLabel(createContext());

    expectLabelInsideHitBox(view);
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
