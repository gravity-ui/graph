# Selection Management System

## 1. Overview

The Selection Management System provides a centralized way to handle entity selection in graph applications. It uses a bucket-based architecture where each entity type (blocks, connections, anchors, etc.) has its own selection bucket managed by a central `SelectionService`.

### Key Benefits

- **Consistent Behavior**: When selecting new items, previous selections are automatically cleared
- **Easy Integration**: Add selection support for custom entities with minimal code
- **Performance**: Single consolidated events instead of multiple individual events
- **Type Safety**: Built-in validation for different selection rules (single vs multiple)

### Core Concepts

- **SelectionService**: Central coordinator that manages all selection buckets
- **Selection Buckets**: Individual containers that handle selection for specific entity types
- **Selection Strategies**: How selection operations behave (`REPLACE`, `APPEND`, `SUBTRACT`, `TOGGLE`)

## 2. Buckets and SelectionService Behavior

### Selection Buckets

Selection buckets are containers that manage selection state for a specific entity type:

```typescript
// Multiple selection bucket (blocks, connections, groups)
const blockBucket = new MultipleSelectionBucket<string>("block");

// Single selection bucket (anchors, active tools)
const anchorBucket = new SingleSelectionBucket<string>("anchor");
```

**Key Features:**
- Reactive state via Preact signals (`bucket.$selected`)
- Event handling through `onSelectionChange` callbacks
- Built-in validation for selection rules

### SelectionService Coordination

The `SelectionService` coordinates between buckets to ensure consistent behavior:

```typescript
const selectionService = new SelectionService();

// Register buckets
selectionService.registerBucket(blockBucket);
selectionService.registerBucket(anchorBucket);

// Centralized selection with coordination
selectionService.select("block", ["b1", "b2"], ESelectionStrategy.REPLACE);
// This automatically deselects any selected anchors
```

**Coordination Features:**
- Cross-bucket coordination (REPLACE strategy resets other buckets)
- Unified API for single-type and multi-type selection
- Aggregated selection state via `selectionService.$selection`

### Connected vs Standalone Buckets

**Connected Buckets** (attached to SelectionService):
```typescript
bucket.attachToManager(selectionService);
bucket.select(["item1"]); // → delegated to SelectionService
```

**Standalone Buckets** (independent operation):
```typescript
bucket.select(["item1"]); // → only affects this bucket
```

## 3. Custom Layer Integration

### Creating Selection-Enabled Layers

Custom layers can integrate with the selection system by accessing buckets or the SelectionService:

```typescript
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import { MultipleSelectionBucket } from "src/services/selection";

export class CustomEntityLayer extends Layer<LayerProps, LayerContext, {}> {
  private entityBucket: MultipleSelectionBucket<string>;

  constructor(props: LayerProps, context: LayerContext) {
    super(props, context);
    
    // Create and register custom entity bucket
    this.entityBucket = new MultipleSelectionBucket<string>(
      "customEntity",
          (payload, defaultAction) => {
        return this.context.graph.executеDefaultEventAction(
          "custom-entity-selection-change",
              payload,
              defaultAction
            );
          }
        );

    this.entityBucket.attachToManager(this.context.graph.selectionService);
  }

  handleEntityClick = (entityId: string, event: MouseEvent) => {
    const strategy = event.ctrlKey ? ESelectionStrategy.APPEND : ESelectionStrategy.REPLACE;
    this.entityBucket.select([entityId], strategy);
  };

  render() {
    const selectedIds = this.entityBucket.$selected.value;
    // Render entities with selection highlighting
  }
}
```

### Interaction Patterns

**Click Selection:**
```typescript
handleClick = (event: MouseEvent) => {
  const entityId = this.getEntityAtPosition(event.offsetX, event.offsetY);
  if (entityId) {
    const strategy = event.ctrlKey ? ESelectionStrategy.APPEND : ESelectionStrategy.REPLACE;
    this.entityBucket.select([entityId], strategy);
  }
};
```

**Area Selection:**
```typescript
handleAreaSelection = (rect: TRect) => {
  const entitiesInArea = this.getEntitiesInRect(rect);
  this.entityBucket.select(entitiesInArea, ESelectionStrategy.REPLACE);
};
```

## 4. Component Layer Usage

### Reading Selection State

Components can reactively read selection state from buckets or the centralized service:

```typescript
export class EntityHighlightLayer extends Layer<LayerProps, LayerContext, {}> {
  afterInit() {
    // Subscribe to selection changes
    this.addSubscription(
      this.context.graph.selectionService.$selection.subscribe(() => {
        this.requestRender();
      })
    );
  }

  render() {
    const ctx = this.context.ctx;
    if (!ctx) return;

    // Get selection for specific entity type
    const selectedBlocks = this.context.graph.selectionService.$selection.value.get("block") ?? new Set();
    
    // Highlight selected entities
    ctx.save();
    ctx.strokeStyle = "#007AFF";
    ctx.lineWidth = 2;

    for (const blockId of selectedBlocks) {
      const block = this.context.graph.getBlock(blockId);
      if (block) {
        ctx.strokeRect(block.x, block.y, block.width, block.height);
      }
    }
    
    ctx.restore();
  }
}
```

### Multi-Entity Selection Handling

```typescript
export class SelectionOutlineLayer extends Layer<LayerProps, LayerContext, {}> {
  render() {
    const allSelections = this.context.graph.selectionService.$selection.value;
    
    // Handle different entity types
    const selectedBlocks = allSelections.get("block") ?? new Set();
    const selectedConnections = allSelections.get("connection") ?? new Set();
    
    this.renderBlockOutlines(selectedBlocks);
    this.renderConnectionOutlines(selectedConnections);
  }
  
  private renderBlockOutlines(blockIds: Set<string>) {
    // Render block selection outlines
  }
  
  private renderConnectionOutlines(connectionIds: Set<string>) {
    // Render connection selection outlines
  }
}
```

## 5. SelectionService API Reference

### Registration Methods

```typescript
// Register a bucket
selectionService.registerBucket(bucket: ISelectionBucket): void

// Unregister a bucket  
selectionService.unregisterBucket(bucket: ISelectionBucket): void

// Get registered bucket
selectionService.getBucket(entityType: string): ISelectionBucket | undefined
```

### Single Entity Type Selection

```typescript
// Select entities
selectionService.select(
  entityType: string, 
  ids: TEntityId[], 
  strategy: ESelectionStrategy
): void

// Deselect entities
selectionService.deselect(entityType: string, ids: TEntityId[]): void

// Check if entity is selected
selectionService.isSelected(entityType: string, id: TEntityId): boolean

// Reset selection for entity type
selectionService.resetSelection(entityType: string): void
```

### Multi Entity Type Selection

```typescript
// Multi-entity selection
selectionService.select(
  selection: TMultiEntitySelection, 
  strategy: ESelectionStrategy
): void

// Multi-entity deselection
selectionService.deselect(selection: TMultiEntitySelection): void

// Multi-entity selection check
selectionService.isSelected(queries: TMultiEntitySelection): Record<string, boolean>

// Reset multiple entity types
selectionService.resetSelection(entityTypes: string[]): void

// Reset all selections
selectionService.resetAllSelections(): void
```

### Reactive State

```typescript
// Aggregated selection state from all buckets
selectionService.$selection: ReadonlySignal<Map<string, Set<TEntityId>>>
```

### Selection Strategies

```typescript
enum ESelectionStrategy {
  REPLACE = "replace",  // Replace current selection
  APPEND = "add",       // Add to current selection  
  SUBTRACT = "subtract", // Remove from current selection
  TOGGLE = "toggle"     // Toggle selection state
}
```

### Multi-Entity Selection Type

```typescript
type TMultiEntitySelection = Record<string, TEntityId[]>;

// Example usage:
const selection: TMultiEntitySelection = {
  block: ["b1", "b2"],
  connection: ["c1", "c2"],
  customEntity: ["e1"]
};
```

## 6. Examples

### Basic Custom Entity Integration

```typescript
// 1. Create custom store with selection bucket
export class CustomEntityStore {
  public readonly customBucket = new MultipleSelectionBucket<string>(
    "customEntity",
    (payload, defaultAction) => {
      return this.graph.executеDefaultEventAction(
        "custom-entity-selection-change",
        payload,
        defaultAction
      );
    }
  );

  constructor(private graph: Graph) {
    // Register with selection service
    this.customBucket.attachToManager(graph.selectionService);
  }
}

// 2. Use in interaction layer
export class CustomEntityInteractionLayer extends Layer {
  handleClick = (event: MouseEvent) => {
    const entityId = this.findEntityAt(event.offsetX, event.offsetY);
    if (entityId) {
      this.context.graph.customEntityStore.customBucket.select(
        [entityId],
        event.ctrlKey ? ESelectionStrategy.APPEND : ESelectionStrategy.REPLACE
      );
    }
  };
}

// 3. Use in rendering layer
export class CustomEntityRenderLayer extends Layer {
  render() {
    const selectedIds = this.context.graph.customEntityStore.customBucket.$selected.value;
    this.renderEntities(selectedIds);
  }
}
```

### Public API Integration

```typescript
// Extend public API for custom entities
export class ExtendedPublicApi extends PublicGraphApi {
  selectCustomEntities(
    entityIds: string[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    this.graph.selectionService.select("customEntity", entityIds, strategy);
  }

  getSelectedCustomEntities(): string[] {
    const selected = this.graph.selectionService.$selection.value.get("customEntity");
    return Array.from(selected ?? []);
  }
}
```

### Advanced Multi-Entity Operations

```typescript
// Select blocks and their connected connections
export function selectBlocksWithConnections(
  graph: Graph,
  blockIds: string[]
) {
  // Find connected connections
  const connectionIds = graph.rootStore.connectionsList.$connections.value
    .filter(conn => 
      blockIds.includes(conn.sourceBlockId) || 
      blockIds.includes(conn.targetBlockId)
    )
    .map(conn => conn.id);

  // Select both entity types
  graph.selectionService.select({
    block: blockIds,
    connection: connectionIds
  }, ESelectionStrategy.REPLACE);
}
```

## 7. Component Resolution

### Overview

Selection buckets support automatic resolution of selected IDs to their corresponding GraphComponent instances. This provides three levels of selection data:

1. **IDs** (`$selected`) - Set of selected entity IDs
2. **Entities** (`$selectedEntities`) - Resolved entity objects (e.g., `BlockState`, `ConnectionState`)  
3. **Components** (`$selectedComponents`) - Resolved `GraphComponent` instances (e.g., `Block`, `BaseConnection`)

### Resolution Flow

```
ID → Entity (via resolver) → Component (via getViewComponent())
```

### Creating Buckets with Resolvers

```typescript
// In BlockListStore
this.blockSelectionBucket = new MultipleSelectionBucket<TBlockId, BlockState>(
  "block",
  (payload, defaultAction) => {
    return this.graph.executеDefaultEventAction("blocks-selection-change", payload, defaultAction);
  },
  (element) => element instanceof Block,
  // Resolver function: converts IDs to BlockState instances
  (ids) => ids.map((id) => this.getBlockState(id)).filter((block) => block !== undefined)
);
```

### Using Component Resolution

```typescript
// Get selected block IDs
const selectedIds = blockBucket.$selected.value;
// Type: Set<string | number>

// Get selected BlockState instances
const selectedStates = blockBucket.$selectedEntities.value;
// Type: BlockState[]

// Get selected Block components (GraphComponent)
const selectedComponents = blockBucket.$selectedComponents.value;
// Type: GraphComponent[] (actually Block[])
```

### Collecting All Selected Components

```typescript
// Collect selected components from all buckets
const allSelectedComponents: GraphComponent[] = [];
const selection = graph.selectionService.$selection.value;

for (const entityType of selection.keys()) {
  const bucket = graph.selectionService.getBucket(entityType);
  if (bucket) {
    allSelectedComponents.push(...bucket.$selectedComponents.value);
  }
}

// Now work with all selected components (blocks, connections, etc.)
allSelectedComponents.forEach((component) => {
  const [minX, minY, maxX, maxY] = component.getHitBox();
  // ... use component data
});
```

### Store Computed Signals

Stores provide convenient computed signals for accessing selected components:

```typescript
// In BlockListStore
public $selectedBlockComponents = computed(() => {
  return this.blockSelectionBucket.$selectedComponents.value as Block[];
});

// Usage
const selectedBlocks = graph.rootStore.blocksList.$selectedBlockComponents.value;
// Type: Block[]

// In ConnectionsStore  
public $selectedConnectionComponents = computed(() => {
  return this.connectionSelectionBucket.$selectedComponents.value as BaseConnection[];
});

// Usage
const selectedConnections = graph.rootStore.connectionsList.$selectedConnectionComponents.value;
// Type: BaseConnection[]
```

### React Integration

```typescript
import { useEffect, useState } from "react";
import type { Block } from "@gravity-ui/graph";

function SelectedBlocksPanel({ graph }) {
  const [selectedBlocks, setSelectedBlocks] = useState<Block[]>([]);

  useEffect(() => {
    if (!graph) return;

    const bucket = graph.rootStore.blocksList.blockSelectionBucket;

    // Subscribe to component changes
    const unsubscribe = bucket.$selectedComponents.subscribe((components) => {
      setSelectedBlocks(components as Block[]);
    });

    return () => unsubscribe();
  }, [graph]);

  return (
    <div>
      <h3>Selected: {selectedBlocks.length}</h3>
      {selectedBlocks.map((block) => (
        <div key={block.getEntityId()}>
          Block: {block.getEntityId()}
        </div>
      ))}
    </div>
  );
}
```

### Type Constraints

All selection buckets have a generic constraint on `TEntity`:

```typescript
class BaseSelectionBucket<
  IDType extends TSelectionEntityId,
  TEntity extends TSelectionEntity = TSelectionEntity
>

// TSelectionEntity allows: GraphComponent | IEntityWithComponent | object
interface IEntityWithComponent<T extends GraphComponent = GraphComponent> {
  getViewComponent(): T | undefined;
}
```

This ensures type safety while maintaining flexibility for different entity types (BlockState, ConnectionState, etc.).