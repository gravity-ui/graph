# Architecture Document: ECS-Based Rendering Engine

## 1. Overview and Goals

This document outlines the architecture for refactoring the graph rendering engine based on the requirements defined in `rendering-refactor-prd.md`. The core goals are to achieve flexible z-ordering, declarative rendering via a DSL, granular updates for improved performance, and an isolated, reusable rendering core.

The chosen architecture is based on the Entity Component System (ECS) pattern, utilizing an isolated generic engine built upon the **`becsy`** library (or a similar high-performance ECS library if `becsy` proves unsuitable during implementation). An Adapter layer will bridge the main graph library's concepts (Blocks, Connections, Groups) with the generic ECS engine.

## 2. Key Architectural Decisions

*   **Pattern:** Entity Component System (ECS).
*   **ECS Library:** **`becsy`** (preliminary choice).
*   **Isolation:** A generic, domain-agnostic ECS rendering engine will be developed as a separate module/package.
*   **Adapter Layer:** A dedicated layer (`ECSEngineAdaptor`) will translate graph library state into ECS entities/components and manage dependencies.
*   **Rendering:** Hybrid rendering supporting Canvas and DOM (React) elements, potentially SVG in the future. Canvas rendering uses a declarative `canvas\` `` DSL.
*   **Layering:** Three fixed base layers (`below`, `main`, `over`) managed in the DOM. Entities are assigned to a `baseLayer`. Ordering *within* a base layer is controlled by a `zIndex` property.
*   **Updates:** Granular updates based on a "dirty" component flag (`DirtyComponent`).
*   **Camera Transform:** Applied centrally to both Canvas layers and DOM elements.
*   **Level of Detail (LOD):** Support for dynamically switching an entity's render type (Canvas/DOM) based on configurable rules (e.g., camera zoom) via `LODDecisionComponent`.

## 3. System Diagram (ECS Approach)

```mermaid
graph TD
    subgraph MainApp [Main Graph Library]
        AppState[App State (Blocks, Connections, Groups)]
        AppLogic[App Logic]
        Adaptor[ECSEngineAdaptor / LayerManager]
        ReactComponents[React Components (for DOM)]
    end

    subgraph GenericECSEngine [Generic ECS Engine (State + Canvas Rendering)]
        EntityManager[(Entities & Components DB)]
        CanvasRenderSys(Canvas Render System)
        OtherECSSystems(LOD Logic?)
        EngineAPI[Engine Public API]
    end

    subgraph DOMStructure [DOM Structure]
        Container(Graph Container) --> BLBelow(Base Layer Below div z:100)
        Container --> BLMain(Base Layer Main div z:200)
        Container --> BLOver(Base Layer Over div z:300)

        BLBelow --> CanvasBelow(Canvas Below)
        BLBelow --> DOMBelowContainer(DOM Below Container)

        BLMain --> CanvasMain(Canvas Main)
        BLMain --> DOMMainContainer(DOM Main Container)

        BLOver --> CanvasOver(Canvas Over)
        BLOver --> DOMOverContainer(DOM Over Container)
    end

    subgraph EngineResources [Engine Resources]
        Pool(ObjectPool<OffscreenCanvas>)
        DSL(Canvas DSL `canvas\``)
        Camera(Camera Service)
    end

    UserEvents --> AppLogic --> AppState
    AppState -- Changes --> Adaptor

    Adaptor -- Manages --> EntityManager
    Adaptor -- Sets Dirty --> EntityManager
    Adaptor -- Manages Dependencies --> AdaptorLogic{Adaptor Dep Logic}
    Adaptor -- Runs --> LODLogic{LOD Logic}

    Adaptor -- Queries Dirty Entities --> EntityManager
    Adaptor -- Gets Entity Data --> EntityManager

    Adaptor -- Determines Target Layer & Type --> Logic{Adaptor/LayerManager Logic}
    Logic -- Manages DOM Structure --> DOMStructure
    Logic -- Triggers --> CanvasRenderSys
    Logic -- Updates Props/Mounts --> ReactComponents

    CanvasRenderSys -- Renders to --> CanvasBelow
    CanvasRenderSys -- Renders to --> CanvasMain
    CanvasRenderSys -- Renders to --> CanvasOver
    CanvasRenderSys -- Uses --> Pool, DSL, Camera

    ReactComponents -- Render to --> DOMBelowContainer
    ReactComponents -- Render to --> DOMMainContainer
    ReactComponents -- Render to --> DOMOverContainer
    ReactComponents -- Uses --> Camera %% For transform prop

```

## 4. System Components

### 4.1. Generic ECS Engine (based on `becsy`)

*   **`becsy` World (`EntityManager`):** The core instance provided by the `becsy` library, managing entities and component storage.
*   **Generic Components (Defined using `becsy` API):**
    *   `IdentifierComponent`: `{ type: string }` (e.g., 'rect', 'path', 'text', 'group-background') - Defines primitive type for rendering.
    *   `TransformComponent`: `{ x: number, y: number, rotation: number, scale: number, worldMatrix?: DOMMatrix }` - Local transform relative to parent (if any). `worldMatrix` calculated by Adaptor/TransformSystem.
    *   `RenderInfoComponent`: `{ type: 'canvas' | 'dom' | 'svg', baseLayer: 'below' | 'main' | 'over', zIndex: number, isVisible: boolean }` - Defines render type, target base layer, and order within that layer.
    *   `LODDecisionComponent`: `{ domMinZoom?: number, canvasMaxZoom?: number, domMinScreenSize?: number, canvasMaxScreenSize?: number, lowFpsThreshold?: number, lowFpsType?: 'canvas' | 'dom', forceType?: 'canvas' | 'dom' | 'auto', defaultType: 'canvas' | 'dom' }` - Rules for LOD logic to determine `RenderInfoComponent.type`.
    *   `GeometryComponent`: `{ data: any }` (e.g., `{ width, height }` for 'rect', `{ d: string }` for 'path'). Used primarily by `CanvasRenderSystem`. Data structure depends on `IdentifierComponent.type`.
    *   `StyleComponent`: `{ fill?: string, stroke?: string, lineWidth?: number, opacity?: number, font?: string, textAlign?: string, ... }` - Visual styling properties, used by both Canvas and DOM renderers.
    *   `DOMInfoComponent` (Optional, for DOM type): `{ reactComponent: React.ComponentType, props: Record<string, any> }` - Specifies the React component and its props (managed by Adaptor).
    *   `DirtyComponent`: `{ flag: boolean }` - Marks entity for processing by relevant systems (Render, Transform, etc.).
    *   *(Optional)* `HierarchyComponent`: `{ parent?: EntityId, children?: Set<EntityId> }` - For managing logical groups and transform propagation.
    *   *(Optional)* `DependencyTargetComponent`: `{ id: string }` - Stable ID for external dependency tracking by the Adapter.
*   **Generic Systems (Defined using `becsy` API):**
    *   `DirtySystem` (or logic within Adaptor): Sets `DirtyComponent.flag = true` when other components change. *Dependency logic resides primarily in the Adaptor.*
    *   `TransformSystem` (Optional/Part of Adaptor): Calculates `worldMatrix` in `TransformComponent`, considering `HierarchyComponent` if used.
    *   `CanvasRenderSystem` (`MainRenderer` for Canvas):
        *   Queries entities with `RenderInfoComponent { type: 'canvas', isVisible: true }`, `DirtyComponent { flag: true }`, `TransformComponent`, `GeometryComponent`, `StyleComponent`.
        *   Groups entities by `RenderInfoComponent.baseLayer`.
        *   For each `baseLayer` ('below', 'main', 'over') with dirty canvas entities:
            *   Gets the corresponding target `<canvas>` element (managed by Adaptor/LayerManager).
            *   Groups entities for this layer by `RenderInfoComponent.zIndex`.
            *   Manages `ObjectPool<OffscreenCanvas>` for internal layering *within* the target canvas.
            *   For each internal `zIndex` sub-layer:
                *   Acquires `OffscreenCanvas` from pool.
                *   Clears canvas.
                *   Applies camera transform (obtained via `EngineAPI`).
                *   Iterates through entities for this sub-layer:
                    *   Applies entity's world transform (`TransformComponent.worldMatrix`).
                    *   Uses `canvas\` `` DSL based on `GeometryComponent` and `StyleComponent` to draw on the `OffscreenCanvas`.
            *   Composites sorted `OffscreenCanvas` sub-layers onto the target base layer `<canvas>`.
        *   Resets `DirtyComponent.flag = false` for processed canvas entities.
*   **Engine Public API (`EngineAPI`):** (Interface for the Adaptor to interact with the ECS world)
    *   `init(): void` (Canvas elements managed externally by Adaptor/LayerManager)
    *   `updateSystems(deltaTime: number): void` (Executes ECS systems like `CanvasRenderSystem`)
    *   `setCameraTransform(matrix: DOMMatrix): void` (Passed to relevant systems)
    *   `createEntity(components: Component[]): EntityId`
    *   `deleteEntity(id: EntityId): void`
    *   `addComponent(id: EntityId, component: Component): void`
    *   `removeComponent(id: EntityId, componentType: ComponentClass): void`
    *   `getComponent<T>(id: EntityId, componentType: ComponentClass<T>): T | undefined`
    *   `setComponentData(id: EntityId, componentType: ComponentClass, data: Partial<ComponentData>): void` (Includes setting Dirty flag)

### 4.2. Adapter Layer (`ECSEngineAdaptor` / `LayerManager`)

*   **Responsibilities:**
    *   Instantiate and initialize the ECS Engine via `EngineAPI`.
    *   Observe the main application state (Blocks, Connections, Groups).
    *   **State Synchronization:** Translate application state changes (Blocks, Connections, Groups) into ECS `setComponentData` calls. Create/delete ECS entities as needed.
    *   **LOD Logic:** Execute Level of Detail logic (based on `LODDecisionComponent` and camera zoom/other factors) to update `RenderInfoComponent.type`.
    *   **Dependency Management:** When an application entity changes, identify dependent entities (e.g., Block moves -> Connections update) and set the `DirtyComponent` flag on their corresponding ECS entities.
    *   **Layer Management:**
        *   Maintain the three base layer DOM containers (`#base-layer-below`, `#base-layer-main`, `#base-layer-over`).
        *   Manage the lifecycle and placement of the three target `<canvas>` elements within these containers.
        *   Query dirty ECS entities.
        *   For entities with `type: 'dom'`, ensure the corresponding React component is mounted in the correct base layer container and receives updated props (transform, style, etc.) derived from ECS components. Apply CSS `z-index` based on `RenderInfoComponent.zIndex`.
        *   For entities with `type: 'canvas'`, ensure the `CanvasRenderSystem` is aware of them.
    *   **Coordination:**
        *   Call `engine.setCameraTransform()` when the application camera changes.
        *   Call `engine.updateSystems()` in the main application loop (`requestAnimationFrame`) to run ECS systems (like `CanvasRenderSystem`).

### 4.3. Main Graph Library

*   Provides the application state (Blocks, Connections, Groups).
*   Manages user input and application logic.
*   Instantiates and uses the `ECSEngineAdaptor`.
*   Provides the main `requestAnimationFrame` loop that drives the `Adaptor` and thus the `Engine`.

## 5. Data Flows

*   **State Update Flow:** User Input/Camera Change -> App Logic/CameraService -> App State/Camera Update -> Adaptor Detects Change -> Adaptor runs LOD Logic -> Adaptor updates ECS Components (`RenderInfo`, `Transform`, `Style`, `Dirty`) -> Adaptor Dependency Logic sets more `Dirty` flags.
*   **Render Flow:** `requestAnimationFrame` -> `Adaptor.update()` -> Adaptor/LayerManager queries dirty entities -> Adaptor updates/mounts React components in correct base layers with CSS z-index -> Adaptor calls `EngineAPI.updateSystems()` -> `CanvasRenderSystem` queries dirty canvas entities -> `CanvasRenderSystem` draws to correct target base layer canvas -> Browser composites DOM layers.

## 6. API: Generic ECS Engine (`EngineAPI`)

*(Detailed method signatures as listed in Section 4.1)*

## 7. Open Questions / Risks

*   Performance implications of `becsy` (or chosen library).
*   Complexity of the `ECSEngineAdaptor`/`LayerManager`, especially dependency tracking and DOM layer reconciliation.
*   Efficiency of mapping App State IDs to ECS Entity IDs.
*   Overhead of data translation between App State and ECS Components.
*   Performance impact of frequent LOD switching (DOM mounting/unmounting).
*   Handling advanced rendering features (gradients, images, etc.) in `CanvasRenderSystem`.
*   Memory management in `becsy` and for `OffscreenCanvas` pool.
*   Synchronization precision between Canvas and DOM elements (transforms, z-index).
*   Integration with existing event handling (hit testing across layers/types).