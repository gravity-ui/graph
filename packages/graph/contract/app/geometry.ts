import { Point, Rect } from "@gravity-ui/graph";
import type { CameraPoint, Graph, TPoint, TRect, UnwrapGraphEventsDetail } from "@gravity-ui/graph";

// Type-only consumer checks of core's structural geometry and scheduler contracts.
export const structuralScheduler: Graph["scheduler"] = {
  getSchedulers: () => [[], [], [], [], []],
  addScheduler: (_scheduler) => () => undefined,
  removeScheduler: (_scheduler) => undefined,
  destroy: () => undefined,
  tick: () => undefined,
  performUpdate: () => undefined,
};

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
