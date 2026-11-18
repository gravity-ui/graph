import { Block, TBlock, TBlockProps } from "./components/canvas/blocks/Block";
import { BlockConnection } from "./components/canvas/connections/BlockConnection";
import { Graph } from "./graph";
import { Component } from "./lib/Component";
import { globalScheduler } from "./lib/Scheduler";
import { PortState } from "./store/connection/port/Port";
import { createBlockPointPortId } from "./store/connection/port/utils";

function block(id: string, x: number, y = 0, is = "stage"): TBlock {
  return { id, x, y, is, name: id, width: 100, height: 50, anchors: [] };
}

const stage = block("a", 0);
const blocks = [stage, block("b", 300), block("c", 600), block("d", 0, 300)];
const edge = { id: "c1", sourceBlockId: "a", targetBlockId: "b", styles: { background: "red" } };

class StageBlock extends Block {}
class OtherBlock extends Block {}
class FlowConnection extends BlockConnection {}

function frames(): void {
  for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
}

describe("Graph entity updates", () => {
  let graph: Graph;

  function start(blockType = StageBlock, connection = FlowConnection): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        blocks,
        connections: [edge, { id: "c2", sourceBlockId: "d", targetBlockId: "a" }],
        settings: { blockComponents: { stage: blockType, other: OtherBlock }, connection, useBezierConnections: false },
      },
      root
    );
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    frames();
  }

  function blockView(id: string): Block {
    const view = graph.blocks.getBlockState(id)?.getViewComponent();
    if (!view) throw new Error(`No block view for ${id}`);
    return view;
  }

  function connectionView(id: string): BlockConnection {
    const view = graph.connections.getConnectionState(id)?.getViewComponent();
    if (!(view instanceof BlockConnection)) throw new Error(`No connection view for ${id}`);
    return view;
  }

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("removes omitted snapshot fields from retained views, including changes queued before the frame", () => {
    class CustomConnection extends FlowConnection {
      public markPreview(): void {
        this.setState({ preview: true });
      }
    }
    start(StageBlock, CustomConnection);
    const block = blockView("a");
    const connection = connectionView("c1") as CustomConnection;
    const decoratedBlock = { ...stage, meta: { status: "ready" } };
    const plainEdge = { id: edge.id, sourceBlockId: "a", targetBlockId: "b" };
    const decoratedEdge = { ...plainEdge, label: "Old label", styles: edge.styles };
    const snapshot = { blocks, connections: [plainEdge] };
    const decorated = { blocks: [decoratedBlock, ...blocks.slice(1)], connections: [decoratedEdge] };

    graph.setEntities(decorated);
    frames();
    expect(block.state.meta).toEqual(decoratedBlock.meta);
    expect(connection.state.label).toBe(decoratedEdge.label);
    connection.markPreview();
    graph.setEntities(snapshot);
    expect(block.getState()).not.toHaveProperty("meta");
    expect(connection.getState()).not.toHaveProperty("label");
    frames();
    expect(blockView("a")).toBe(block);
    expect(connectionView("c1")).toBe(connection);
    expect(block.state).not.toHaveProperty("meta");
    expect(connection.state).not.toHaveProperty("styles");
    expect(connection.state).not.toHaveProperty("label");
    expect(connection.state.preview).toBe(true);

    graph.setEntities(decorated);
    graph.setEntities(snapshot);
    graph.updateEntities({ connections: [{ id: edge.id, label: "New label" }] });
    frames();
    expect(block.state).not.toHaveProperty("meta");
    expect(connection.state.label).toBe("New label");
    expect(connection.state.styles).not.toHaveProperty("background");

    graph.setEntities(snapshot);
    graph.setEntities({ blocks, connections: [{ ...plainEdge, label: undefined }] });
    frames();
    expect(connection.state).toHaveProperty("label", undefined);
  });

  it("drops queued data from the old block when two snapshots remove and restore its ID before a frame", () => {
    start();
    const retained = blockView("a");
    graph.updateEntities({ blocks: [{ ...stage, meta: { status: "old" } }] });
    expect(retained.getState().meta).toEqual({ status: "old" });

    graph.setEntities({ blocks: blocks.slice(1) });
    graph.setEntities({ blocks });
    frames();

    expect(blockView("a")).toBe(retained);
    expect(retained.state).not.toHaveProperty("meta");
  });

  it("applies existing rows without delivering unchanged parent props to the entire list", () => {
    start();
    const moved = blockView("a");
    const untouchedBlock = jest.spyOn(blockView("b"), "setProps");
    const link = connectionView("c1");
    const untouchedConnection = jest.spyOn(connectionView("c2"), "setProps");
    const edgeState = graph.connections.getConnectionState("c1");
    const nextPort = graph.connections.getPort(createBlockPointPortId("c", true));
    if (!edgeState || !nextPort) throw new Error("Expected mounted connection and target port");
    const previousPort = edgeState.$targetPortState.value;
    const delegatedPort = new PortState({ id: "group", x: 610, y: 25 });
    nextPort.delegate(delegatedPort);
    const blockListeners = [graph.blocks.$blocks, graph.blocks.$blocksMap, graph.blocks.$blocksReactiveState].map(
      (list) => {
        const listener = jest.fn();
        list.subscribe(listener);
        listener.mockClear();
        return listener;
      }
    );
    const connectionListeners = [graph.connections.$connections, graph.connections.$connectionsMap].map((list) => {
      const listener = jest.fn();
      list.subscribe(listener);
      listener.mockClear();
      return listener;
    });
    const change = jest.fn();
    moved.onChange(change);

    graph.updateEntities({
      blocks: [{ ...stage, x: 50 }],
      connections: [{ id: edge.id, targetBlockId: "c", styles: { dashes: [4, 4] } }],
    });
    frames();

    expect(blockView("a") === moved).toBe(true);
    expect(moved.state.x).toBe(50);
    expect(change).toHaveBeenCalledWith(moved);
    expect(connectionView("c1") === link).toBe(true);
    expect(edgeState.$state.value.styles).toEqual({ background: "red", dashes: [4, 4] });
    expect(previousPort.observers.has(edgeState)).toBe(false);
    expect(edgeState.$targetPortState.value === nextPort).toBe(true);
    expect(nextPort.observers.has(edgeState)).toBe(true);
    expect(link.connectionPoints).toEqual([
      { x: 150, y: 25 },
      { x: 610, y: 25 },
    ]);
    expect(graph.getElementOverPoint({ x: 430, y: 25 }) === link).toBe(true);
    for (const listener of [...blockListeners, ...connectionListeners]) expect(listener).toHaveBeenCalledTimes(1);
    expect(untouchedBlock).not.toHaveBeenCalled();
    expect(untouchedConnection).not.toHaveBeenCalled();
  });

  it("reconciles a changed class and any newly inserted rows in collection order", () => {
    start();
    const oldView = blockView("a");
    const oldState = graph.blocks.getBlockState("a");
    graph.api.updateBlock({ id: "a", is: "other" });
    frames();
    expect(blockView("a") === oldView).toBe(true);

    graph.updateEntities({ blocks: [{ ...blocks[1], x: 320 }] });
    frames();
    expect(graph.blocks.getBlockState("a")).toBe(oldState);
    expect(blockView("a")).toBeInstanceOf(OtherBlock);
    expect(oldView.isMounted()).toBe(false);

    graph.updateEntities({ blocks: [{ ...stage, x: 10 }] });
    frames();
    expect(blockView("a")).toBeInstanceOf(StageBlock);

    graph.updateEntities({
      blocks: [block("e", 900), block("e", 920)],
      connections: [{ id: "c3", sourceBlockId: "a", targetBlockId: "e" }],
    });
    frames();
    expect(blockView("e").state.x).toBe(920);
    expect(graph.blocks.$blocks.value.map(({ id }) => id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(connectionView("c3").connectionPoints).toEqual([
      { x: 110, y: 25 },
      { x: 920, y: 25 },
    ]);
  });

  it("keeps explicit custom parent-props hooks on entity publications", () => {
    const blockPropsChanged = jest.fn();
    class ParentPropsBlock extends StageBlock {
      protected override propsChanged = (props: TBlockProps): void => {
        super.propsChanged(props);
        blockPropsChanged(this.props.id);
      };
    }
    const receiveParentProps = jest.fn();
    class ParentPropsConnection extends FlowConnection {
      protected override shouldReceiveParentProps(): boolean {
        receiveParentProps(this.props.id);
        return true;
      }
    }
    start(ParentPropsBlock, ParentPropsConnection);
    blockPropsChanged.mockClear();
    receiveParentProps.mockClear();

    graph.updateEntities({ blocks: [{ ...stage, x: 25 }], connections: [{ ...edge, label: "new" }] });
    frames();

    expect(blockPropsChanged).toHaveBeenCalledWith("b");
    expect(receiveParentProps).toHaveBeenCalledWith("c2");
  });

  it("retries a block whose constructor rejected its old data", () => {
    class CheckedBlock extends StageBlock {
      constructor(props: TBlockProps, parent: Component) {
        super(props, parent);
        if (this.getState().name === "invalid") throw new Error("invalid block");
      }
    }
    start(CheckedBlock);
    const valid = block("retry", 800);
    graph.updateEntities({ blocks: [{ ...valid, name: "invalid" }] });
    expect(frames).toThrow("invalid block");

    graph.updateEntities({ blocks: [valid] });
    frames();
    expect(blockView("retry").isMounted()).toBe(true);
  });

  it("retries a connection whose constructor rejected its old data", () => {
    class CheckedConnection extends FlowConnection {
      constructor(...args: ConstructorParameters<typeof FlowConnection>) {
        super(...args);
        if (this.getState().label === "invalid") throw new Error("invalid connection");
      }
    }
    start(StageBlock, CheckedConnection);
    const valid = { ...edge, id: "retry", label: "valid" };
    graph.updateEntities({ connections: [{ ...valid, label: "invalid" }] });
    expect(frames).toThrow("invalid connection");

    graph.updateEntities({ connections: [valid] });
    frames();
    expect(connectionView("retry").isMounted()).toBe(true);
  });
});
