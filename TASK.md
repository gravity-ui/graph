# Rules
- [graph-structure](.cursor/rules/graph-structure.mdc)
- [Event model](.cursor/rules/event-model-rules.mdc)
- [Typescript](.cursor/rules/typescript-rules.mdc)
- [Code format rules](.cursor/rules/prettier-style-rules.mdc)

# Selection Management: a Unified Service

Currently, selection management logic (tracking selected items, updating selection based on strategies, resetting selection) is duplicated or implemented inconsistently across `BlockListStore`, `GroupsListStore`, and potentially `ConnectionsStore`. This leads to code redundancy, potential inconsistencies, and makes customization difficult.

We propose refactoring this logic into a new `SelectionService` that acts as a manager for dedicated "Selection Buckets". Each bucket will encapsulate the state and logic for managing selection for a specific entity type (Blocks, Groups, Connections), allowing for customization, better separation of concerns, and improved extensibility.

**Core Components:**

*   **`SelectionService`**:
    *   Acts as a central registry and coordinator for `ISelectionBucket` instances.
    *   Does **not** contain specific selection logic itself.
    *   Provides methods to register/retrieve buckets (`registerBucket`, `getBucket`).
    *   Delegates selection operations (`select`, `deselect`, `isSelected`, `resetSelection`) to the appropriate registered bucket based on `entityType`.
    *   *Pseudocode Example:*
        ```typescript
        class SelectionService {
            private buckets = new Map<string, ISelectionBucket>();

            registerBucket(bucket: ISelectionBucket) {
                this.buckets.set(bucket.entityType, bucket);
            }

            select(entityType: string, ids: TEntityId[], strategy: ESelectionStrategy) {
                const bucket = this.buckets.get(entityType);
                // Delegate the actual logic to the bucket
                bucket?.updateSelection(ids, true, strategy);
            }

            isSelected(entityType: string, id: TEntityId): boolean {
                 const bucket = this.buckets.get(entityType);
                 return bucket ? bucket.isSelected(id) : false;
            }
            // ... other delegation methods
        }
        ```

*   **`ISelectionBucket` (Interface / Abstract Class):**
    *   Defines the contract for managing selection state for a single entity type.
    *   **Properties:**
        *   `entityType: string`: Identifier for the entity type (e.g., 'block').
        *   `$selectedIds: Signal<Set<TEntityId>>`: A Preact signal holding the set of currently selected entity IDs.
    *   **Methods:**
        *   `updateSelection(ids, select, strategy)`: Core method to modify the selection state according to the specified strategy.
        *   `reset()`: Clears the selection within this bucket.
        *   `isSelected(id)`: Checks if a specific ID is selected.
    *   **Responsibility:** Implement the specific selection rules (e.g., single/multiple selection) and emit entity-specific, preventable events (e.g., `blocks-selection-change`) via the `Graph` instance when the selection state changes.
    *   *Pseudocode Example (Interface):*
        ```typescript
        import { Signal } from "@preact/signals-core";
        import { ESelectionStrategy } from "../utils/types";

        interface ISelectionBucket<IDType extends TEntityId = TEntityId> {
            readonly entityType: string;
            readonly $selectedIds: Signal<Set<IDType>>;

            updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy): void;
            reset(): void;
            isSelected(id: IDType): boolean;
        }
        ```
    *   *Pseudocode Example (Concrete Bucket - Multiple):*
        ```typescript
        class MultipleSelectionBucket<IDType> implements ISelectionBucket<IDType> {
            readonly $selectedIds = signal(new Set<IDType>());
            // ... constructor (graph, entityType, eventName) ...

            updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy) {
                // 1. Calculate changes (added, removed) based on current state and strategy
                // 2. If changes exist:
                //    this.graph.executеDefaultEventAction(this.eventName, payload, () => {
                //        // 3. Update this.$selectedIds.value if event not prevented
                //        this.$selectedIds.value = newSelectedState;
                //    });
            }
            // ... reset, isSelected implementation ...
        }
        ```

**Requirements:**

1.  Implement the `SelectionService` as a bucket manager.
2.  Define the `ISelectionBucket` interface/abstract class.
3.  Create concrete bucket implementations (e.g., `MultipleSelectionBucket`, `SingleSelectionBucket`).
4.  Refactor `BlockListStore`, `GroupsListStore`, and `ConnectionsStore` to:
    *   Create and register an appropriate `ISelectionBucket` instance with the `SelectionService` upon initialization.
        *   *Pseudocode Example (in BlockListStore constructor):*
            ```typescript
            constructor(rootStore: RootStore, graph: Graph) {
                this.selectionService = rootStore.selectionService;
                const bucket = new MultipleSelectionBucket<TBlockId>(graph, 'block', 'blocks-selection-change');
                this.selectionService.registerBucket(bucket);
                this.blockSelectionBucket = bucket; // Store local reference
            }
            ```
    *   Subscribe to their bucket's `$selectedIds` signal to derive computed properties (e.g., `$selectedBlocks`).
        *   *Pseudocode Example (in BlockListStore):*
            ```typescript
            $selectedBlocks = computed(() => {
                const selectedIds = this.blockSelectionBucket.$selectedIds.value; // Use bucket's signal
                // ... map IDs to BlockState objects from $blocksMap ...
            });
            ```
    *   Delegate selection initiation requests to the `SelectionService` (e.g., `selectionService.select('block', ids)`).
    *   Remove internal selection state logic.
5.  Refactor `BlockState`, `GroupState`, and `ConnectionState` to determine their selected status reactively from the corresponding bucket's `$selectedIds` signal.
6.  Ensure the system is extensible for new entity types via new bucket implementations.


## NExt steps 

- Use ESelectionStrategy from SelectioManager everywhere
- Reset every selection bucket on ESelectionStrategy.REPLACE
```
selectionService.select('blocks', [...ids], ESelectionStrategy.REPLACE)
``` 
Should reset every others buckets with ESelectionStrategy.RESET
```
selectionService.deselect('connections', EResetSelectionStrategy.RESET)
```
- Add tests