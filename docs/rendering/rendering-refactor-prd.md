# PRD: Rendering Engine Refactoring (ECS Approach)

## 1. Introduction and Goals

### 1.1. Problem Statement

The current rendering engine faces several limitations:

1.  **Fixed Layering:** The existing system uses a fixed set of layers (e.g., `ConnectionsLayer`, `BlocksLayer`), making it difficult to achieve fine-grained z-ordering required for complex visual effects (e.g., rendering connection lines *between* a block's background and foreground). (Ref: `ISSUE.md`)
2.  **Imperative Rendering:** Components directly use Canvas API calls, leading to boilerplate code and mixing rendering logic with component logic.
3.  **Inefficient Updates:** Any change to a single component state or the camera view currently triggers a re-render of the entire scene, leading to potential performance bottlenecks, especially in large or complex graphs.

### 1.2. Project Goals

This refactoring aims to address the identified problems by creating a new rendering engine with the following goals:

1.  **Flexible Z-Ordering:** Allow any renderable element to be placed precisely in the rendering stack using a `zIndex` property, enabling complex visual layering.
2.  **Declarative Rendering:** Introduce a Domain-Specific Language (DSL, e.g., `canvas\``) to allow components (via an Adapter) to describe *what* to render, abstracting away direct Canvas API calls and layer management.
3.  **Granular Updates:** Implement a mechanism (inspired by ECS and "dirty" flagging) to ensure that only entities whose state has changed (or entities dependent on them) are processed and re-rendered in each frame.
4.  **Performance:** Maintain or improve rendering performance (FPS, responsiveness) compared to the current system, especially under load.
5.  **Isolation & Reusability:** Develop the core rendering logic as an isolated, generic ECS-based engine that is agnostic to the specific concepts of the main graph library (blocks, connections, etc.), promoting maintainability, testability, and potential reuse.

## 2. User Scenarios / Use Cases

*   **UC1: Complex Block Rendering:** A developer can create a custom block type where connection lines attach *over* its background/padding but *under* its foreground content (e.g., internal elements, labels) by assigning appropriate `zIndex` values to different parts of the block's rendering recipe.
*   **UC2: Smooth Interaction:** A user panning or zooming a large graph experiences smooth visual updates without significant frame drops, as the engine efficiently applies camera transforms and re-renders only what's necessary.
*   **UC3: Efficient Partial Updates:** When a user modifies a single element (e.g., changes the color of one block in a graph with 1000 elements), the update happens quickly, and only the affected element (and potentially directly dependent elements like connections) are re-rendered, not the entire graph.
*   **UC4: Engine Extensibility:** A developer can add support for rendering a new type of visual primitive (e.g., circles, images) primarily by defining new generic components and potentially updating the `RenderSystem` within the isolated engine, without major changes to the core graph library logic.

## 3. Functional Requirements

### 3.1. Core Rendering Engine (ECS-based, Isolated)

*   **FR1.1:** The engine shall use an Entity Component System (ECS) architecture. (Specific library TBD).
*   **FR1.2:** The engine shall manage Entities and generic Components (e.g., Transform, Style, Geometry, Renderable, Dirty).
*   **FR1.3:** The engine shall provide a `RenderSystem` responsible for drawing entities based on their components.
*   **FR1.4:** The `RenderSystem` shall support rendering onto dynamically managed `OffscreenCanvas` layers based on a `zIndex` property in a `RenderableComponent`.
*   **FR1.5:** The `RenderSystem` shall use an object pool (`ObjectPool`) to efficiently manage `OffscreenCanvas` instances.
*   **FR1.6:** The `RenderSystem` shall accept camera transformation parameters and apply them centrally to each `OffscreenCanvas` layer before drawing.
*   **FR1.7:** The `RenderSystem` shall process and render only entities marked as "dirty" (`DirtyComponent`).
*   **FR1.8:** The engine shall support rendering of basic geometric primitives defined by components (e.g., rectangles, paths specified by data, text).
*   **FR1.9:** The engine shall provide a clear public API (`EngineAPI`) for initialization, updates, entity/component management, and setting camera transforms.

### 3.2. Declarative Rendering DSL

*   **FR2.1:** A declarative DSL (e.g., tagged template literal `canvas\``) shall be provided for describing rendering commands.
*   **FR2.2:** The DSL shall allow specifying target `zIndex`, geometry, styling, and text content.
*   **FR2.3:** The DSL output (`RenderRecipe`) shall be interpretable by the `RenderSystem`.

### 3.3. Adapter Layer (Integration)

*   **FR3.1:** An Adapter layer shall translate application-specific state (Blocks, Connections, Groups) into generic ECS entities and components for the engine.
*   **FR3.2:** The Adapter shall listen to changes in the application state and update corresponding ECS components, marking entities as "dirty".
*   **FR3.3:** The Adapter shall manage application-specific dependencies (e.g., if a Block moves, mark its Connections as "dirty" in the ECS engine).
*   **FR3.4:** The Adapter shall interact with the `EngineAPI` to drive the ECS engine's update cycle.

## 4. Non-Functional Requirements

*   **NFR1 (Performance):** The new rendering engine should achieve frame rates comparable to or better than the existing system on benchmark scenarios. Pan/zoom operations should remain fluid (>30 FPS) on large graphs.
*   **NFR2 (Memory):** Memory usage, particularly from `OffscreenCanvas` instances, should be managed efficiently via pooling and stay within acceptable limits.
*   **NFR3 (Maintainability):** The isolated engine and clear separation via the Adapter should improve code organization and ease future maintenance.
*   **NFR4 (Testability):** The generic ECS engine should be unit-testable independently of the main graph library. The Adapter logic should also be testable.

## 5. Open Questions / Future Enhancements

*   Which specific open-source ECS library will be used? (Needs research & decision).
*   What is the comprehensive list of required DSL helper functions?
*   What is the optimal strategy for the `OffscreenCanvas` pool (size, eviction)?
*   How will advanced rendering features (gradients, images, clipping, complex paths) be handled by the generic engine and DSL?
*   What specific debugging tools or visualizations will be needed for the new engine?
*   Detailed API design for the `EngineAPI`.
*   Detailed strategy for dependency tracking in the Adapter.