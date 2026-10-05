import type { Locator } from "@playwright/test";
import { Point, Rect } from "@gravity-ui/graph";
import type {
  Graph,
  TBlock,
  TConnection,
  TPoint,
  CameraPoint,
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
  const hitPoint: CameraPoint = { world: point, canvas: { x: 50, y: 100 } };
  const rect: TRect = { ...point, width: 300, height: 400 };
  const dropPoint: UnwrapGraphEventsDetail<"connection-create-drop">["point"] = point;
  const portDropPoint: UnwrapGraphEventsDetail<"port-connection-create-drop">["point"] = point;
  const mousePoint: CameraPoint = graph.getPointInCameraSpace(event);
  const cameraPoint: CameraPoint = graph.cameraService.createCameraPoint(point);
  const canvasPoint: CameraPoint = graph.cameraService.createCameraPoint(point, "canvas");

  graph.getElementOverPoint(point);
  graph.getElementsOverPoint(point);
  graph.getElementOverPoint(hitPoint);
  graph.getElementsOverPoint(mousePoint);
  graph.hitTest.testPoint(cameraPoint, 2);
  graph.hitTest.testPoint(canvasPoint, 2);
  // @ts-expect-error HitTest requires prepared coordinates; it cannot access the camera to convert a world point.
  graph.hitTest.testPoint(point, 2);
  // @ts-expect-error A CameraPoint must contain both coordinate spaces.
  const incompletePoint: CameraPoint = { world: point };
  // @ts-expect-error The input coordinate space must be explicit and valid.
  graph.cameraService.createCameraPoint(point, "screen");
  graph.zoomTo(rect);
  const createdPoint: TPoint = Point(100, 200);
  const createdRect: TRect = Rect(0, 0, 300, 400);
  graph.getElementOverPoint(createdPoint);
  graph.getElementsOverPoint(createdPoint);
  graph.zoomTo(createdRect);
  void dropPoint;
  void portDropPoint;
  void incompletePoint;
}
