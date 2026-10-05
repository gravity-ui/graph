import type { Graph } from "../../graph";

import { CameraService, getInitCameraState } from "./CameraService";

describe("CameraService.createCameraPoint", () => {
  const createCamera = () =>
    new CameraService({} as Graph, { ...getInitCameraState(), x: 37.5, y: -12.25, scale: 0.75 });

  it("converts a fractional world point without rounding", () => {
    const camera = createCamera();

    expect(camera.createCameraPoint({ x: -10.5, y: 20.25 })).toStrictEqual({
      world: { x: -10.5, y: 20.25 },
      canvas: { x: 29.625, y: 2.9375 },
    });
  });

  it("preserves the exact canvas position when converting in both directions", () => {
    const camera = createCamera();
    const point = camera.createCameraPoint({ x: 300, y: 107 }, "canvas");

    expect(point).toStrictEqual({ world: { x: 350, y: 159 }, canvas: { x: 300, y: 107 } });
    expect(camera.createCameraPoint(point.world)).toStrictEqual(point);
  });

  it.each(["world", "canvas"] as const)(
    "copies the %s input so later mutations cannot change the snapshot",
    (space) => {
      const camera = createCamera();
      const input = { x: 10.5, y: -20.25 };
      const point = camera.createCameraPoint(input, space);
      input.x = 999;

      expect(point[space]).toStrictEqual({ x: 10.5, y: -20.25 });
    }
  );
});
