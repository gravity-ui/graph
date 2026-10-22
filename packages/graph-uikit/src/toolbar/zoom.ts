import type { Graph, GraphComponent } from "@gravity-ui/graph";
import { MagnifierMinus, MagnifierPlus, SquareDashed, SquareDashedCircle } from "@gravity-ui/icons";

import type { TGraphToolbarAction } from "./types";

type TZoomTitles = {
  zoomIn: string;
  zoomOut: string;
  reset: string;
  viewport: string;
  selection: string;
};

export type TZoomGroupOptions = {
  /** 1:1 button. Default: false. */
  reset?: boolean;
  /** Fit to viewport button. Default: false. */
  viewport?: boolean;
  /** Fit selection button. Default: false. */
  selection?: boolean;
  /** Overrides of the English titles. */
  titles?: Partial<TZoomTitles>;
};

const DEFAULT_TITLES: TZoomTitles = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Actual size (1:1)",
  viewport: "Fit to viewport",
  selection: "Fit selection",
};

/** Multiplicative, reciprocal zoom step clamped to the camera bounds. */
export function getNextZoomScale(
  scale: number,
  step: number,
  direction: 1 | -1,
  bounds: { scaleMin: number; scaleMax: number }
): number {
  const factor = 1 + step;
  const next = direction > 0 ? scale * factor : scale / factor;
  return Math.min(bounds.scaleMax, Math.max(bounds.scaleMin, next));
}

function clampScale(graph: Graph, scale: number): number {
  const { scaleMin, scaleMax } = graph.cameraService.getCameraState();
  return Math.min(scaleMax, Math.max(scaleMin, scale));
}

function zoomBy(graph: Graph, step: number, direction: 1 | -1): void {
  const state = graph.cameraService.getCameraState();
  graph.zoom({ scale: getNextZoomScale(graph.cameraService.getCameraScale(), step, direction, state) });
}

function getSelectedComponents(graph: Graph): GraphComponent[] {
  return [
    ...graph.blocks.blockSelectionBucket.$selectedComponents.value,
    ...graph.connections.connectionSelectionBucket.$selectedComponents.value,
  ];
}

const SCALE_EPSILON = 1e-6;

/** Built-in zoom actions in the order: in, 1:1, fit viewport, fit selection, out, then `extra`. */
export function zoomGroup(options: TZoomGroupOptions = {}, ...extra: TGraphToolbarAction[]): TGraphToolbarAction[] {
  const titles = { ...DEFAULT_TITLES, ...options.titles };
  const actions: TGraphToolbarAction[] = [
    {
      id: "zoom-in",
      icon: MagnifierPlus,
      title: titles.zoomIn,
      action: (graph, { zoomStep }) => zoomBy(graph, zoomStep, 1),
      disabled: (graph) =>
        graph.cameraService.getCameraScale() >= graph.cameraService.getCameraState().scaleMax - SCALE_EPSILON,
    },
  ];
  if (options.reset) {
    actions.push({
      id: "zoom-reset",
      label: "1:1",
      title: titles.reset,
      action: (graph) => graph.zoom({ scale: clampScale(graph, 1) }),
      disabled: (graph) => Math.abs(graph.cameraService.getCameraScale() - clampScale(graph, 1)) < SCALE_EPSILON,
    });
  }
  if (options.viewport) {
    actions.push({
      id: "zoom-viewport",
      icon: SquareDashed,
      title: titles.viewport,
      action: (graph) => {
        graph.zoomTo("center");
      },
    });
  }
  if (options.selection) {
    actions.push({
      id: "zoom-selection",
      icon: SquareDashedCircle,
      title: titles.selection,
      action: (graph) => {
        const components = getSelectedComponents(graph);
        if (components.length > 0) {
          graph.zoomTo(components);
        }
      },
      disabled: (graph) => getSelectedComponents(graph).length === 0,
    });
  }
  actions.push(
    {
      id: "zoom-out",
      icon: MagnifierMinus,
      title: titles.zoomOut,
      action: (graph, { zoomStep }) => zoomBy(graph, zoomStep, -1),
      disabled: (graph) =>
        graph.cameraService.getCameraScale() <= graph.cameraService.getCameraState().scaleMin + SCALE_EPSILON,
    },
    ...extra
  );
  return actions;
}
