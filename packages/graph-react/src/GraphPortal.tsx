import React, { forwardRef, useImperativeHandle } from "react";

import { Graph, Layer, LayerContext, LayerProps, TComponentState } from "@gravity-ui/graph";
import { createPortal } from "react-dom";

import { useGraphContext } from "./GraphContext";
import { useLayer } from "./hooks/useLayer";

/**
 * Properties for creating internal GraphPortal layer
 */
export interface GraphPortalLayerProps extends LayerProps {
  /**
   * Additional CSS classes for HTML element
   */
  className?: string;
  /**
   * Layer position on Z axis
   */
  zIndex?: number;
  /**
   * Whether HTML element should follow camera position
   */
  transformByCameraPosition?: boolean;
}

/**
 * Internal Layer class for GraphPortal
 * Creates HTML element and provides it through portal
 */
export class GraphPortalLayer extends Layer<GraphPortalLayerProps, LayerContext, TComponentState> {
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
   * Get HTML element for creating portal
   */
  public getPortalTarget(): HTMLElement | null {
    return this.getHTML() ?? null;
  }
}

/**
 * GraphPortal component properties
 */
export interface GraphPortalProps {
  /**
   * Additional CSS classes for layer
   */
  className?: string;
  /**
   * Layer position on Z axis
   */
  zIndex?: number;
  /**
   * Whether HTML element should follow camera position
   * @default false
   */
  transformByCameraPosition?: boolean;
  /**
   * Function for rendering portal content
   */
  children: React.ReactNode | ((layer: GraphPortalLayer, graph: Graph) => React.ReactNode);
}

/**
 * Declarative component for creating HTML layers using render prop pattern.
 *
 * Creates internal Layer with HTML element and renders passed
 * React components through React Portal without need to create
 * separate Layer class.
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
 * // With render prop for accessing layer and graph
 * <GraphPortal>
 *   {(layer, graph) => (
 *     <div onClick={() => layer.hide()}>
 *       Graph blocks count: {graph.api.getBlocks().length}
 *     </div>
 *   )}
 * </GraphPortal>
 * ```
 */
export const GraphPortal = forwardRef<GraphPortalLayer | null, GraphPortalProps>(function GraphPortal(
  { className, zIndex, transformByCameraPosition = false, children }: GraphPortalProps,
  ref
): React.ReactElement | null {
  // Get graph from context
  const { graph } = useGraphContext();

  // Always create internal layer using useLayer (hooks must be called unconditionally)
  const layer = useLayer(graph, GraphPortalLayer, {
    className,
    zIndex,
    transformByCameraPosition,
  });

  // Expose layer through ref
  useImperativeHandle<GraphPortalLayer | null, GraphPortalLayer | null>(ref, () => layer, [layer]);

  // If graph is not ready or layer not yet created, don't render portal
  if (!layer) {
    return null;
  }

  // If no HTML element, don't render portal
  const portalTarget = layer.getPortalTarget();
  if (!portalTarget) {
    return null;
  }

  // Render portal content
  return createPortal(typeof children === "function" ? children(layer, graph) : children, portalTarget, "graph-portal");
});
