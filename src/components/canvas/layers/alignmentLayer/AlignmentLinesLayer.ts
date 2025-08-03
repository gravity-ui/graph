import { TComponentState } from "../../../../lib/Component";
import { DragContext, DragInfo, DragModifier, IDragMiddleware } from "../../../../services/Drag/DragInfo";
import {
  MagneticBorderModifier,
  MagneticBorderModifierConfig,
} from "../../../../services/Drag/modifiers/MagneticBorderModifier";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { GraphComponent } from "../../GraphComponent";
import { Block } from "../../blocks/Block";

/** Border information from magnetic modifier context */
interface BorderInfo {
  element: GraphComponent;
  border: "top" | "right" | "bottom" | "left";
  point: { x: number; y: number };
  distance: number;
}

/** Extended drag context with magnetic border information */
interface MagneticDragContext extends DragContext {
  allBorderLines?: BorderInfo[];
  selectedBorders?: BorderInfo[];
  dragEntity?: GraphComponent;
}

/**
 * Configuration for the alignment lines layer
 */
export interface AlignmentLinesLayerProps extends LayerProps {
  /** Configuration for the magnetic border modifier */
  magneticBorderConfig?: Partial<MagneticBorderModifierConfig>;
  /** Style configuration for alignment lines */
  lineStyle?: {
    /** Color for snap lines (lines that trigger snapping) */
    snapColor?: string;
    /** Color for guide lines (lines that don't trigger snapping) */
    guideColor?: string;
    /** Line width */
    width?: number;
    /** Dash pattern for snap lines */
    snapDashPattern?: number[];
    /** Dash pattern for guide lines */
    guideDashPattern?: number[];
  };
}

/**
 * State for storing alignment line information
 */
interface AlignmentLinesState extends TComponentState {
  /** Array of snap lines (lines that trigger snapping) */
  snapLines: Array<{
    /** Line type - horizontal or vertical */
    type: "horizontal" | "vertical";
    /** Position coordinate (y for horizontal, x for vertical) */
    position: number;
    /** Visual bounds for the line */
    bounds: {
      start: number;
      end: number;
    };
  }>;
  /** Array of guide lines (lines that show potential alignment but don't snap) */
  guideLines: Array<{
    /** Line type - horizontal or vertical */
    type: "horizontal" | "vertical";
    /** Position coordinate (y for horizontal, x for vertical) */
    position: number;
    /** Visual bounds for the line */
    bounds: {
      start: number;
      end: number;
    };
  }>;
  /** Whether alignment lines are currently visible */
  visible: boolean;
}

/**
 * Layer that displays alignment lines when dragging blocks with magnetic border snapping
 */
export class AlignmentLinesLayer
  extends Layer<
    AlignmentLinesLayerProps,
    LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
    AlignmentLinesState
  >
  implements IDragMiddleware
{
  /** Current drag modifier instance */
  private magneticModifier: DragModifier | null = null;

  /** Configuration for magnetic border behavior */
  private readonly magneticConfig: MagneticBorderModifierConfig;

  constructor(props: AlignmentLinesLayerProps) {
    super({
      canvas: {
        zIndex: 15, // Above selection layer but below new block layer
        classNames: ["alignment-lines-layer", "no-pointer-events"],
        transformByCameraPosition: true,
        ...props.canvas,
      },
      ...props,
    });

    // Default magnetic border configuration
    this.magneticConfig = {
      magnetismDistance: 50, // Show guide lines up to 50px
      snapThreshold: 15, // Snap only within 15px
      enabledBorders: ["top", "right", "bottom", "left"],
      allowMultipleSnap: true, // Allow snapping to both horizontal and vertical lines
      targets: [Block],
      resolveBounds: (element: GraphComponent) => {
        if (element instanceof Block) {
          const state = element.state;
          return {
            x: state.x,
            y: state.y,
            width: state.width,
            height: state.height,
          };
        }
        return null;
      },
      filter: (element: GraphComponent, dragInfo: DragInfo, ctx: DragContext) => {
        // Don't snap to self and filter non-block elements
        return element instanceof Block && element !== ctx.dragEntity;
      },
      ...props.magneticBorderConfig,
    };

    // Initialize state
    this.setState({
      snapLines: [],
      guideLines: [],
      visible: false,
    });

    const canvas = this.getCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to get 2D rendering context");
    }

    this.setContext({
      canvas,
      ctx,
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });
  }

  /**
   * Provides drag modifier for magnetic border snapping with line visualization
   * @returns Drag modifier for border snapping with alignment lines
   */
  public dragModifier(): DragModifier {
    if (!this.magneticModifier) {
      // Create the magnetic border modifier
      // eslint-disable-next-line new-cap
      const baseMagneticModifier = MagneticBorderModifier(this.magneticConfig);

      // Extend it with line visualization
      this.magneticModifier = {
        ...baseMagneticModifier,
        name: "alignmentLinesLayer",
        onApply: (dragInfo: DragInfo, ctx: DragContext) => {
          // Update alignment lines based on closest border
          this.updateAlignmentLines(dragInfo, ctx);
        },
      };
    }

    return this.magneticModifier;
  }

  /**
   * Called after layer initialization
   * Sets up event listeners for drag events
   * @returns void
   */
  protected afterInit(): void {
    super.afterInit();

    // Subscribe to drag events to manage modifier and visualization
    this.context.graph.on("drag-start", (event) => {
      const { dragInfo } = event.detail;

      // Add our modifier if we're dragging a Block
      if (this.isDraggingBlock(dragInfo)) {
        dragInfo.addModifier(this.dragModifier());
        this.setState({ visible: true });
      }
    });

    this.context.graph.on("drag-update", (event) => {
      const { dragInfo } = event.detail;

      // Update visualization if our modifier is applied
      if (dragInfo.isApplied(this.dragModifier())) {
        this.updateAlignmentLines(dragInfo, dragInfo.context as DragContext);
        this.performRender();
      }
    });

    this.context.graph.on("drag-end", (event) => {
      const { dragInfo } = event.detail;

      // Clean up: remove modifier and hide lines
      dragInfo.removeModifier(this.dragModifier().name);
      this.setState({
        snapLines: [],
        guideLines: [],
        visible: false,
      });
      this.performRender();
    });
  }

  /**
   * Checks if we're dragging a block
   * @param dragInfo - Current drag information
   * @returns true if dragging a Block component
   */
  private isDraggingBlock(dragInfo: DragInfo): boolean {
    return "dragEntity" in dragInfo.context && dragInfo.context.dragEntity instanceof Block;
  }

  /**
   * Updates alignment lines based on current drag state
   * @param dragInfo - Current drag information
   * @param ctx - Drag context containing border information
   * @returns void
   */
  private updateAlignmentLines(dragInfo: DragInfo, ctx: DragContext): void {
    const snapLines: AlignmentLinesState["snapLines"] = [];
    const guideLines: AlignmentLinesState["guideLines"] = [];

    // Get border information from context
    const magneticCtx = ctx as MagneticDragContext;
    const allBorderLines = magneticCtx.allBorderLines || [];
    const selectedBorders = magneticCtx.selectedBorders || [];

    // Get current dragged block bounds for line extension
    const draggedEntity = magneticCtx.dragEntity;
    let draggedBounds = null;
    if (draggedEntity instanceof Block) {
      const state = draggedEntity.state;
      draggedBounds = {
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
      };
    }

    // Convert selected borders to snap lines
    selectedBorders.forEach((borderInfo) => {
      const { border, point, element } = borderInfo;

      // Get bounds of the target element for line extension
      const targetBounds = this.magneticConfig.resolveBounds?.(element);
      if (!targetBounds) return;

      const line = this.createLineFromBorder(border, point, targetBounds, draggedBounds);
      if (line) {
        snapLines.push(line);
      }
    });

    // Convert all other borders to guide lines (excluding those already used for snapping)
    const selectedBorderIds = new Set(selectedBorders.map((b) => `${this.getElementId(b.element)}-${b.border}`));

    allBorderLines.forEach((borderInfo) => {
      const { border, point, element } = borderInfo;
      const borderId = `${this.getElementId(element)}-${border}`;

      // Skip if this border is already used for snapping
      if (selectedBorderIds.has(borderId)) return;

      // Get bounds of the target element for line extension
      const targetBounds = this.magneticConfig.resolveBounds?.(element);
      if (!targetBounds) return;

      const line = this.createLineFromBorder(border, point, targetBounds, draggedBounds);
      if (line) {
        guideLines.push(line);
      }
    });

    // Update state with new lines
    this.setState({
      snapLines,
      guideLines,
      visible: snapLines.length > 0 || guideLines.length > 0,
    });
  }

  /**
   * Gets a unique identifier for a GraphComponent
   * @param element - The graph component
   * @returns Unique string identifier for the element
   */
  private getElementId(element: GraphComponent): string {
    // Use a combination of constructor name and unique string as identifier
    // Since we don't have a reliable id property, we use the object's string representation
    return `${element.constructor.name}_${Object.prototype.toString.call(element)}`;
  }

  /**
   * Creates a line object from border information
   * @param border - Border type (top, right, bottom, left)
   * @param point - Point on the border line
   * @param targetBounds - Bounds of the target element
   * @param draggedBounds - Bounds of the dragged element (can be null)
   * @returns Line object or null if border type is unsupported
   */
  private createLineFromBorder(
    border: "top" | "right" | "bottom" | "left",
    point: { x: number; y: number },
    targetBounds: { x: number; y: number; width: number; height: number },
    draggedBounds: { x: number; y: number; width: number; height: number } | null
  ) {
    const padding = 20;

    if (border === "top" || border === "bottom") {
      // Horizontal line
      const lineY = point.y;

      // Calculate line bounds - extend beyond both elements
      let startX = Math.min(targetBounds.x, draggedBounds?.x ?? point.x);
      let endX = Math.max(
        targetBounds.x + targetBounds.width,
        (draggedBounds?.x ?? point.x) + (draggedBounds?.width ?? 0)
      );

      // Add padding
      startX -= padding;
      endX += padding;

      return {
        type: "horizontal" as const,
        position: lineY,
        bounds: { start: startX, end: endX },
      };
    } else if (border === "left" || border === "right") {
      // Vertical line
      const lineX = point.x;

      // Calculate line bounds - extend beyond both elements
      let startY = Math.min(targetBounds.y, draggedBounds?.y ?? point.y);
      let endY = Math.max(
        targetBounds.y + targetBounds.height,
        (draggedBounds?.y ?? point.y) + (draggedBounds?.height ?? 0)
      );

      // Add padding
      startY -= padding;
      endY += padding;

      return {
        type: "vertical" as const,
        position: lineX,
        bounds: { start: startY, end: endY },
      };
    }

    return null;
  }

  /**
   * Renders alignment lines on canvas
   * @returns void
   */
  protected render(): void {
    super.render();

    const state = this.state;
    if (!state.visible || (state.snapLines.length === 0 && state.guideLines.length === 0)) {
      return;
    }

    const ctx = this.context.ctx;
    const lineStyle = this.props.lineStyle || {};

    // Configure common line properties
    ctx.lineWidth = lineStyle.width || 1;

    // Draw guide lines first (less prominent)
    if (state.guideLines.length > 0) {
      ctx.strokeStyle = lineStyle.guideColor || "#E0E0E0"; // Light gray
      ctx.setLineDash(lineStyle.guideDashPattern || [3, 3]); // Subtle dashes

      state.guideLines.forEach((line) => {
        ctx.beginPath();

        if (line.type === "horizontal") {
          ctx.moveTo(line.bounds.start, line.position);
          ctx.lineTo(line.bounds.end, line.position);
        } else {
          ctx.moveTo(line.position, line.bounds.start);
          ctx.lineTo(line.position, line.bounds.end);
        }

        ctx.stroke();
      });
    }

    // Draw snap lines (more prominent)
    if (state.snapLines.length > 0) {
      ctx.strokeStyle = lineStyle.snapColor || "#007AFF"; // Bright blue
      ctx.setLineDash(lineStyle.snapDashPattern || [5, 5]); // More prominent dashes

      state.snapLines.forEach((line) => {
        ctx.beginPath();

        if (line.type === "horizontal") {
          ctx.moveTo(line.bounds.start, line.position);
          ctx.lineTo(line.bounds.end, line.position);
        } else {
          ctx.moveTo(line.position, line.bounds.start);
          ctx.lineTo(line.position, line.bounds.end);
        }

        ctx.stroke();
      });
    }

    // Reset line dash
    ctx.setLineDash([]);
  }
}
