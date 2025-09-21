# SelectionService Documentation

## 1. Description and Behavior

### Overview

`SelectionService` is a centralized manager for selection state in a graph application. It coordinates selection for different entity types (blocks, connections, groups, custom entities) using a system of "selection buckets". Each bucket manages selection for a single entity type, while the service itself provides a unified API, ensures consistent selection logic (e.g., clearing other selections on `REPLACE`), and orchestrates events. It utilizes `@preact/signals-core` for reactive state management.

### Key Concepts

- **Selection Buckets:** Each bucket implements the `ISelectionBucket` interface and is responsible for managing selection state (the set of selected IDs) for a specific entity type (identified by a unique string ID, e.g., `"block"`, `"anchor"`). Concrete implementations like `SingleSelectionBucket` (allows only one selected ID) and `MultipleSelectionBucket` (allows multiple) are provided.
- **Registration:** Buckets are created (usually within entity-specific stores like `BlockListStore`) and then registered in the central `SelectionService` using `registerBucket(bucket)`. This makes the service aware of the entity type and its selection rules.
- **Selection Strategies:**
  - `REPLACE`: Select only the specified entities, clearing selection from all others *within the same bucket* and potentially resetting other buckets (depending on configuration/interaction logic).
  - `ADD`: Add specified entities to the current selection within the bucket.
  - `SUBTRACT`: Remove specified entities from the current selection within the bucket.
- **Coordination:** The service coordinates actions across buckets. For instance, when a selection change occurs, it can trigger events (`graph.executеDefaultEventAction`) allowing other parts of the system to react or even cancel the change *before* it's applied to the bucket's state.
- **Extensibility:** New entity types can be easily supported by implementing a custom bucket and registering it.
- **Reactivity:** The service exposes a computed signal `$selection` (a `Map<string, Set<TEntityId>>`) that aggregates the selected IDs (`$selected.value`) from all registered buckets. This allows other parts of the application to reactively update based on selection changes across the entire graph.

### Architecture Rationale

The SelectionService architecture was designed to solve several practical challenges that emerged during development:

#### Challenge 1: Consistent Selection Behavior
When you select something new, you usually want to clear the previous selection. For example, when clicking on a block, any previously selected connections should be deselected automatically. Without a central coordinator, each entity type would manage its own selection independently, leading to confusing UI states where multiple unrelated items remain selected.

**Solution:** `SelectionService` acts as a central coordinator that automatically handles the "clear others when selecting new" behavior across all entity types.

#### Challenge 2: Easy Integration for Custom Entities
Graph libraries need to support custom entity types beyond the standard blocks and connections. Adding selection support for a new entity type shouldn't require writing complex state management code or event handling logic.

**Solution:** The bucket registration pattern makes it simple - just create a bucket for your entity type and register it. The selection system automatically handles the rest.

#### Challenge 3: Avoiding Event Storms
If each entity fired its own selection event, selecting 10 blocks would trigger 10 separate events. This creates performance issues and makes it hard to handle selection changes efficiently.

**Solution:** Selection buckets batch changes and emit a single consolidated event with all the details about what was selected and deselected.

#### Challenge 4: Different Selection Rules
Some entities should only allow one item to be selected (like anchors), while others support multiple selection (like blocks). These rules shouldn't be enforced in UI components - they should be built into the selection system.

**Solution:** `SingleSelectionBucket` and `MultipleSelectionBucket` enforce these rules automatically, so components don't need to worry about validation.

#### Why This Architecture Works
This design provides several benefits:
- **Consistency:** Selection behavior is predictable across the entire graph
- **Simplicity:** Adding new selectable entities requires minimal code
- **Performance:** Single events instead of event storms
- **Reliability:** Selection rules are enforced automatically, not manually

---

## 2. Usage in @gravity-ui/graph

### Initialization and Access

- In @gravity-ui/graph, `SelectionService` is instantiated within the `Graph` class.
- Buckets (e.g., `blockSelectionBucket`, `anchorSelectionBucket`) are typically created within corresponding Stores (e.g., `src/store/block/BlocksList.ts`) and registered with the service during store initialization:
  ```typescript
  // Inside BlockListStore constructor
  this.blockSelectionBucket = new MultipleSelectionBucket(/* ... */);
  this.rootStore.selectionService.registerBucket(this.blockSelectionBucket);

  this.anchorSelectionBucket = new SingleSelectionBucket(/* ... */);
  this.rootStore.selectionService.registerBucket(this.anchorSelectionBucket);
  ```
- Access the service instance via the `graph.selectionService` accessor or through the root store: `graph.rootStore.selectionService`.
```typescript
const selectionBucket = new MultipleSelectionBucket(/* ... */);
graph.selectionService.registerBucket(selectionBucket);
// or 
selectionBucket.attachToManager(graph.selectionService);
```

### Bucket Behavior: Connected vs Standalone

The selection system supports two interaction patterns depending on whether buckets are connected to the SelectionService:

#### Connected Buckets (Recommended for Internal Use)
When a bucket is attached to a SelectionService, all selection operations are delegated to the central service:

```typescript
// Bucket is connected to SelectionService
bucket.attachToManager(selectionService);

// These calls are delegated to SelectionService
bucket.select(['item1', 'item2'], ESelectionStrategy.REPLACE);
bucket.deselect(['item1']);
```

**Behavior:**
- `bucket.select()` → calls `selectionService.select()`
- `bucket.deselect()` → calls `selectionService.deselect()`
- SelectionService coordinates with other buckets (e.g., resets others on REPLACE)
- Consistent cross-entity selection behavior is maintained

**Use case:** Internal entity management within stores where coordinated selection behavior is required.

#### Standalone Buckets (For Isolated Use Cases)
When a bucket is not connected to a SelectionService, it operates independently:

```typescript
// Bucket operates standalone
const standaloneBucket = new MultipleSelectionBucket('isolated');

// These calls only affect this bucket's state
standaloneBucket.select(['item1', 'item2'], ESelectionStrategy.REPLACE);
standaloneBucket.deselect(['item1']);
```

**Behavior:**
- Selection operations only affect this bucket's internal state
- No coordination with other buckets
- Events are still fired through the `onSelectionChange` callback

**Use case:** Testing, isolated components, or when you need selection behavior without cross-entity coordination.

#### Selection Service Direct Access (For External Control)
For external coordination or when one entity needs to affect another, use the SelectionService directly:

```typescript
// External control - affects multiple entity types with coordination
selectionService.select('block', ['b1', 'b2'], ESelectionStrategy.REPLACE);
selectionService.select({
  block: ['b1'],
  connection: ['c1']
}, ESelectionStrategy.REPLACE);
```

**Use case:** Public API, user interactions, or cross-entity operations where centralized coordination is needed.

### Core API Usage

Assume `selectionService` is an instance of `SelectionService`.

#### Single-Entity Selection API

1.  **Selecting Single Entity Type:**
    ```typescript
    // Select only block 'b1', deselecting all other blocks
    selectionService.select("block", ["b1"], ESelectionStrategy.REPLACE);

    // Add blocks 'b2', 'b3' to the current block selection
    selectionService.select("block", ["b2", "b3"], ESelectionStrategy.ADD);

    // Select anchor 'a1' (assuming anchor bucket is single-select)
    // This might implicitly deselect any previously selected anchor.
    selectionService.select("anchor", ["a1"], ESelectionStrategy.REPLACE);
    ```

2.  **Deselecting Single Entity Type:**
    ```typescript
    // Deselect block 'b2' from the current selection
    selectionService.deselect("block", ["b2"]); // Equivalent to select with SUBTRACT

    // Deselect anchors 'a1', 'a2'
    selectionService.deselect("anchor", ["a1", "a2"]);
    ```

3.  **Resetting Single Entity Type:**
    ```typescript
    // Clear selection for blocks only
    selectionService.resetSelection("block");

    // Clear selection for multiple entity types
    selectionService.resetSelection(["block", "connection"]);

    // Clear selection for all registered buckets
    selectionService.resetAllSelections();
    ```

4.  **Checking Single Entity Selection Status:**
    ```typescript
    const isBlockB1Selected = selectionService.isSelected("block", "b1");
    const isAnchorA1Selected = selectionService.isSelected("anchor", "a1");
    ```

#### Multi-Entity Selection API

5.  **Selecting Multiple Entity Types:**
    ```typescript
    // Select blocks and connections simultaneously
    selectionService.select({
      block: ["b1", "b2"],
      connection: ["c1", "c2"]
    }, ESelectionStrategy.REPLACE);

    // Add to existing selections
    selectionService.select({
      block: ["b3"],
      connection: ["c3"]
    }, ESelectionStrategy.APPEND);
    ```

6.  **Deselecting Multiple Entity Types:**
    ```typescript
    // Deselect specific items from multiple types
    selectionService.deselect({
      block: ["b1"],
      connection: ["c2"]
    });
    ```

7.  **Checking Multiple Entity Selection Status:**
    ```typescript
    // Check if any of the specified IDs are selected
    const results = selectionService.isSelected({
      block: ["b1", "b2"],      // true if b1 OR b2 is selected
      connection: ["c1", "c2"]  // true if c1 OR c2 is selected
    });
    // results: { block: true, connection: true }
    ```

8.  **Reacting to Changes:**
    ```typescript
    // Get the current selection state across all buckets
    const currentSelectionMap = selectionService.$selection.value;
    // Map { "block": Set {"b1", "b3"}, "anchor": Set {"a1"} }

    const selectedBlockIds = currentSelectionMap.get("block") ?? new Set();

    // Subscribe to any selection change in any bucket
    const unsubscribe = selectionService.$selection.subscribe((newSelectionMap) => {
      console.log("Selection changed:", newSelectionMap);
      // Update UI or trigger other logic
    });

    // Remember to call unsubscribe() when done listening
    ```

---

## 3. Extending SelectionService for Custom Entities

To add selection support for a new type of entity (e.g., "groups"):

1.  **Define a Bucket ID:** Choose a unique string identifier (e.g., `"group"`).
2.  **Create a Bucket Class:**
    - Implement the `ISelectionBucket<TEntityId>` interface, or extend `BaseSelectionBucket`, `SingleSelectionBucket`, or `MultipleSelectionBucket`.
    - The type parameter `TEntityId` should match the type of your entity's ID (e.g., `string`, `number`).
    ```typescript
    import { MultipleSelectionBucket, ISelectionBucket } from "src/services/selection";
    import type { TGroupId } from "src/types/group"; // Assuming group ID type

    export const GROUP_BUCKET_ID = "group";

    // Example using MultipleSelectionBucket
    export class GroupSelectionBucket extends MultipleSelectionBucket<TGroupId> {
      constructor(onBeforeChange?: ISelectionBucket<TGroupId>["onBeforeChange"]) {
        super(GROUP_BUCKET_ID, onBeforeChange);
      }

      // Add any group-specific selection logic if needed
    }
    ```
3.  **Instantiate and Register:**
    - In the store or service responsible for managing your custom entities (e.g., `GroupListStore`), create an instance of your new bucket.
    - Optionally, provide the `onBeforeChange` callback to hook into the graph's event system.
    - Register the bucket with the `SelectionService`.
    ```typescript
    // Inside GroupListStore constructor
    import { Graph } from "src/graph";
    import { RootStore } from "src/store";
    import { GroupSelectionBucket } from "./GroupSelectionBucket";
    import { ESelectionStrategy } from "src/services/selection";

    export class GroupListStore {
      public readonly groupSelectionBucket: GroupSelectionBucket;

      constructor(protected rootStore: RootStore, protected graph: Graph) {
        this.groupSelectionBucket = new GroupSelectionBucket(
          (payload, defaultAction) => {
            // Fire a custom event before changing group selection
            return this.graph.executеDefaultEventAction(
              "groups-selection-change", // Define this event type
              payload,
              defaultAction
            );
          }
        );

        // Register with the central service
        this.rootStore.selectionService.registerBucket(this.groupSelectionBucket);
      }

      // Method to select groups using the service
      selectGroups(groupIds: TGroupId[], strategy = ESelectionStrategy.REPLACE) {
         this.rootStore.selectionService.select(
            this.groupSelectionBucket.id, // Use bucket ID constant
            groupIds,
            strategy
         );
      }

      // Method to read selected groups reactively
      $selectedGroups = computed(() => {
         // Assuming groups are stored elsewhere, e.g., in this.groupsMap
         const selectedIds = this.groupSelectionBucket.$selected.value;
         return Array.from(this.groupsMap.values())
                   .filter(group => selectedIds.has(group.id));
      });

      // ... other group management logic ...
    }
    ```
4.  **Use:** Now you can use `selectionService.select("group", ...)` and `selectionService.$selection.value.get("group")` just like the built-in types.

---

## 4. Examples in Layers / Components

(Existing examples remain relevant but should be interpreted with the understanding that layers/components typically interact with the *stores* or use hooks that access stores, which then call `SelectionService`.)

### Example: Multi-Entity Selection in Interaction Layer

```typescript
// MultiEntityInteractionLayer.ts (Simplified)
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import { ESelectionStrategy } from "src/services/selection/types";
import { TCoords } from "src/types";

export class MultiEntityInteractionLayer extends Layer<LayerProps, LayerContext, {}> {
  get selectionService() {
    return this.context.graph.selectionService;
  }

  afterInit() {
    this.getCanvas()?.addEventListener("click", this.handleClick);
  }

  unmount() {
    this.getCanvas()?.removeEventListener("click", this.handleClick);
    super.unmount();
  }

  handleClick = (event: MouseEvent) => {
    const worldPos: TCoords = this.context.camera.getWorldPosition(event.offsetX, event.offsetY);

    // Multi-select blocks and connections at click position
    const selection = {
      block: ["block-at-position"],
      connection: ["connection-at-position"]
    };

    this.selectionService.select(selection, ESelectionStrategy.REPLACE);
  };

  render() {} // Interaction-only layer
}
```

### Example: Bulk Selection Management

```typescript
// BulkSelectionManager.ts
import { SelectionService } from "src/services/selection/SelectionService";
import { ESelectionStrategy } from "src/services/selection/types";

export class BulkSelectionManager {
  constructor(private selectionService: SelectionService) {}

  selectAllBlocksAndConnections(blockIds: string[], connectionIds: string[]) {
    this.selectionService.select({
      block: blockIds,
      connection: connectionIds
    }, ESelectionStrategy.REPLACE);
  }

  deselectFromAllTypes(blockIds: string[], connectionIds: string[]) {
    this.selectionService.deselect({
      block: blockIds,
      connection: connectionIds
    });
  }

  getSelectionStatus() {
    const results = this.selectionService.isSelected({
      block: ["b1", "b2"],
      connection: ["c1", "c2"]
    });

    return results; // { block: true, connection: false }
  }

  clearAllSelections() {
    this.selectionService.resetAllSelections();
  }
}
```

### Example: Highlighting Selected Custom Entities

```typescript
// CustomGroupHighlightLayer.ts (Simplified)
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import type { RootStore } from "src/store";
import { TGroupId } from "src/types/group"; // Assuming group ID type
import { GROUP_BUCKET_ID } from "src/store/group/GroupSelectionBucket"; // Import bucket ID

// ... Layer setup ...

export class CustomGroupHighlightLayer extends Layer<LayerProps, LayerContext, {}> {
  get selectionService() { // Access via context
    return this.context.graph.selectionService;
  }

  afterInit() {
    // React to *any* selection change if needed, or rely on render
    this.addSubscription(
      this.selectionService.$selection.subscribe(() => {
        this.requestRender(); // Re-render when any selection changes
      }),
    );
  }

  render() {
    // Get selected group IDs specifically
    const selectedGroupIds = this.selectionService.$selection.value.get(GROUP_BUCKET_ID) ?? new Set<TGroupId>();

    if (selectedGroupIds.size === 0) return;

    const ctx = this.context.ctx;
    const colors = this.context.graph.config.colors;
    if (!ctx || !colors) return;

    ctx.save();
    ctx.strokeStyle = colors.selection || "purple"; // Use a distinct color
    ctx.lineWidth = 2;

    // Highlight selected groups (assuming getGroupById exists on graph or store)
    for (const groupId of selectedGroupIds) {
      const group = this.context.graph.getGroupById(groupId); // Hypothetical method
      if (group /* && group.isVisible() */) {
        const { x, y, width, height } = group.getBounds(); // Hypothetical method
        ctx.strokeRect(x, y, width, height);
      }
    }
    ctx.restore();
  }
}
```

### Example: Handling Selection Interaction for Custom Entities

```typescript
// GroupInteractionLayer.ts (Simplified)
import { Layer, LayerProps, LayerContext } from "src/services/Layer";
import { ESelectionStrategy } from "src/services/selection/types";
import { TCoords } from "src/types";
import { GROUP_BUCKET_ID } from "src/store/group/GroupSelectionBucket"; // Import bucket ID

// ... Layer setup ...

export class GroupInteractionLayer extends Layer<LayerProps, LayerContext, {}> {
  get selectionService() {
    return this.context.graph.selectionService;
  }

  afterInit() {
    this.getCanvas()?.addEventListener("click", this.handleClick);
  }

  unmount() {
    this.getCanvas()?.removeEventListener("click", this.handleClick);
    super.unmount();
  }

  handleClick = (event: MouseEvent) => {
    const worldPos: TCoords = this.context.camera.getWorldPosition(event.offsetX, event.offsetY);

    // Find group at click position (hypothetical)
    const group = this.context.graph.getGroupAt(worldPos.x, worldPos.y);

    if (group) {
      // Select only this group using the correct bucket ID
      this.selectionService.select(
        GROUP_BUCKET_ID,
        [group.id],
        ESelectionStrategy.REPLACE // Or ADD/SUBTRACT based on Shift/Ctrl keys
      );
    } else {
      // Optional: Clear group selection if clicking empty space
      // this.selectionService.resetSelection(GROUP_BUCKET_ID);
    }
  };

  render() {} // Interaction-only layer
}
```

---

### Summary of Integration Points

- **`SelectionService`:** Central coordinator accessed via `graph.selectionService`. Provides `select`, `deselect`, `reset`, `isSelected`, and the reactive `$selection` signal.
- **`ISelectionBucket`:** Interface for entity-specific selection logic (`SingleSelectionBucket`, `MultipleSelectionBucket`, custom implementations). Holds `$selected` signal for its own IDs.
- **Stores (e.g., `BlockListStore`, `ConnectionListStore`, `GroupListStore`):** Create, own, and register buckets. Provide higher-level methods (like `selectBlocks`, `getSelectedGroups`) and computed signals (`$selectedBlocks`, `$selectedAnchor`) that internally use the service and buckets. They often handle the `onBeforeChange` callback for events.
- **Components/Layers:** Read selection state reactively from Stores (preferred) or directly from `selectionService.$selection` if necessary. Trigger selection changes by calling methods on Stores or, less commonly, directly on `SelectionService` (e.g., in interaction layers).
- **Context:** Use `LayerContext` or React Context to access `graph`, `camera`, `ctx`, and `selectionService`.
- **Best Practice:** Encapsulate selection logic within stores. Interact with selection via store methods from components/layers. Use reactivity (`$selection` signal or computed signals in stores) to update the UI.
- **Cleanup:** Remember to remove event listeners and signal subscriptions (e.g., in `unmount` methods or React `useEffect` cleanup).
- **`select` vs `deselect`**: `select` uses the specified strategy (`REPLACE`, `ADD`, `SUBTRACT`). `deselect` always acts as `SUBTRACT` for the given bucket. `resetSelection` clears all selections for a specific bucket.
