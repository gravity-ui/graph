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