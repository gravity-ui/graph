import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BlockConnection, TConnectionProps } from "./BlockConnection";
import { BlockConnections } from "./BlockConnections";
import { MultipointConnection } from "./MultipointConnection";

const baseProps: TConnectionProps = {
  id: "c",
  useBezier: true,
  bezierDirection: "horizontal",
  useTightBezierBounds: true,
  showConnectionArrows: true,
  showConnectionLabels: false,
};

type TBBox = readonly [number, number, number, number];

interface ITestView extends Component {
  refresh(): void;
  bounds(): TBBox;
  applyProps<K extends keyof TConnectionProps>(nextProps: Pick<TConnectionProps, K>): void;
}

type TTestViewConstructor = new (props: TConnectionProps, parent: BlockConnections) => ITestView;

class TestConnection extends BlockConnection<TConnection> implements ITestView {
  public refresh(): void {
    this.updatePoints();
  }

  public bounds(): TBBox {
    return this.getBBox();
  }

  public applyProps<K extends keyof TConnectionProps>(nextProps: Pick<TConnectionProps, K>): void {
    this.setProps(nextProps);
    this.checkData();
  }

  public get arrow(): BlockConnection<TConnection>["arrowShape"] {
    return this.arrowShape;
  }
}

class TestMultipointConnection extends MultipointConnection implements ITestView {
  public refresh(): void {
    this.updatePoints();
  }

  public bounds(): TBBox {
    return this.getBBox();
  }

  public applyProps<K extends keyof TConnectionProps>(nextProps: Pick<TConnectionProps, K>): void {
    this.setProps(nextProps);
    this.checkData();
  }
}

function createGraph(): Graph {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  // A reversed horizontal curve: legacy control-point bounds are wider than the tight curve bounds.
  state.$sourcePortState.value.updatePort({ x: 700, y: 100, lookup: false });
  state.$targetPortState.value.updatePort({ x: 0, y: 350, lookup: false });
  return graph;
}

function createView(View: TTestViewConstructor, props: TConnectionProps): ITestView {
  const graph = createGraph();
  const view = new View(props, new BlockConnections({}, graph.getGraphLayer()));
  view.refresh();
  return view;
}

function getBBox(View: TTestViewConstructor, props: TConnectionProps): TBBox {
  const view = createView(View, props);
  const bBox = view.bounds();
  Component.unmount(view);
  return bBox;
}

describe.each([
  ["BlockConnection", TestConnection],
  ["MultipointConnection without points", TestMultipointConnection],
])("%s", (_name, View: TTestViewConstructor) => {
  it("recomputes bounds with the next useTightBezierBounds value", () => {
    const tightBBox = getBBox(View, baseProps);
    const legacyBBox = getBBox(View, { ...baseProps, useTightBezierBounds: false });
    expect(legacyBBox).not.toEqual(tightBBox);

    const view = createView(View, baseProps);
    expect(view.bounds()).toEqual(tightBBox);

    view.applyProps({ useTightBezierBounds: false });
    expect(view.bounds()).toEqual(legacyBBox);

    view.applyProps({ useTightBezierBounds: true });
    expect(view.bounds()).toEqual(tightBBox);
    Component.unmount(view);
  });
});

it("keeps the next showConnectionArrows value when bounds mode changes in the same update", () => {
  const graph = createGraph();
  const view = new TestConnection(baseProps, new BlockConnections({}, graph.getGraphLayer()));
  view.refresh();
  const update = jest.spyOn(view.context.batch, "update");
  const remove = jest.spyOn(view.context.batch, "delete");

  view.applyProps({ showConnectionArrows: false, useTightBezierBounds: false });

  expect(remove).toHaveBeenCalledWith(view.arrow);
  expect(update).not.toHaveBeenCalledWith(view.arrow, expect.anything());
  Component.unmount(view);
});
