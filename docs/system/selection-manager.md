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

The primary reason for this architecture (central service + specific buckets) is the **separation of concerns** and **extensibility**:

1.  **Centralized Coordination:** `SelectionService` provides a single point of interaction for selection actions (`select`, `deselect`, `reset`) and a unified view of the overall selection state (`$selection`). It ensures consistency, like handling the `REPLACE` strategy across different entity types if needed.
2.  **Delegated State Management:** Each `ISelectionBucket` encapsulates the specific logic for *how* selection works for a particular entity type (single vs. multiple selection, validation, etc.) and holds the actual state (the set of selected IDs).
3.  **Modularity:** Stores responsible for managing specific entities (like `BlockListStore`, `ConnectionListStore`) create and own their respective buckets. This keeps the selection logic close to the data it manages.
4.  **Decoupling:** UI Components (like `Block`, `Anchor`) don't interact with `SelectionService` or buckets directly. They read selection status reactively from their corresponding stores (`BlockListStore`, etc.), which in turn get the state from their registered buckets. This decouples rendering logic from selection management.
5.  **Event-Driven:** The optional callback passed during bucket creation allows for intercepting selection changes, firing events, and potentially preventing updates, enabling complex interaction workflows.

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

### Core API Usage

Assume `selectionService` is an instance of `SelectionService`.

1.  **Selecting Entities:**
    ```typescript
    // Select only block 'b1', deselecting all other blocks
    selectionService.select("block", ["b1"], ESelectionStrategy.REPLACE);

    // Add blocks 'b2', 'b3' to the current block selection
    selectionService.select("block", ["b2", "b3"], ESelectionStrategy.ADD);

    // Select anchor 'a1' (assuming anchor bucket is single-select)
    // This might implicitly deselect any previously selected anchor.
    selectionService.select("anchor", ["a1"], ESelectionStrategy.REPLACE);
    ```

2.  **Deselecting Entities:**
    ```typescript
    // Deselect block 'b2' from the current selection
    selectionService.deselect("block", ["b2"]); // Equivalent to select with SUBTRACT

    // Deselect anchors 'a1', 'a2'
    selectionService.deselect("anchor", ["a1", "a2"]);
    ```

3.  **Resetting Selection:**
    ```typescript
    // Clear selection for blocks only
    selectionService.resetSelection("block");

    // Clear selection for all registered buckets
    selectionService.resetAllSelections();
    ```

4.  **Checking Selection Status:**
    ```typescript
    const isBlockB1Selected = selectionService.isSelected("block", "b1");
    const isAnchorA1Selected = selectionService.isSelected("anchor", "a1");
    ```

5.  **Reacting to Changes:**
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

### Custom cases

- Выделение связанных блоков при клике на блок
- Выделение блока при