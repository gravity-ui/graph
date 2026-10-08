import { ESchedulerPriority, Graph, Layer, LayerProps, debounce, schedule, throttle } from "@gravity-ui/graph";
import {
  GraphCanvas,
  useElk,
  useLayeredLayout,
  GraphLayer,
  GraphLayerProps,
  GraphPortal,
  useLayer,
} from "@gravity-ui/graph-react";

const removeScheduledTask = schedule(() => undefined, {
  priority: ESchedulerPriority.LOWEST,
  frameInterval: 1,
  once: true,
});
const debounced = debounce((value: string) => void value, { priority: ESchedulerPriority.LOW });
const throttled = throttle((value: string) => void value, { priority: ESchedulerPriority.HIGH });

debounced("debounced");
debounced.isScheduled();
throttled("throttled");

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

void structuralScheduler;
void Graph;
void GraphCanvas;
void useElk;
void removeScheduledTask;

// Declarative construction and updates must agree on input types.
class ConvertedLayer extends Layer<LayerProps & { size: number }> {
  constructor(input: LayerProps & { size: string }) {
    super({ ...input, size: Number(input.size) });
  }
}

class ReactiveConvertedLayer extends ConvertedLayer {
  public setProps(input?: Partial<LayerProps> & { size?: number | string }) {
    if (input === undefined) return;
    if (input.size !== undefined) super.setProps({ size: Number(input.size) });
  }
}

function useConvertedLayers(graph: Graph) {
  // @ts-expect-error Constructor-only conversion does not make inherited updates accept strings.
  useLayer(graph, ConvertedLayer, { size: "10" });
  useLayer(graph, ReactiveConvertedLayer, { size: "10" });
}

// @ts-expect-error GraphLayer uses the same construction/update input contract as useLayer.
const invalidReactiveProps: GraphLayerProps<typeof ConvertedLayer> = { layer: ConvertedLayer, props: { size: "10" } };
const reactiveProps: GraphLayerProps<typeof ReactiveConvertedLayer> = {
  layer: ReactiveConvertedLayer,
  props: { size: "10" },
};
void useConvertedLayers;
void invalidReactiveProps;
void reactiveProps;
