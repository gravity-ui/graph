# SelectionService Documentation

## 1. Description and Behavior

### Overview

`SelectionService` is a centralized manager for selection state in a graph application. It coordinates selection for different entity types (blocks, connections, groups, custom entities) using a system of "selection buckets". Each bucket manages selection for a single entity type, while the service itself provides a unified API and ensures consistent selection logic across the entire graph.

### Key Concepts

- **Selection Buckets:** Each bucket implements the `ISelectionBucket` interface and is responsible for managing selection state for a specific entity type.
- **Registration:** Buckets are registered in the service using `registerBucket(bucket)`.
- **Selection Strategies:**  
  - `REPLACE`: Select only the specified entities, clearing selection from all others (and from all other buckets).
  - `ADD`: Add specified entities to the current selection.
  - `SUBTRACT`: Remove specified entities from the current selection.
- **Coordination:** When a selection is made with `REPLACE`, the service resets selection in all other buckets, ensuring only one entity type is selected at a time (unless using additive selection).
- **Extensibility:** New entity types can be supported by implementing a custom bucket and registering it with the service.

---

## 2. Usage in @gravity-ui/graph (with Layers and Context)

### Initialization and Storage

- In @gravity-ui/graph, `SelectionService` is created and stored as `rootStore.selectionService`.
- The root store is available via the graph context and is accessible from any layer or component.

---

### Example: Using SelectionService in a Custom Layer

#### 1. Creating a Custom Layer That Uses SelectionService

```typescript
// CustomSelectionHighlightLayer.ts
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import type { RootStore } from "src/store";
import { ESelectionStrategy } from "src/services/selection/types";

interface CustomSelectionHighlightLayerProps extends LayerProps {
  rootStore: RootStore;
}

export class CustomSelectionHighlightLayer extends Layer<CustomSelectionHighlightLayerProps, LayerContext, {}> {
  constructor(props: CustomSelectionHighlightLayerProps) {
    super(props);
  }

  render() {
    const { selectionService } = this.props.rootStore;
    const selectedBlocks = selectionService
      .getBucket("block")
      ?.getSelectedIds() ?? [];

    // Use context to get canvas and camera
    const ctx = this.context.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = this.context.colors.selection;
    ctx.lineWidth = 2;

    // Highlight all selected blocks
    for (const blockId of selectedBlocks) {
      const block = this.context.graph.getBlockById(blockId);
      if (block && block.isVisible()) {
        const { x, y, width, height } = block.getBounds();
        ctx.strokeRect(x, y, width, height);
      }
    }
    ctx.restore();
  }
}
```

#### 2. Adding the Layer to the Graph (React Example)

```typescript
import { useGraph, useLayer, GraphCanvas } from "@gravity-ui/graph";
import { CustomSelectionHighlightLayer } from "./CustomSelectionHighlightLayer";
import { useContext } from "react";
import { GraphContext } from "src/your/GraphContextProvider";

function MyGraphComponent() {
  const { graph } = useGraph(/* config */);
  const rootStore = useContext(GraphContext);

  useLayer(graph, CustomSelectionHighlightLayer, { rootStore });

  return <GraphCanvas graph={graph} />;
}
```

---

### Example: Handling Selection in a Layer (Behavior Layer)

```typescript
// SelectionInteractionLayer.ts
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import type { RootStore } from "src/store";
import { ESelectionStrategy } from "src/services/selection/types";

interface SelectionInteractionLayerProps extends LayerProps {
  rootStore: RootStore;
}

export class SelectionInteractionLayer extends Layer<SelectionInteractionLayerProps, LayerContext, {}> {
  afterInit() {
    // Listen for click events on the canvas
    this.getCanvas()?.addEventListener("click", this.handleClick);
  }

  unmount() {
    this.getCanvas()?.removeEventListener("click", this.handleClick);
  }

  handleClick = (event: MouseEvent) => {
    const { selectionService } = this.props.rootStore;
    const worldPos = this.context.camera.applyToPoint(event.offsetX, event.offsetY);

    // Example: select block by click
    const block = this.context.graph.getBlockAt(worldPos.x, worldPos.y);
    if (block) {
      selectionService.select("block", [block.id], ESelectionStrategy.REPLACE);
    } else {
      selectionService.resetSelection("block");
    }
  };
}
```

---

### Example: Querying Selection State in a Layer

```typescript
// Inside any Layer's render method
const { selectionService } = this.props.rootStore;
const isSelected = selectionService.isSelected("block", blockId);
if (isSelected) {
  // Render with selection highlight
}
```

---

### Summary

- **SelectionService** is always accessed via `rootStore.selectionService`, which is available in context or passed as a prop to layers.
- **Layers** are the preferred place for both rendering selection highlights and handling selection logic (interactions).
- **React Integration:** Use the `useLayer` hook to add custom layers to the graph in React, passing the root store or context as needed.
- **Best Practice:** Always use the context and layer system for selection logic and rendering, never manipulate selection state directly in UI components.


### Custom cases

- Выделение связанных блоков при клике на блок
- Выделение блока при