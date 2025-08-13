import { Layer } from "../services/Layer";
import { Graph } from "../graph";
import { Block } from "../components/canvas/blocks/Block";
import { IDragMiddleware, DragModifier, DragInfo, DragContext } from "../services/Drag/DragInfo";
import { Point } from "../utils/types/shapes";

/**
 * Example implementation of a layer that provides drag middleware
 * similar to the user's request
 */
export class ExampleLayer extends Layer implements IDragMiddleware {
  private lines: Array<{ x: number; y: number; width: number; height: number }> = [];

  public dragModifier(): DragModifier {
    return {
      name: "exampleLayer",
      priority: 8,
      applicable: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => {
        // Check if we're dragging a Block and if there are nearby borders
        return ctx.stage === "dragging" && "dragEntity" in ctx && ctx.dragEntity instanceof Block;
      },
      suggest: (pos: Point, dragInfo: DragInfo, ctx: DragContext) => {
        // Example: snap to grid or borders
        const snappedX = Math.round(pos.x / 20) * 20;
        const snappedY = Math.round(pos.y / 20) * 20;
        return new Point(snappedX, snappedY);
      },
      onApply: (dragInfo: DragInfo, ctx: DragContext) => {
        // Update visual indicators when this modifier is applied
        console.log("Example modifier applied during drag");
        
        // In real implementation, you might update visual state here
        if ("closestBorder" in ctx && Array.isArray(ctx.closestBorder)) {
          this.lines = ctx.closestBorder.map((border: any) => ({
            x: border.point.x,
            y: border.point.y,
            width: 10,
            height: 10,
          }));
        }
      },
    };
  }

  public afterInit(): void {
    // Subscribe to drag events to manage modifiers dynamically
    this.context.graph.on("drag-start", (event) => {
      const { dragInfo } = event.detail;
      
      // Add our modifier if we're dragging a Block
      if (dragInfo.context.dragEntity instanceof Block) {
        dragInfo.addModifier(this.dragModifier());
      }
    });

    this.context.graph.on("drag-update", (event) => {
      const { dragInfo } = event.detail;
      
      // Check if our modifier is applied and update visual state
      if (dragInfo.isApplied(this.dragModifier())) {
        // Update visual indicators based on current drag state
        console.log("Our modifier is currently applied");
        
        // In real implementation, you might call setState or similar
        // this.setState({ lines: this.lines });
      }
    });

    this.context.graph.on("drag-end", (event) => {
      const { dragInfo } = event.detail;
      
      // Clean up: remove our modifier after drag ends
      dragInfo.removeModifier(this.dragModifier().name);
      
      // Clear visual indicators
      this.lines = [];
      // this.setState({ lines: [] });
    });
  }

  // Example of how to access the current lines state
  public getLines(): Array<{ x: number; y: number; width: number; height: number }> {
    return this.lines;
  }
}