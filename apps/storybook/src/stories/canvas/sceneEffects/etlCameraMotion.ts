import type { Graph, TPoint } from "@gravity-ui/graph";

import { pipelineRect } from "./etlAtScale";
import type { TEtlAtScale } from "./etlAtScale";

export type TEtlCameraMotion = "zoom" | "pan";

const ZOOM_PERIOD_MS = 20_000;
const PAN_PERIOD_MS = 16_000;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 0.9;

function middlePipelineCenter(data: TEtlAtScale): TPoint {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of data.blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + block.width);
    maxY = Math.max(maxY, block.y + block.height);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let nearest = data.pipelines[0];
  let distance = Infinity;
  for (const block of data.blocks) {
    const squaredDistance = (block.x + block.width / 2 - centerX) ** 2 + (block.y + block.height / 2 - centerY) ** 2;
    if (squaredDistance < distance) {
      distance = squaredDistance;
      nearest = block.pipeline;
    }
  }
  const rect = pipelineRect(data, nearest);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function startEtlCameraMotion(
  camera: Graph["cameraService"],
  data: TEtlAtScale,
  motion: TEtlCameraMotion
): () => void {
  const focus = motion === "zoom" ? middlePipelineCenter(data) : undefined;
  const period = focus ? ZOOM_PERIOD_MS : PAN_PERIOD_MS;
  let origin: { time: number; x: number; y: number; radius: number } | undefined;
  let request: number;

  const animate = (time: number): void => {
    request = window.requestAnimationFrame(animate);
    const { x, y, width, height } = camera.getCameraState();
    if (width <= 0 || height <= 0) return;
    origin ??= { time, x, y, radius: Math.min(width, height) * 0.3 };
    const phase = ((time - origin.time) / period) * 2 * Math.PI;
    if (focus) {
      const progress = (1 - Math.cos(phase)) / 2;
      const scale = MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** progress;
      camera.set({ x: width / 2 - focus.x * scale, y: height / 2 - focus.y * scale, scale });
    } else {
      camera.set({
        x: origin.x + origin.radius * Math.sin(phase),
        y: origin.y + origin.radius * (Math.cos(phase) - 1),
      });
    }
  };

  request = window.requestAnimationFrame(animate);
  return () => window.cancelAnimationFrame(request);
}
