import React, { forwardRef, useImperativeHandle } from "react";

import type { Layer } from "../services/Layer";

import { useGraphContext } from "./GraphContext";
import { useLayer } from "./hooks/useLayer";

/**
 * Тип конструктора Layer класса
 */
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Извлекает типы свойств из конструктора Layer
 */
type LayerPropsForConstructor<TLayer extends Constructor<Layer>> =
  TLayer extends Constructor<Layer<infer LayerProps>>
    ? Omit<LayerProps, "root" | "camera" | "graph" | "emitter"> & { root?: LayerProps["root"] }
    : never;

/**
 * Извлекает тип экземпляра слоя из конструктора
 */
type LayerInstanceForConstructor<TLayer extends Constructor<Layer>> =
  TLayer extends Constructor<infer LayerInstance> ? LayerInstance : never;

/**
 * Свойства компонента GraphLayer
 */
export type GraphLayerProps<TLayer extends Constructor<Layer>> = {
  /**
   * Конструктор Layer класса
   */
  layer: TLayer;
} & LayerPropsForConstructor<TLayer>;

/**
 * Декларативный компонент для добавления существующих Layer классов в граф.
 *
 * Упрощает использование слоев за счет декларативного подхода вместо
 * императивных вызовов useLayer или graph.addLayer.
 *
 * **Важно:** Должен использоваться как дочерний компонент GraphCanvas.
 *
 * @example
 * ```tsx
 * import { DevToolsLayer } from "@gravity-ui/graph";
 * import { GraphLayer, GraphCanvas } from "@gravity-ui/graph/react";
 *
 * function MyGraph() {
 *   const { graph } = useGraph();
 *   const layerRef = useRef<DevToolsLayer>(null);
 *
 *   return (
 *     <GraphCanvas graph={graph} renderBlock={renderBlock}>
 *       <GraphLayer
 *         ref={layerRef}
 *         layer={DevToolsLayer}
 *         showRuler={true}
 *         rulerSize={20}
 *       />
 *       <button onClick={() => layerRef.current?.setVisible(false)}>
 *         Hide DevTools
 *       </button>
 *     </GraphCanvas>
 *   );
 * }
 * ```
 *
 * @template TLayer - Тип конструктора слоя, расширяющего Layer
 * @param layer - Класс-конструктор слоя
 * @param ...props - Свойства слоя (исключая внутренние props как root, camera, graph, emitter)
 * @returns null - компонент ничего не рендерит, только управляет слоем
 */
export const GraphLayer = forwardRef(function GraphLayer<TLayer extends Constructor<Layer>>(
  { layer, ...layerProps }: GraphLayerProps<TLayer>,
  ref: React.Ref<LayerInstanceForConstructor<TLayer>>
): null {
  // Получаем graph из контекста
  const { graph } = useGraphContext();

  // Используем useLayer для создания и управления слоем
  const layerInstance = useLayer(graph, layer, layerProps as any);

  // Предоставляем доступ к слою через ref
  useImperativeHandle(ref, () => layerInstance as LayerInstanceForConstructor<TLayer>, [layerInstance]);

  // Компонент не рендерит ничего визуального
  return null;
}) as <TLayer extends Constructor<Layer>>(
  props: GraphLayerProps<TLayer> & { ref?: React.Ref<LayerInstanceForConstructor<TLayer>> }
) => null;
