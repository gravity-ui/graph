**Problem:**
The current rendering engine utilizes a fixed layered approach (e.g., `ConnectionsLayer` rendered beneath `BlocksLayer`). This architecture imposes limitations on rendering flexibility. Specifically, it's difficult to achieve fine-grained z-ordering, such as rendering connection lines belonging to a composite block *over* its background/padding but *under* its foreground content (like internal elements or labels). This prevents the creation of visually integrated composite elements where connections seamlessly interact with different visual parts of the block.

**Proposed Solution:**
Perform a significant refactoring of the core Canvas rendering pipeline based on two key ideas:

1.  **Dynamic `OffscreenCanvas` Layers:** Replace the fixed layer system with dynamically requested `OffscreenCanvas` instances managed by a central service (`MainRenderer`). Composition order will be strictly determined by a `zIndex` provided by components.
2.  **Declarative Rendering DSL:** Introduce a Domain-Specific Language (DSL) using tagged template literals (`canvas\``) to allow components to describe their rendering requirements declaratively, abstracting away direct Canvas API calls and layer management.

**Core Concepts:**

1.  **`MainRenderer` Service:**
    *   Acts as the central manager for `OffscreenCanvas` layers.
    *   Provides a method like `requestCanvas({ zIndex: number, class?: string }): CanvasRenderingContext2D | LayerDrawingContext` for components to obtain a drawing surface for a specific z-level.
    *   Manages an `ObjectPool` of `OffscreenCanvas` instances to optimize creation and reuse.
    *   Ensures canvases are cleared (`clearRect`) before being used each frame (likely centrally before component rendering starts).
    *   In the main render loop, collects all canvas contexts active in the current frame based on requests.
    *   Sorts the active canvases based on their `zIndex`.
    *   Composes the sorted canvases onto the main visible canvas using `drawImage`.

2.  **`ObjectPool` for `OffscreenCanvas`:**
    *   Efficiently manages `OffscreenCanvas` resources, minimizing creation/destruction overhead.
    *   Should be configurable (e.g., minimum pool size, allow expansion or fixed size). Defaults should cover common cases (groups, connections, blocks, selection).
    *   Inactive canvases (not requested in a frame) are kept in the pool but not composed, and cleared upon next request.

3.  **Component Rendering (`Block`, `Connection`, etc.):**
    *   Components will primarily use the proposed DSL (`canvas\``) to describe *what* to render on which logical layer (`zIndex`).
    *   The DSL translates declarative descriptions into rendering commands.

4.  **Camera Transformation:**
    *   Must be applied to the `OffscreenCanvas` context *before* drawing primitives to ensure correct positioning relative to the viewport.
    *   The `MainRenderer` will likely handle applying the camera transform *once* per `OffscreenCanvas` layer just before executing the commands for that layer. This avoids redundant `setTransform` calls within the command execution loop for a given layer.

5.  **Default `zIndex` Values:**
    *   Define sensible default `zIndex` values for common elements (e.g., `groups = 9`, `connections = 10`, `blocks = 20` (background?), `block_foreground = 25`?, `selection = 30`). These serve as conventions and can be overridden.

**Proposed DSL for Declarative Rendering (`canvas\``):**

Components define their rendering using a `canvas` tag, returning a `RenderRecipe`. Conditional logic within the template determines parameters dynamically based on component state.

```typescript
import { canvas, layer, fillStyle, fillRect, strokeStyle, strokeRect, fillText, lineWidth } from './canvas-dsl'; // Example path

// Inside a Block component
render(): RenderRecipe {
    const { x, y, width, height, label, selected } = this.state;
    const colors = this.context.colors.block; // Assuming context provides theme colors

    // Returns a descriptive recipe using dynamic parameters within helpers
    return canvas`
        ${layer(
            // Dynamically choose zIndex and class based on selection
            selected ? 30 : 10,                // zIndex: 30 for selected, 10 for normal background
            selected ? 'selection' : 'background', // class: 'selection' or 'background'
            [ // Commands for this layer
                fillStyle(colors.background), // Fill style might be consistent
                fillRect(x, y, width, height),
                // Dynamically choose stroke color and width
                strokeStyle(selected ? colors.selectedBorder : colors.border),
                lineWidth(selected ? 2 : 1),
                // Stroke rect - consider adjusting geometry slightly for thicker selection borders
                strokeRect(x, y, width, height),
            ]
        )}

        ${layer(20, 'foreground', [ // zIndex 20 - Foreground layer (e.g., text)
            fillStyle(colors.text),
            // Other context settings like textAlign, textBaseline...
            fillText(label, x + width / 2, y + height / 2),
            // Potential support for rendering child elements declaratively?
        ])}
    `;
}
```

**DSL Implementation Details:**

1.  **Helper Functions (`fillStyle`, `fillRect`, etc.):** Return simple descriptor objects (e.g., `{ type: 'fillRect', args: [...] }`).
2.  **`canvas` Tag Function:** Collects the layer descriptor objects (`layer(...)`) into a `RenderRecipe` (`{ layers: [...] }`).
3.  **`MainRenderer` Interpretation:**
    *   Receives `RenderRecipe`s from all components.
    *   Groups all commands by `zIndex` across recipes.
    *   For each active `zIndex`:
        *   Acquires the target `OffscreenCanvas`.
        *   **Applies camera transform ONCE.**
        *   Executes the command list for that `zIndex`.
    *   Performs final layer composition.

**Potential Benefits:**

*   **Full Z-Ordering Flexibility:** Solves the core problem described.
*   **Improved Readability & Conciseness:** Declarative DSL simplifies component render logic and reduces boilerplate for state variations.
*   **Stronger Abstraction:** Hides canvas/layer management details.
*   **Centralized Optimization:** `MainRenderer` manages transforms and can potentially optimize command batching or state changes.

**Potential Challenges & Risks:**

*   **Memory Consumption:** Increased `OffscreenCanvas` usage needs efficient pooling.
*   **Composition Performance:** Overhead of `drawImage` for many layers needs profiling.
*   **Complexity:** Significant architectural change needs careful implementation.
*   **DSL API Coverage:** Need a comprehensive set of helpers. How to handle complex Canvas features (paths, gradients, `drawImage`, clips)?
*   **DSL Performance Overhead:** Indirect execution might be slightly slower (needs profiling).
*   **Debugging:** Might require inspecting recipes or `MainRenderer` execution.
*   **HTML Layer Integration:** Must ensure the HTML rendering overlay remains correctly positioned and synchronized. Canvas/HTML switching logic needs verification.
*   **Refactoring Effort:** Requires updating core rendering and adapting existing components.

**Open Questions:**

*   What is the most robust strategy for the `OffscreenCanvas` pool (fixed vs. dynamic size, eviction policy)?
*   How to best manage clearing of canvases (centralized most likely)?
*   How will complex Canvas Paths (`beginPath`, `moveTo`, `lineTo`, `bezierCurveTo`, `stroke`, `fill`) be represented in the DSL?
*   How will `save()`/`restore()` context states be handled within the DSL/Renderer?

**Acceptance Criteria (Draft):**

*   A custom block component can render its background on `zIndex: N`, its foreground content on `zIndex: N+10`, and connections targeting it render correctly on `zIndex: N+5`.
*   The declarative DSL (`canvas\``) is usable for defining rendering logic for standard blocks and connections.
*   Existing rendering functionality (standard blocks, connections, groups, selection) remains visually and functionally intact using the new engine/DSL.
*   HTML overlay components (React) display correctly positioned over the composed canvas result.
*   Performance (FPS) and memory usage remain within acceptable bounds compared to the current engine. Stress tests with many elements should be conducted.
