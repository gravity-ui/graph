import type { Locator } from "@playwright/test";
import type {
  Graph,
  TBlock,
  TConnection,
  TPoint,
  THitTestPoint,
  TRect,
  UnwrapGraphEventsDetail,
} from "@gravity-ui/graph";
import { GraphPO, type GraphPoint } from "@gravity-ui/graph/playwright";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

const structuralScheduler: Graph["scheduler"] = {
  getSchedulers: () => [[], [], [], [], []],
  addScheduler: (_scheduler) => () => undefined,
  removeScheduler: (_scheduler) => undefined,
  start: () => undefined,
  stop: () => undefined,
  destroy: () => undefined,
  tick: () => undefined,
  performUpdate: () => undefined,
};

type EvaluateGraph = Parameters<Parameters<GraphPO["evaluate"]>[0]>[0];
type BlockState = Awaited<ReturnType<ReturnType<GraphPO["block"]>["getState"]>>;
type ConnectionState = Awaited<ReturnType<ReturnType<GraphPO["connection"]>["getState"]>>;

type _EvaluateGraphIsNotAny = Assert<Equal<IsAny<EvaluateGraph>, false>>;
type _EvaluateReceivesGraph = Assert<Equal<EvaluateGraph, Graph>>;
type _BlockStateIsNotAny = Assert<Equal<IsAny<BlockState>, false>>;
type _BlockStateIsPublicTBlock = Assert<Equal<BlockState, TBlock | null>>;
type _ConnectionStateIsNotAny = Assert<Equal<IsAny<ConnectionState>, false>>;
type _ConnectionStateIsPublicTConnection = Assert<Equal<ConnectionState, TConnection | null>>;

export async function checkPlaywrightConsumerTypes(root: Locator): Promise<void> {
  const graph = new GraphPO(root);
  void structuralScheduler;
  const point: GraphPoint = { x: 0, y: 0 };

  const graphState: Promise<number> = graph.evaluate((instance: Graph) => instance.state);
  const blockState: Promise<TBlock | null> = graph.block("block-1").getState();
  const connectionState: Promise<TConnection | null> = graph.connection("connection-1").getState();

  await Promise.all([graphState, blockState, connectionState]);
  await graph.clickAt(point);
}

export function checkStructuralGeometry(graph: Graph, event: MouseEvent): void {
  const point: TPoint = { x: 100, y: 200 };
  const hitPoint: THitTestPoint = { ...point, origPoint: { x: 50, y: 100 } };
  const rect: TRect = { ...point, width: 300, height: 400 };
  const dropPoint: UnwrapGraphEventsDetail<"connection-create-drop">["point"] = point;
  const portDropPoint: UnwrapGraphEventsDetail<"port-connection-create-drop">["point"] = point;
  const mousePoint: THitTestPoint = graph.getPointInCameraSpace(event);

  graph.getElementOverPoint(point);
  graph.getElementsOverPoint(point);
  graph.getElementOverPoint(hitPoint);
  graph.getElementsOverPoint(mousePoint);
  graph.hitTest.testPoint(point, 2);
  graph.zoomTo(rect);
  void dropPoint;
  void portDropPoint;
}
