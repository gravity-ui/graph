import React, { forwardRef, useImperativeHandle, useState } from "react";

import { createPortal } from "react-dom";

import { Graph, GraphState } from "../graph";
import { TComponentState } from "../lib/Component";
import { Layer, LayerContext, LayerProps } from "../services/Layer";

import { useGraphContext } from "./GraphContext";
import { useGraphEvent } from "./hooks/useGraphEvents";
import { useLayer } from "./hooks/useLayer";

/**
 * Свойства для создания внутреннего слоя GraphPortal
 */
export interface GraphPortalLayerProps extends LayerProps {
  /**
   * Дополнительные CSS классы для HTML элемента
   */
  className?: string;
  /**
   * Позиция слоя по оси Z
   */
  zIndex?: number;
  /**
   * Следует ли HTML элементу за позицией камеры
   */
  transformByCameraPosition?: boolean;
}

/**
 * Внутренний Layer класс для GraphPortal
 * Создает HTML элемент и предоставляет его через portal
 */
class GraphPortalLayer extends Layer<GraphPortalLayerProps, LayerContext, TComponentState> {
  constructor(props: GraphPortalLayerProps) {
    super({
      html: {
        zIndex: props.zIndex ?? 100,
        classNames: ["graph-portal-layer", "no-pointer-events", "no-user-select"].concat(
          props.className ? [props.className] : []
        ),
        transformByCameraPosition: props.transformByCameraPosition ?? false,
      },
      ...props,
    });
  }

  /**
   * Получить HTML элемент для создания портала
   */
  public getPortalTarget(): HTMLElement | null {
    return this.getHTML();
  }
}

/**
 * Свойства компонента GraphPortal
 */
export interface GraphPortalProps {
  /**
   * Дополнительные CSS классы для слоя
   */
  className?: string;
  /**
   * Позиция слоя по оси Z
   */
  zIndex?: number;
  /**
   * Следует ли HTML элементу за позицией камеры
   * @default false
   */
  transformByCameraPosition?: boolean;
  /**
   * Функция рендеринга содержимого портала
   */
  children: React.ReactNode | ((layer: GraphPortalLayer, graph: Graph) => React.ReactNode);
}

/**
 * Декларативный компонент для создания HTML слоев с render prop паттерном.
 *
 * Создает внутренний Layer с HTML элементом и рендерит переданные
 * React компоненты через React Portal без необходимости создавать
 * отдельный Layer класс.
 *
 * @example
 * ```tsx
 * function MyGraph() {
 *   const { graph } = useGraph();
 *   const portalRef = useRef<GraphPortalLayer>(null);
 *
 *   return (
 *     <GraphCanvas graph={graph} renderBlock={renderBlock}>
 *       <GraphPortal
 *         ref={portalRef}
 *         className="my-custom-layer"
 *         zIndex={200}
 *         transformByCameraPosition={true}
 *       >
 *         <div style={{ position: 'absolute', top: 10, left: 10 }}>
 *           <h3>Custom UI Layer</h3>
 *           <button onClick={() => portalRef.current?.hide()}>
 *             Hide layer
 *           </button>
 *         </div>
 *       </GraphPortal>
 *     </GraphCanvas>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // С render prop для доступа к слою и графу
 * <GraphPortal>
 *   {(layer, graph) => (
 *     <div onClick={() => layer.hide()}>
 *       Graph blocks count: {graph.api.getBlocks().length}
 *     </div>
 *   )}
 * </GraphPortal>
 * ```
 */
export const GraphPortal = forwardRef<GraphPortalLayer, GraphPortalProps>(function GraphPortal(
  { className, zIndex, transformByCameraPosition = false, children }: GraphPortalProps,
  ref
): React.ReactElement | null {
  // Получаем graph из контекста
  const { graph } = useGraphContext();

  // Отслеживаем состояние графа для определения готовности к созданию порталов
  const [graphState, setGraphState] = useState<GraphState>(graph?.state ?? GraphState.INIT);

  // Подписываемся на изменения состояния графа
  useGraphEvent(graph, "state-change", ({ state }) => {
    setGraphState(state);
  });

  // Создаем внутренний слой с помощью useLayer
  const layer = useLayer(graph, GraphPortalLayer, {
    className,
    zIndex,
    transformByCameraPosition,
  });

  // Предоставляем доступ к слою через ref
  useImperativeHandle(ref, () => layer, [layer]);

  // Если граф не готов или слой еще не создан, не рендерим портал
  if (!graph || graphState < GraphState.ATTACHED || !layer) {
    return null;
  }

  // Если нет HTML элемента, не рендерим портал
  const portalTarget = layer.getPortalTarget();
  if (!portalTarget) {
    return null;
  }

  // Определяем содержимое для рендеринга
  const content = typeof children === "function" ? children(layer, graph) : children;

  // Создаем React Portal для рендеринга содержимого в HTML элементе слоя
  return createPortal(content, portalTarget);
});
