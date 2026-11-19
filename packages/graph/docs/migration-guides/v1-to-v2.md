# Migrating from Gravity Graph 1.x to 2.x

This guide collects changes that applications need when moving to v2. It grows
alongside the v2 implementation; entries below describe implemented changes.
The temporary branch and release process is documented separately in
[v1 to v2 transition](../v1-v2-transition.md).

## Migration checklist

- Move React, Minimap, DevTools and ELK (`useElk`) imports to their dedicated packages and install their peers.
- Replace `ConnectionLayer` / `PortConnectionLayer` and the `canCreateNewConnections` setting with `ConnectionEditingLayer` from `@gravity-ui/graph-connection-editing`, and rename `port-connection-*` event listeners.
- Import the layered layout from `@gravity-ui/graph-layered` and `useLayeredLayout` from `@gravity-ui/graph-layered/react`.
- Import Playwright page objects from `@gravity-ui/graph-playwright` instead of `@gravity-ui/graph/playwright`.
- Import `CSSVariablesLayer` and its mapping helpers from `@gravity-ui/graph-css-variables`.
- Import the stylesheets for each package you use, with core styles before addon styles.
- Add `import "@gravity-ui/graph-minimap/styles.css"` when using Minimap: its default border and background now require this explicit import.
- Replace `canChangeBlockGeometry` / `ECanChangeBlockGeometry` with `canDrag` / `ECanDrag`.
- Treat configuration input types as patches and use the complete configuration types for stored state.
- Replace resets through `undefined` with `resetSettings(keys)` or `resetSettings()`.
- Use `TDevToolsLayerInput` for devtools input and resolved `TDevToolsLayerProps` for instance props; replace devtools resets through `undefined` with `resetProps(keys?)`.
- Supply complete arrays/tuples when updating constants.
- Use plain `TPoint` / `TRect` objects instead of geometry classes and their conversion methods.
- Use TypeScript 6.0: v2 declarations are built and checked with it.
- Create graph `layers` entries with `layerConfig(Layer, props)` instead of `[Layer, props]` tuples.
- Use `graph.removeLayer(layer)` to destroy a layer; `graph.detachLayer(layer)` only detaches it, and `graph.attachLayer(layer)` returns it to the graph.
- Remove calls to `graph.scheduler.start()` / `stop()`: the frame loop runs while work is registered, and `graph.start()` / `graph.stop()` affect only that graph.
- Drive roots you mount yourself with `Component.update(root)`; the graph updates only its own layers.
- Replace `NewBlockLayer` with `DuplicateBlockLayer` from `@gravity-ui/graph-duplicate-block`, rename its events and remove the `canDuplicateBlocks` setting.
- Drop `position: relative` workarounds on vanilla graph roots if you added them only for the graph: `attach()` now makes a static root the containing block of its layers.
- Import `MultipointConnection` from `@gravity-ui/graph`; `@gravity-ui/graph-react` no longer re-exports it or installs `elkjs`.
- Canvas components are culled by the viewport: check custom components against [Viewport culling and the component lifecycle](#viewport-culling-and-the-component-lifecycle) — veto painting with `isRenderAllowed()`, request updates for external changes, report bounds before painting, react to leaving the viewport with `viewportChanged()`, and set `culling` on screen-space layers.
- Stop reading and writing `selected` on `TBlock`, `TConnection` and their `$state`: read `$selected`, `selectedTag` or the selection API, and style states with tags and rules (see [Tags and styles](../system/tags-and-styles.md)). `asTBlock()`, `asTBlockShallow()`, `asTConnection()` and `toJSON()` no longer include `selected`, so saved data and snapshots lose it; a `selected` left in untyped data selects nothing (it stays in the data as an unknown field). (`TAnchor` never had `selected`; anchor selection stays in `graph.api.setAnchorSelection()` and `AnchorState.$selected`.)
- Anchor selection and anchor tags use block-qualified ids, `anchorEntityId(blockId, anchorId)`: selecting or hovering anchor `"out"` of one block no longer marks every block's `"out"`. Code that passes bare anchor ids to `graph.selectionService.select("anchor", …)` or `anchorSelectionBucket`, reads them from `$selection.get("anchor")` or `selectedTag`/`hoveredTag` members, writes anchor tags or calls `explain("anchor", …)`, or reads `Anchor.getEntityId()`, switches to `anchorEntityId()` / `parseAnchorEntityId()` (see [Anchor entity IDs](../components/anchors.md#anchor-entity-ids)). `anchorSelectionBucket` is typed `SingleSelectionBucket<string, AnchorState>`. `graph.api.setAnchorSelection(blockId, anchorId, selected)`, `AnchorState.$selected`, `BlockState.$selectedAnchors` and the `block-anchor-selection-change` payload are unchanged (the payload now names the right block when anchor ids repeat).
- In Jest, do not deep-compare live components with `toMatchObject` or another deep subset matcher: the scene's signal graph is reachable from every component, and the traversal can take minutes. Compare components by identity (`toBe`) or compare their ids.
- `BlockConnection` subclasses: per-frame hooks no longer run (see [Retained components](#retained-components-connections-outside-the-frame-walk)). `static detached` of v2 pre-releases is now `static override readonly mode`, `"retained"` or `"immediate"`.
- Custom canvas blocks: `Block` draws through `graph.scene` now and its render members are gone. Port the look to level methods (`schematic`, `detailed`) and states to tags and rules, or extend `LegacyCanvasBlock` for one release (see [Blocks in the scene](#blocks-in-the-scene)).
- Block order and hit-testing follow the scene: blocks are in bucket 200 (201 while selected or dragged), so a layer component hit above blocks needs a `zIndex` of at least 201, and anchors are hit in their block's order.
- Anchors are not drawn or hit at the minimalistic level and are created lazily: guard `AnchorState.getViewComponent()`, read anchor positions from their ports, and expect the `Block` as the owner of an anchor port until its component exists (see [Anchors](#anchors)).
- Replace `renderAnchor` overrides by `getAnchorClass`; move evented areas to child components; read
  `isRenderDelegated()` instead of `hidden` (see [Blocks in the scene](#blocks-in-the-scene)).
- Check block listeners of `mouseenter` and `mouseleave`: they now hear their anchors' and children's hover events
  too. Tell them apart with `getEventTarget(event)` or `detail.relatedTarget` (see
  [Events and hover](#events-and-hover)).
- Take screenshots with `graph.scene.toImage()` to include built-in connections, blocks and anchors.
- Use `graph.setEntities` for complete snapshots and `graph.updateEntities` for incremental updates. A full snapshot replaces fields even when an ID is reused. See [Public graph API](../system/public_api.md).
- Scene text sizes are numbers: replace a text `size: { px, minWorld, maxWorld }` with `size: px, cameraAware: {
  minWorld, maxWorld }` (see [Text, primitives and ports](#text-primitives-and-ports)). The `{ world, minPx, maxPx }`
  text form and `TSceneTextSize` are gone; `TSceneSize` keeps both forms for stroke and border widths.
- `BlockConnection` subclasses: move shared shapes to `static geometry` and Canvas-specific paths to a `SceneLine` subclass, styles and batch groups to the line class (`static line`), and expect connection hits within half the stroke width plus `THRESHOLD_LINE_HIT` (see [Connection lines and geometry](#connection-lines-and-geometry)).

## React package boundary

React components and hooks now live in `packages/graph-react` and are exported by `@gravity-ui/graph-react`.
The old `@gravity-ui/graph/react` subpath is removed. Core does not depend on React, React DOM, their types, or ELK.
The React package has a workspace peer dependency on core, plus required React 18 and React DOM 18 peers.

Replace React imports and load the two independently owned stylesheets:

```ts
import { Graph } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
```

The layered layout and its `useLayeredLayout` hook moved to `@gravity-ui/graph-layered` (see below).
Storybook and E2E consume the same public package entrypoints. `pnpm run build` builds core before React, and each
package's contract (`packages/<name>/contract`, run by `scripts/package-contract`) builds and installs its tarball,
verifies native imports and strict declarations, and checks that the React adapter uses the application's core classes.

## Minimap package boundary

`MiniMapLayer`, `MiniMapLayerProps`, `MiniMapLayerContext`, and `TMiniMapLocation` now belong to
`@gravity-ui/graph-minimap`. Replace imports of these symbols from `@gravity-ui/graph` with the new package:

```ts
import { Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-minimap/styles.css";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
graph.addLayer(MiniMapLayer, { location: "bottomRight" });
graph.start();
```

Minimap requires core as a peer dependency and does not require React. It uses the public core `Layer` and shares the
consumer's graph, camera, and block components. Navigation and geometry updates are unchanged;
import its stylesheet for default border and background styles. Core no longer includes or re-exports the minimap implementation.

## DevTools package boundary

`DevToolsLayer`, `TDevToolsLayerProps`, and `DEFAULT_DEVTOOLS_LAYER_PROPS` now belong to
`@gravity-ui/graph-devtools`. Replace their imports from core and add the DevTools stylesheet:

```ts
import { Graph } from "@gravity-ui/graph";
import { DevToolsLayer } from "@gravity-ui/graph-devtools";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-devtools/styles.css";

const graph = new Graph({ blocks: [] });
graph.addLayer(DevToolsLayer, { showRuler: true, showCrosshair: true });
```

DevTools requires core as a peer dependency and does not require React. Its ruler backgrounds and CSS variables
are now owned by the separate stylesheet; core styles only supply the base layer rules. The layer retains the same
props, camera behavior, and lifecycle, and can still be used with `useLayer` or `GraphLayer` from `@gravity-ui/graph-react`.
Core no longer contains DevTools code or declarations. The shared text measurement helper is available as
`measureText(text, font, approximate?)` from `@gravity-ui/graph`; the ruler tick calculation belongs to DevTools.

## Duplicate block package boundary

`NewBlockLayer` and `NewBlockLayerProps` now belong to `@gravity-ui/graph-duplicate-block` as `DuplicateBlockLayer`
and `TDuplicateBlockLayerProps`. Replace their imports from core:

```ts
import { Graph } from "@gravity-ui/graph";
import { DuplicateBlockLayer } from "@gravity-ui/graph-duplicate-block";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
const duplicateLayer = graph.addLayer(DuplicateBlockLayer, { ghostBackground: "rgba(0, 0, 255, 0.3)" });
duplicateLayer.disable();
```

The package requires core as a peer dependency, has no stylesheet and does not require React. The props
(`ghostBackground`, `isDuplicateAllowed`) and the `enable()`, `disable()` and `isEnabled()` methods are unchanged.

The events are renamed; their payloads and `preventDefault()` behavior are unchanged. They are typed only where
the package is imported. The payload types are exported as `TBlocksDuplicateStartDetail` and `TBlocksDuplicateDetail`.

| v1 | v2 |
|---|---|
| `block-add-start-from-shadow` | `blocks-duplicate-start` |
| `block-added-from-shadow` | `blocks-duplicate` |

The default action of `blocks-duplicate` changed in three ways:

- A copy keeps the `is` of its source block. In v1 every copy got `is: "block"` and lost its custom block component.
- A copied connection keeps all its fields except selection and gets a new unique `id`; its route `points` and
  positioned `labels` are shifted with the blocks. In v1 only anchors, `styles`, `dashed` and `label` were copied, and
  copies had no `id`, so a copy of an anchor-to-anchor connection could replace the original or an earlier copy.
- Port-based connections (`sourcePortId` / `targetPortId`) are copied when both ports are the block point or an anchor
  of a duplicated block; v1 skipped them. Connections whose end uses a custom port are not copied. v1 copied them when
  they also had block IDs and re-attached the copy to the block.

Unlike `NewBlockLayer`, the layer also works when blocks are not draggable (`canDrag: ECanDrag.NONE`, the default): the
camera no longer pans with the cursor during the gesture ([#405](https://github.com/gravity-ui/graph/issues/405)).

The deprecated `canDuplicateBlocks` setting is removed; it had no effect. Add the layer to enable duplication, and
call `disable()` or detach the layer to turn it off.

## Connection editing package boundary

`ConnectionLayer` and `PortConnectionLayer` are merged into `ConnectionEditingLayer` from
`@gravity-ui/graph-connection-editing`. The package has a peer dependency on core and depends on `rbush`; it does not
require React. Core no longer exports either layer, `IPortConnectionMeta` or `TPortSnapCondition`, and no longer declares
the connection creation events: they are typed once the package is imported.

```ts
import { Graph } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";

const graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
const layer = graph.addLayer(ConnectionEditingLayer, { searchRadius: 20 });
layer.disable(); // previously settings.canCreateNewConnections = false
```

**Setting.** `canCreateNewConnections` is removed from the graph settings. Mount the layer to allow connection
creation, and use the `enabled` prop, `layer.setProps({ enabled })`, `enable()` / `disable()` or
`useLayer(graph, ConnectionEditingLayer, { enabled })` to toggle it. `enable()` / `disable()` are no longer reset by
unrelated settings updates. Remove the key from settings objects: TypeScript reports it as an unknown property.

**Anchor drag.** `Anchor.isDraggable()` no longer reads a setting and always delegates the drag to the block.
While `ConnectionEditingLayer` is enabled, it prevents the default action of the `mousedown` graph event on anchors,
so dragging an anchor never moves its block (`captureAnchors: false` restores the block drag). Without the layer,
or with the layer disabled, dragging an anchor drags its block. Previously `canCreateNewConnections: true` made
anchors undraggable even when no connection layer was mounted.

**Sources and targets.** Both previous gestures work in the merged layer:

- a port with `meta[ConnectionEditingLayer.PortMetaKey].snappable` (former `PortConnectionLayer`). The key is still
  `Symbol.for("PortConnectionLayer.PortMeta")`, so existing port meta keeps working; replace
  `PortConnectionLayer.PortMetaKey` with `ConnectionEditingLayer.PortMetaKey`;
- an anchor with `useBlocksAnchors` on, connecting to an anchor of another block, and Shift + drag between blocks
  (former `ConnectionLayer`). Ports with connection meta take priority over these gestures.

**Props.** `ConnectionLayer`'s `isConnectionAllowed(sourceState)` becomes
`canStart({ sourcePort, sourceComponent, event })`; narrow `sourceComponent` with `instanceof Anchor` /
`instanceof CanvasBlock` and read its `connectedState` to reach the `AnchorState` / `BlockState`. The new `isConnectionAllowed({ sourcePort, targetPort })` rejects targets.
`createIcon`, `point`, `drawLine` and `searchRadius` are unchanged. `lineWidth` and `lineDash`, previously declared
by `PortConnectionLayer` but ignored, now style the default preview line.

**Events.** There is one event set. Rename the port events and read the extended payloads:

| v1 | v2 |
|---|---|
| `connection-create-start`, `port-connection-create-start` | `connection-create-start` |
| `connection-create-hover`, `port-connection-create-hover` | `connection-create-hover` |
| `connection-created`, `port-connection-created` | `connection-created` |
| `connection-create-drop`, `port-connection-create-drop` | `connection-create-drop` |
| `port-connection-cancel` | `connection-create-cancel` |

Every payload includes `sourcePort` (and `targetPort` when there is a target). Block IDs are
`TBlockId | undefined` in all events, since a custom component port has no block: check them before calling
block APIs. A created connection uses one `TConnection` addressing mode: block (and anchor) IDs when both ends are
a block's default point port or an anchor port, otherwise `sourcePortId` / `targetPortId` for both ends, and
`connection-created` reports the same mode. Detail types are exported as `TConnectionCreate*Detail` / `TConnectionCreatedDetail`.

**Behaviour changes for former `ConnectionLayer` users:**

- Anchor connections are normalized to OUT → IN: dragging from an IN anchor to an OUT anchor emits
  `connection-created` with the OUT anchor as the source.
- `connection-create-hover` also fires when the endpoint leaves a target (`targetPort` is `undefined`).
- When the source disappears mid-drag, the layer emits `connection-create-cancel` instead of
  `connection-create-drop`. Escape and detaching the layer mid-drag also cancel. Listen to both events for cleanup.
- The default preview line is 3 screen pixels wide (was 2) and honours `style.width` from `drawLine`.
- The line of a Shift + drag starts at the mousedown point rather than at the point where the drag threshold was
  exceeded.
- A drop on empty space or on an invalid target clears the source highlight.
- The layer prevents the `mousedown` graph event with `preventDefault()`, which also calls `preventDefault()` on
  the native event.

**Behaviour changes for former `PortConnectionLayer` users:**

- Anchors without connection meta (with `useBlocksAnchors` on) and Shift + drag from a block now also start
  connections. To keep port-only creation, pass
  `canStart` that accepts only ports whose `meta[ConnectionEditingLayer.PortMetaKey]?.snappable` is `true`
  (see the [Connection Editing guide](../plugins/connection-editing.md)).
- Anchors are highlighted during the drag (previously the anchor highlight was skipped).
- A custom port on a block is saved by its port ID; previously it was saved as the block's default point. A
  connection between an anchor or block point and a custom port is saved with port IDs on both ends instead of
  mixing block and port fields.
- Previously `canCreateNewConnections: true` made every anchor undraggable. Now only an enabled layer captures
  anchor presses (`captureAnchors`).

## ELK package boundary

`useElk` moved from `@gravity-ui/graph-react` to `@gravity-ui/graph-elk/react`. The ELK result converter is public as
`elkConverter` from `@gravity-ui/graph-elk`, together with its `ConverterResult` type. `@gravity-ui/graph-react` no longer
depends on `elkjs`, and its deprecated `MultipointConnection` alias is removed; import the class from `@gravity-ui/graph`.

```ts
import ELK from "elkjs";
import { MultipointConnection } from "@gravity-ui/graph";
import { useElk } from "@gravity-ui/graph-elk/react";
import { elkConverter } from "@gravity-ui/graph-elk"; // without React
```

Install `@gravity-ui/graph-elk` and `elkjs`. Core and `elkjs` are required peers; React is an optional peer needed only
by the `/react` subpath. The application still creates the `ELK` instance (bundled or worker build), and `useElk`
keeps its arguments and `{ result, isLoading }` result. `ConverterResult["blocks"]` is now keyed by `TBlockId`.

`useElk` now restarts the layout only when the `ELK` instance, the `ElkNode`, `layoutOptions`, `logging` or
`measureExecutionTime` change. A new `onError` function no longer starts another layout, so inline `{ onError }` options
no longer re-run the layout on every render; the latest `onError` is called on failure. Only these known options are
passed to `elk.layout()`.

ELK conversion returns empty records when `edges` or `children` are missing. Edges without a first section (including an empty `sections` array) and children without both coordinates are omitted. Positioned children and the first routed section retain their existing conversion. `useElk` permits an absent `onError` callback and sets loading for each new layout request. A failed layout clears the previous result and reports an `Error`, including when ELK rejects with another value.

## Layered layout package boundary

`layoutGraph`, `layeredConverter`, `computeLevels`, `DEFAULT_NODE_WIDTH`, `DEFAULT_NODE_HEIGHT` and the types
`LayeredLayoutInput`, `LayeredLayoutOptions`, `LayoutGraphParams`, `Node`, `Edge`, `ConverterResult`,
`LayeredConverterParams` and `LayeredLayoutResult` now belong to `@gravity-ui/graph-layered`, which also adds
`LayeredLayoutConnection`.
`useLayeredLayout` and `UseLayeredLayoutParams` moved from `@gravity-ui/graph-react` to its `/react` subpath:

```ts
import { computeLevels, layeredConverter, layoutGraph } from "@gravity-ui/graph-layered";
import { useLayeredLayout } from "@gravity-ui/graph-layered/react";
```

Block ids in `LayeredLayoutInput`, `ConverterResult.blocks` and `computeLevels` are now typed as `TBlockId` instead of
`TConnectionId` (both are `string | number`). `layeredConverter` takes the layout input `connections` instead of a
prebuilt `connectionIdBySourceTarget` map and matches edges to connection ids itself:

```ts
// v1
layeredConverter({ layoutResult, connectionIdBySourceTarget: new Map([["a/b", ["a-b"]]]), blockSizes });
// v2
layeredConverter({ layoutResult, connections: [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }], blockSizes });
```

Connections may now omit block ids, so graph connections (`TConnection[]`) can be passed directly. Only block endpoints
are laid out: a port-only connection is skipped and gets no entry in `ConverterResult.edges`, and anchors are ignored.
`useLayeredLayout` no longer restarts the layout when it receives new arrays or options with the same layout-relevant
values (block ids, sizes and levels, connection ids and endpoints, option values), or a new `onError`.
The package requires core as a peer dependency for its types; React is an optional peer, needed only for `/react`.
Core and `@gravity-ui/graph-react` no longer include or re-export the layered layout.

## Playwright package boundary

The Playwright page objects (`GraphPO`, `GraphBlockPO`, `GraphConnectionPO`, `GraphCameraPO` and their option types)
moved from the `@gravity-ui/graph/playwright` subpath to `@gravity-ui/graph-playwright`. Install it as a dev
dependency next to `@playwright/test` and replace the import:

```diff
- import { GraphPO } from "@gravity-ui/graph/playwright";
+ import { GraphPO } from "@gravity-ui/graph-playwright";
```

The package ships ESM and CommonJS builds; class names, methods and behavior are unchanged. Core no longer has a
`./playwright` export, `typesVersions` or an optional `@playwright/test` peer. An attached graph is stored on its root
element only under `Symbol.for(GRAPH_INSTANCE_SYMBOL_KEY)` (`"@gravity-ui/graph/instance"`, exported from core); the
undocumented `Symbol.for("graph")` key is no longer written.

## CSS variables package boundary

`CSSVariablesLayer`, its props, state and change types, `CSS_VARIABLE_MAPPINGS`, `SUPPORTED_CSS_VARIABLES`,
`DEFAULT_CSS_VARIABLES_LAYER_PROPS` and the `map*` / `filterSupportedCSSChanges` helpers now belong to
`@gravity-ui/graph-css-variables`. Install it and replace their imports from core:

```ts
import { Graph } from "@gravity-ui/graph";
import { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
graph.addLayer(CSSVariablesLayer, { containerClass: "graph-theme" });
```

The package requires core as a peer dependency, does not require React and ships no stylesheet. Props and supported
variables are unchanged. Core no longer contains the layer and no longer depends on `style-observer`.

Changing `containerClass` after the layer is created, through `setProps` or `useLayer`, now works: the layer
observes the new class, applies its current variables and keeps following later changes. In v1 the container kept
the previous class and stopped reporting changes.

A supported variable that has no value when the layer starts and is defined later, for example by a theme class
added afterwards, is now applied and reported to `onChange`. In v1 such a first assignment was usually missed;
only later changes of the variable reached the graph. Unsetting a variable keeps the value applied last; v1 could
instead apply an empty value (an empty color or `0`) when another variable changed at the same time.

## Styles and TypeScript

v2 declarations are built and checked with TypeScript 6.0 (`strict: true`, `skipLibCheck: false`).
Other TypeScript versions are not tested.

Each package owns its stylesheet. Keep the explicit stylesheet imports shown
above, including `@gravity-ui/graph-minimap/styles.css` for the minimap.

For TypeScript applications that enable `noUncheckedSideEffectImports`, provide
your bundler's CSS declaration or include an ambient declaration in your
TypeScript project (for example, `src/assets.d.ts`):

```ts
declare module "*.css";
```

This declaration describes CSS imports to TypeScript. Your bundler validates
that the imported files exist. Published declaration locations and NodeNext/CJS
consumers remain supported.

## Graph root positioning

Core layers are absolutely positioned. In v1 only the React `GraphCanvas` wrapper positioned its
root, so a vanilla graph attached to a `static` root laid its layers out against an outer positioned
ancestor or the viewport, and pointer coordinates were offset from the root.

`graph.attach(root)` (and `new Graph(config, root)`) now adds the `graph-root` class
(`GRAPH_ROOT_CLASS_NAME`) to the root. A full detach (`graph.detach()`, `graph.unmount()` or moving the
graph to another root) removes it. `@gravity-ui/graph/styles.css` declares:

```css
@layer gravity-graph {
  :where(.graph-root) {
    position: relative;
  }
}
```

The rule sits in a cascade layer and has zero specificity, so a position set by the application
(`absolute`, `fixed`, `sticky` or an explicit `relative`) in unlayered CSS, inline styles or a cascade
layer declared after `gravity-graph` still applies; only a root that would otherwise be `static`
changes. If your stylesheets declare their layer order before the graph styles load, list
`gravity-graph` first (for example `@layer gravity-graph, base, components, utilities;`).

## Structural geometry

The `Point` / `Rect` classes and `IPoint` / `IRect` interfaces are removed.
Geometry APIs use plain objects; `TPoint`, `TRect`, and `CameraPoint` are exported
from `@gravity-ui/graph`. Optional `Point(x, y)` and `Rect(x, y, width, height)`
factories create plain objects with these shapes. Call them without `new`.

```ts
import { Graph, Point, Rect, type TPoint, type TRect } from "@gravity-ui/graph";

const graph = new Graph({});
const point: TPoint = { x: 100, y: 200 };
const rect: TRect = { x: 0, y: 0, width: 300, height: 400 };

graph.getElementOverPoint(point);
graph.getElementsOverPoint(point);
graph.zoomTo(rect);

// Equivalent factory syntax; the API accepts either form.
graph.getElementOverPoint(Point(100, 200));
graph.zoomTo(Rect(0, 0, 300, 400));
```

Point lookups accept a world `TPoint` or a `CameraPoint` with two required fields:
`world: TPoint` and `canvas: TPoint`. Canvas coordinates use CSS pixels before
device pixel ratio. `graph.cameraService.createCameraPoint(point)` captures both
spaces from a world point; pass `"canvas"` as the second argument for canvas input.
Conversion belongs to the camera. Direct `graph.hitTest.testPoint` calls require a
prepared `CameraPoint` and a device pixel ratio.

`getPointInCameraSpace(event)` now returns a `CameraPoint`. Read `.world.x/y`
instead of `.x/y`, and `.canvas` instead of `.origPoint`. Both coordinate spaces
retain fractional precision. Pass the result directly to a point lookup, or use
its `.world` point. Camera points are snapshots: recreate them after camera changes.
The legacy `cameraService.applyToPoint` helper continues to produce integer
coordinates for drag operations.

The `point` payload of `connection-create-drop` (now emitted by
`@gravity-ui/graph-connection-editing`) is a plain `TPoint` value. Replace `point.toArray()` with `[point.x, point.y]` and
`point.toObject()` with `{ x: point.x, y: point.y }`. For rectangles, use
`[rect.x, rect.y, rect.width, rect.height]` or an object with those four fields.
Remove imports of the internal geometry classes and `instanceof` checks for them.

## Scheduler lifecycle

The shared frame loop has no `start()` / `stop()`: it runs exactly while at
least one task is registered, and removing the last task cancels it, also from
inside an update. Calling `update()` before `setRoot()` is a no-op; schedule an
update after setting the root if needed. See
[Graph-driven frame loop](#graph-driven-frame-loop).

## Configuration input and resolved state

`TGraphColorsPatch`, `TGraphConstantsPatch` and `TGraphSettingsPatch` now describe partial
input/patches. You can supply just the fields you want to override, including
partial constants in the Graph constructor and `api.updateGraphConstants`.

Stored colors/constants and their change-event payloads are complete:
`TGraphColors` and `TGraphConstants`. Settings snapshots use
`TGraphSettingsConfig`; every field is present. Custom background/connection
constructors have a value of `undefined` when no override is configured. Defaults are normalized
before they enter signals and rendering contexts.

```ts
import { Graph, type TGraphColorsPatch, type TGraphColors } from "@gravity-ui/graph";

const input: TGraphColorsPatch = { block: { border: "#123456" } };
const graph = new Graph({}, undefined, input, { camera: { SPEED: 2 } });
const current: TGraphColors = graph.api.getGraphColors();
const border: string = current.block.border;
```

Use the input types for options you pass to Graph, and the complete configuration types when
you annotate snapshots received from getters, signals or events. The helpers
`mapGraphColorsToCSSVariables` and `mapGraphConstantsToCSSVariables` (from `@gravity-ui/graph-css-variables`) also accept
resolved state, for example `mapGraphColorsToCSSVariables(graph.graphColors)`. Replace
`RecursivePartial<TGraphConstants>` with `TGraphConstantsPatch`; partial arrays are
no longer valid constant patches.

### Patches and explicit reset

Omitted fields and `undefined` leave current values unchanged at every patch
boundary: constructor input uses defaults, and later patches preserve existing
values. This also applies to callbacks and optional component overrides.
`false`, `0` and empty strings remain valid updates. Nested objects merge by
field, including block component registrations and `connection.LABEL`.

Before (implicit reset):

```ts
graph.updateSettings({ getCameraBlockScaleLevel: undefined });
```

After:

```ts
graph.resetSettings(["getCameraBlockScaleLevel", "background"]); // Restore both initial values.
graph.resetSettings(); // Restore the settings established by new Graph(...).
```

Reset restores the complete settings established during `new Graph(...)`: library
defaults combined with the constructor's settings. Later `updateSettings`,
`api.setSetting` and `setupGraph` calls do not change this initial snapshot.
Constructor callbacks and component registrations are restored too; overrides
added later are removed when their setting is reset. For example:

```ts
const graph = new Graph({ settings: { dragThreshold: 10 } });
graph.updateSettings({ dragThreshold: 20 });
graph.resetSettings(["dragThreshold"]); // 10, rather than the library default of 5.
```

Resetting selected settings preserves every other setting and publishes one update.
Pass an empty array to leave settings unchanged. `resetSettings()` affects
settings only; it does not reset colors, constants or graph entities. The
`dragThreshold` default is 5 pixels, `canDrag` defaults to `ECanDrag.NONE`, and
`emulateMouseEventsOnCameraChange` defaults to false.

Arrays and tuples replace the previous value completely. For example,
`graph.setConstants({ selectionLayer: { SELECTABLE_ENTITY_TYPES: [] } })`
disables rectangle selection of entities; it no longer retains the default
Block entry. Supply all three values for `block.SCALES`, and all four values for
`connection.LABEL.INNER_PADDINGS`.

Selection strategies are explicit resolved constants: `STRATEGY` and
`SHIFT_STRATEGY` both default to `ESelectionStrategy.REPLACE`. Configure
`SHIFT_STRATEGY` explicitly when Shift selection should append or toggle. An
omitted Shift strategy previously inherited `STRATEGY`; it now has its own
default. Set both fields when ordinary and Shift selection should use the same
custom strategy.

### One drag setting

`canChangeBlockGeometry` and `ECanChangeBlockGeometry` are removed. There is no
legacy priority rule. Replace them with `canDrag` and `ECanDrag`:

```ts
// v1
// settings: { canChangeBlockGeometry: ECanChangeBlockGeometry.ONLY_SELECTED }

// v2
import { ECanDrag } from "@gravity-ui/graph";
graph.updateSettings({ canDrag: ECanDrag.ONLY_SELECTED });
```

`api.setSetting` now checks the value type against the key and publishes a new
signal value. Update subscriptions react to single-setting changes as they do
to `updateSettings`.

React `useGraph().setViewConfiguration(viewConfig)` applies the argument you
pass, allowing configuration updates independently of the initial hook props.

## Nullable entity lookups

Block, connection, anchor and rendered-view lookups return `undefined` for an
unknown or removed ID. This absence is now preserved in published declarations,
including `useSyncBlockState`, `useBlockState` and `useBlockViewState`.
Guard the result before using it:

```ts
const block = graph.api.getBlockById(id);
if (block) console.log(block.name);

const state = useBlockState(graph, id);
if (!state) return null;
```

`useSyncBlockState` reads the current state without subscribing. Use
`useBlockState` to rerender when a block is added or removed. Anchor hooks also
follow anchor removal and recreation. Connection updates for missing IDs are a
no-op, matching block updates. List lookup methods filter out missing IDs.

Legacy internal selector modules are removed. Use the existing
`rootStore.blocksList.getBlockState(id)` and
`rootStore.connectionsList.getConnectionState(id)` methods directly.

Core store methods and React lookup hooks do not accept a type argument that
promises custom metadata from an ID. Custom canvas blocks retain `CanvasBlock<T, Props>`
for declaring their state/Meta and component props. The application is responsible
for matching that declaration to the data supplied for its registered block type;
the library does not validate the shape of custom Meta at runtime.

```ts
import { CanvasBlock, type TBlock } from "@gravity-ui/graph";

type MyBlock = TBlock<{ description: string }>;
class CustomBlock extends CanvasBlock<MyBlock> {
  getDescription() {
    return this.state.meta?.description;
  }
}
```

Canvas Block/Anchor/Connection construction requires an existing corresponding state and
throws a descriptive error when the required entity is absent.

## Layer resources and lifecycle

Base `Layer.getCanvas()` and `Layer.getHTML()` return `undefined` when that
resource was not configured. `LayerContext.ctx` and `graphCanvas` are also
`undefined` for layers without a canvas. `LayerContext.canvas` is the layer's own
canvas; `root` is set on attach and cleared on detach. `ownerDocument` comes from
the created elements or attached root and can be `undefined` for an empty layer
before attachment. Guard optional resources before use. Canvas resources
are created during construction, before attachment, and retained when detached
so that the same elements can be reattached. A configured canvas that cannot
provide a 2D context throws a descriptive error during construction.

```ts
const html = layer.getHTML();
if (html) html.classList.add("custom-layer");
```

Custom canvas layers may use the protected `requireCanvas()` and
`requireCanvasContext()` helpers when they require those resources. These helpers
throw if the layer has no canvas. The graph's own canvas accessor remains required.

A layer can be constructed before the graph has a root element. Register graph,
DOM and signal subscriptions in `afterInit()` using `onGraphEvent`, `onRootEvent`,
`onCanvasEvent`, `onHtmlEvent` and `onSignal`, and call `super.afterInit()`.
Detach cleans these subscriptions and pending camera movement; reattach installs
them again. Calling the cleanup returned by `onSignal` is also safe more than once.
Starting the layers service without a root throws `Root not specified` before
attaching any layer.

## Event callbacks and payloads

Graph event names determine listener and payload types. Remove extra callback or
payload type arguments from `on`, `off`, `emit`, `executеDefaultEventAction` and
`UnwrapGraphEvents`/`UnwrapGraphEventsDetail`; these APIs need only the event name
parameter. `Graph.on` also accepts an object with `handleEvent`.

```ts
const unsubscribe = graph.on("colors-changed", (event) => {
  console.log(event.detail.colors.block.background);
}, { capture: true });
unsubscribe();
```

Graph mouse events are `CustomEvent` wrappers. Read the native event through
`event.detail.sourceEvent` and narrow it with `instanceof MouseEvent` when needed.
Canvas component click/mousedown listeners receive native `MouseEvent` values.
Component hover listeners may receive either a native `MouseEvent` or a graph
`CustomEvent`; guard before reading native mouse coordinates. Evented-area
enter/leave callbacks receive native synthetic `MouseEvent` values.

Use the cleanup returned by `graph.on`. When using explicit `graph.off`, pass the
same capture value used for registration: `graph.off(name, listener, true)`.
`once` listeners run once even during recursive emissions; cancelled drag sessions
remove pending start/end/leave listeners immediately. A new mousedown finishes an
active drag before removing its listeners, allowing another drag to start.

`graph.layers` exposes the typed `update-size` event (`width`, `height`, `dpr`),
and `graph.hitTest` exposes `update` with the HitTest instance. Unknown names or
incompatible callback arguments are rejected.

In `@gravity-ui/graph-react`, `GraphEvent<CallbackName>` now describes the actual
event passed as the second callback argument. Use `GraphEventDetail<CallbackName>`
for the first argument. React event callbacks infer both arguments from the key.

## Component factories, descriptors and refs

`create` infers props and callback-ref instances from the concrete component
class. `Component.mount(CustomComponent, props)` returns `CustomComponent`.
Pass props when the constructor requires fields; omitting them is allowed only
when `{}` satisfies its props type or the constructor accepts no props argument.
Omitted arguments preserve custom constructor defaults. When a defaulted props
parameter precedes a required parent parameter, pass `create(undefined)` explicitly;
non-strict declarations cannot distinguish that default from a required argument. If a custom constructor
reads empty props before calling `super`, give that parameter a default value
(e.g. `constructor(props = {})`). Remove former props/context type arguments from
`create` and `mount`; their types now follow the supplied class.
Callback refs receive the concrete instance
and run when a child mounts. Keyed reuse does not call the callback again.

```ts
class Label extends Component<{ text: string }> {}
const child = Label.create(
  { text: "Hello" },
  {
    key: "label",
    ref: (label) => label.setProps({ text: "Updated" }),
  }
);
```

Use `ComponentDescriptor<typeof Label>` for a concrete descriptor and
`ChildDescriptor[]` for heterogeneous `updateChildren()` results. Build these
through `create`; manually constructed descriptor objects and spread copies are no
longer accepted. Descriptor fields and their exposed props are readonly; create a
new descriptor to change its class, props or ref.
String refs are typed as optional `CoreComponent` instances and are cleared when
the child is removed or replaced. Declare specific optional refs on your subclass
when you need its concrete type, or use a callback ref.

`GraphClassConstructor`, `Class` and `Interface` are named exports from `@gravity-ui/graph`.
Add explicit type imports wherever you previously relied on their ambient global
declarations. Replace the old global `Constructor<T>` with an explicit import of
`GraphClassConstructor<T>`. It describes class identity; use the concrete class's
`ConstructorParameters` to inspect its constructor arguments. Unused ambient
`PartialObject`, `IWithEvent` and `ICustomElement` declarations were removed.

React `GraphLayer` and `useLayer` retain the concrete layer's props and instance
ref. `useLayer` returns `null` before initialization; check it before accessing
instance methods. A custom layer with required public props must receive them, including in JSX:

```tsx
<GraphLayer layer={CustomLayer} props={{ label: "Custom" }} ref={customLayerRef} />
```

Group mixins retain required props and inherited methods from custom `BlockGroups`
subclasses. `getGroupById` returns `null` when no mounted group matches the id.
Canvas blocks and their custom/generic subclasses remain valid selection filters.


## Scheduling and text helpers

`debounce` and `throttle` preserve callback arguments and the call-site `this`
receiver. Both wrappers return `void`, including immediate throttle calls; they
discard callback results and do not copy arbitrary properties from the original
function. If you need its result, call that function directly. Wrappers preserve
unions of callback signatures, permitting only calls safe for every possible
branch. Callback overloads follow the last signature.
For generic callbacks whose parameter relationships depend on their type parameter,
pass a concrete callback adapter to keep useful inference.

```ts
const update = debounce((label: string) => saveLabel(label));
update("Latest"); // void
update.flush(); // invokes the pending callback now; also returns void
```

Debounce uses the latest arguments and receiver. `cancel()` discards a pending
invocation; `flush()` runs it immediately. Throttle runs the first call immediately
and drops calls during the cooldown. Its `cancel()` and `flush()` reset that
cooldown; they do not replay a suppressed call. Cancelling and rescheduling keeps
the full configured interval. A callback may schedule a debounced follow-up for a
later frame.

`schedule` accepts a callback that can be invoked without arguments or a receiver.
Bind required arguments and `this` before scheduling, for example
`schedule(() => updatePosition(x, y), options)`. Its returned function removes
the task immediately. `once: true`
also prevents another invocation during a nested Scheduler update. Scheduling
options use the same priority range as `Scheduler` (0–4 or the corresponding `ESchedulerPriority` member).

`getFontSize` accepts numeric font size and scale. `measureText` returns a numeric
width for both fresh and cached measurements. If the browser cannot create a 2D
Canvas context, text measurement throws a descriptive error; a later call retries
context creation.

The unused internal `FrameDebouncer` implementation was removed. Use the public
`debounce`, `throttle` and `schedule` functions instead of importing that internal
service.

## Safe entity operations and strict core types (#362)

The graph source, unit tests and declaration build now use permanent `strict: true`.
Lookup results and canvas views retain their availability in published declarations:
`ConnectionState.getViewComponent()` and `AnchorState.getViewComponent()` can return
`undefined`. `BlockState.getSelectedAnchor()` is also absent when no anchor is selected. Guard these results before use. `ConnectionState.id` and the ID
in its JSON snapshot are always present; `TConnection.id` remains optional input.
`BlockState<T>.asTBlock()` / `asTBlockShallow()` and `ConnectionState<T>.toJSON()` /
`asTConnection()` preserve custom data, including declared Meta. State updates accept
partial values of that data type. Metadata remains a consumer-defined contract.

The changing-entity behavior is:

- Block/connection/anchor lookups return `undefined` after deletion; batch lookups omit
  missing entries. Public `updateBlock`, `updateConnection`, `setAnchorSelection` and
  store `updatePosition` do nothing for missing IDs. `zoomToBlocks` returns `false`
  when none of the requested blocks exist. Empty rectangles keep camera position/scale finite, including before attachment.
  Selection sets retain requested IDs, including unresolved IDs; resolved entities/views omit missing data.
- IDs are immutable within a state. Updating a state does not rename its ID. Zero
  and empty-string IDs are accepted. Use remove/add to rename an entity. Adding an
  existing connection ID updates the existing state, as adding a block already does.
- Connections may precede their endpoint components. They keep unresolved lookup
  ports and do not render or participate in hit testing until endpoints resolve.
  An unspecified endpoint gets an isolated internal port; it cannot accidentally
  share geometry with another incomplete connection. Port-based connections without
  IDs receive generated IDs. Changing endpoints releases unused port observers;
  replacing/deleting connections cleans up their observers.
- Deleting a port invalidates its geometry immediately. Retained destroyed connection
  states cannot recreate observers. Retained block/connection/anchor state handles cannot
  move/select a replacement entity with the same ID. Removed components are skipped
  during drag, and deleted blocks are omitted from pending geometry events.
- Multipoint connections without points retain the straight/bezier endpoint fallback.
  Exactly one point produces empty paths/arrows; incomplete labels are skipped. Labels at `(0, 0)` are valid when their geometry is complete.
- `TPort<T>.meta` preserves shallow merge for plain object metadata, including symbol keys.
  Primitives, arrays and other non-plain values are replaced when supplied. Omitted meta
  is preserved; `meta: undefined` clears it. Consumer Meta retains its declared generic type.

`getElementsOverRect(rect, filter)` and `getElementsInViewport(filter)` now treat a supplied empty
filter as matching nothing, like `getElementsOverPoint`. Omit the filter to receive every component.

Connection creation events describe custom component ports, which may have no block or
anchor. Check the optional `blockId`, `sourceBlockId`, `targetBlockId` and anchor IDs
before invoking block/anchor APIs. `connection-create-drop.sourceAnchorId` is also
`string | undefined`, since block-to-block creation has no anchor. The default
port connection action preserves block/anchor endpoints and their deterministic connection
IDs. Custom component endpoints use actual port IDs; repeating a drag between the same
custom endpoints updates the existing connection.
Cancellation can happen before a source or target exists; its port fields preserve
that absence. The internal `GraphLayer` mouse-event target can be absent, as can the
public graph mouse-event target.

`ISelectionBucket` exposes the public selection operations rather than inheriting
protected callback implementation details. String and number buckets can coexist
in the selection service. Resolver entities may be arbitrary objects, but
`$selectedComponents` only includes actual `GraphComponent` instances, either directly
or from `getViewComponent()`. Return a real canvas component from that method.
`GraphComponent.isEntityAvailable()` indicates whether delayed interaction can still
use a component; built-in entity components also check store identity.

`isInteractive()` resolves omitted props to `true`; camera `resize` preserves omitted
width/height. Text layout and measurement use the same canvas font when no font is supplied. The internal
page object reports a detached graph error for bounds/cursor reads. Binding a canvas
Block, Anchor, Connection or Group to a missing entity throws a descriptive error;
create its data before constructing the view. A missing 2D canvas context for grid or
text creation likewise produces a descriptive error.

## Minimap location and lifecycle

`@gravity-ui/graph-minimap` now checks its source and declaration build with strict
TypeScript. Omitted `location` still places the minimap at `topLeft`; dimensions
still default to 200 × 200 and the camera border to 2px in
`rgba(255, 119, 0, 0.9)`.

Custom locations accept partial offsets, for example
`graph.addLayer(MiniMapLayer, { location: { right: "20px", bottom: "30px" } })`.
Omitted custom sides resolve to `unset`. Position and size
styles belong to each canvas, so multiple minimaps no longer override one another
and detach/reattach does not leave styles on the old root.
These position and size styles are now inline. Configure them through layer props;
CSS overrides that worked in v1 now require `!important`.

Import `@gravity-ui/graph-minimap/styles.css` alongside the core stylesheet for
its default background and border. Load core styles before minimap styles.
Override these visual defaults with ordinary
CSS (for example `.graph-minimap.my-minimap` with `classNames: ["my-minimap"]`);
Two-class selectors like this example override the default
`canvas.layer:where(.graph-minimap)` (specificity `(0,1,1)`) regardless of load order,
without `!important`. Single-class selectors such as `.my-minimap` or
`.graph-minimap` have lower specificity and do not override the defaults.
`context.root` remains optional before attachment and after detachment;
`context.canvas` and `context.ctx` are available after successful construction.

## React readiness and strict contracts

`GraphLayer` and `useLayer` keep the concrete layer constructor's public props and instance type. Required custom props must be supplied through `props`; use a specialized generic constructor (for example `MyLayer<MyMeta>`) when authoring generic layers. Callback refs receive the concrete instance or `null`.

`useLayer`, `GraphLayer` refs, `GraphPortal` refs and `GraphCanvas.reactLayerRef` are `null` before their layer attaches and after detachment/cleanup. A registered layer can exist internally before attachment. Core `Layer.$attached` is a public `ReadonlySignal<boolean>` that follows attachment, detachment and unmount independently of graph state. React subscribes to it, so `stop(false)` and direct layer detachment also clear layer refs without modifying layer methods. Call hooks unconditionally and guard their results before invoking instance methods. `GraphPortalLayer` is exported for typing portal refs. `GraphBlock` DOM refs become `null` whenever the block's DOM disappears, including entity removal.

`useSignal` accepts both mutable and readonly/computed signals. A definite signal returns its value type; a nullable or missing signal returns `T | undefined`. `useBlockViewState` observes asynchronous view readiness, and `useBlockAnchorPosition` accepts nullable DOM refs, initializes a DOM node mounted after anchor readiness, and clears previous CSS coordinates when the anchor or its position becomes absent. Missing blocks and anchors remain absent until available. `GraphCanvas` without `renderBlock` renders its canvas and child portals without a React block list.

`useBlockState`, `useSyncBlockState` and `useBlockViewState` retain the non-generic lookup contract from #371. They return the shared block/view types and preserve `undefined` for missing entities or views. A `TBlock<MyMeta>` remains typed application data, but passing it to a lookup hook uses its ID and does not establish the schema of the current stored entity. The core store erases metadata types; restoring them in lookup results would require a typed core contract. The library does not validate custom Meta at runtime.

The React package now checks source, unit tests and declaration emit with permanent `strict: true`.
## Devtools resolved props and explicit resets

`TDevToolsLayerProps` now describes the resolved instance props: every visual
color, font, visibility flag and dimension is required. Use
`TDevToolsLayerInput` for direct constructor input, or
`LayerPublicProps<typeof DevToolsLayer>` for `graph.addLayer` options. Both
accept partial visual options. Partial `canvas`/`html` configurations preserve
unspecified devtools resource defaults (the base Layer requires `zIndex`).

Omitted fields and `undefined` preserve current values in `setProps`, including
multiple updates queued before the next frame. Undefined constructor values use
library defaults. Replace resets through undefined with `resetProps(keys)` or
`resetProps()`. Resets restore the visual values established by the constructor,
including custom overrides; an empty key array changes nothing. Resource props
(`graph`, `camera`, `root`, `canvas`, `html`) are outside visual resets.

```ts
const devtools = graph.addLayer(DevToolsLayer, { rulerSize: 32 });
devtools.setProps({ rulerSize: 40, showCrosshair: false });
devtools.setProps({ rulerSize: undefined }); // Preserves 40.
devtools.resetProps(["rulerSize"]); // Restores 32, keeps showCrosshair false.
devtools.resetProps(); // Restores all constructor visual values.
const size: number = devtools.props.rulerSize;
```


`LayerPublicProps<typeof CustomLayer>` now derives its input from the first
constructor parameter, independently of `Layer<RuntimeProps>`. Custom layers can
therefore normalize partial constructor input while keeping their runtime props
complete. Generic metadata and discriminated constructor inputs are preserved.

Graph configuration entries are created with `layerConfig(CustomLayer, props)`, which
checks the props against that constructor. Raw `[CustomLayer, props]` tuples and the
generic `LayerConfig<T>` type are removed: a tuple in a heterogeneous array cannot be
checked, so valid custom props were rejected while missing required props were accepted.
`LayerConfig` is now an opaque entry type that only `layerConfig()` creates. Prop errors name the
layer's input type, for example `LayerPublicInput<MiniMapLayerProps>` (an internal alias; name
the input in code with `LayerPublicProps<typeof CustomLayer>`).

```ts
// Before
const graph = new Graph({ layers: [[MiniMapLayer, { location: "topLeft" }]] });
// After
const graph = new Graph({ layers: [layerConfig(MiniMapLayer, { location: "topLeft" })] });
```

Resource defaults are merged when constructing DevTools. Later `setProps` calls
and reused component descriptors apply shallow patches; supplied `canvas`/`html`
objects replace the previous configuration. DOM classes and z-index are created
once by base Layer and are not changed by such patches. Create a new layer to
change its DOM resource configuration. Resource input still requires `zIndex`.

## Layer removal and root unmount

`graph.detachLayer(layer)` stays reversible: it removes the layer from the graph
and the DOM and keeps the instance and its children alive. While detached, the
graph does not update it, and `graph.stop()` / `graph.unmount()` do not manage
it. Return it with the new `graph.attachLayer(layer)`: the graph updates it again
and attaches it to the graph root while started (moving it from any root it was
attached to by hand). Attaching it by hand with `layer.attachLayer(root)` puts
it in the DOM but does not return it to the graph, so it is not updated.
`graph.attachLayer` and `graph.detachLayer` ignore layers of other graphs and
layers removed with `graph.removeLayer`; do not pass them a layer destroyed with a
direct `Component.unmount(layer)`.

Use the new `graph.removeLayer(layer)` when a layer is no longer needed. It
forgets the layer and unmounts it together with its children; the instance
cannot be reused. It accepts layers created by the same graph (attached
or detached) and ignores repeated calls, layers already destroyed by
`graph.unmount()` and layers of other graphs. Replace
`graph.detachLayer(layer); Component.unmount(layer);` with
`graph.removeLayer(layer)`; do not combine `removeLayer` with a direct
`Component.unmount(layer)`. Built-in layers (`graphLayer`, `selectionLayer`,
`belowLayer`, `cursorLayer`) belong to the graph and must not be removed.

`graph.unmount()` destroys only the layers that are still attached to the graph.
A layer detached with `graph.detachLayer` is not destroyed by `graph.unmount()`:
pass it to `graph.removeLayer` when it is no longer needed, so that its own
cleanup runs.

`useLayer`, `GraphLayer`, `GraphPortal` and `GraphCanvas` now destroy their layer
on cleanup (unmount, graph change or constructor change) with `graph.removeLayer`.
Do not keep and reattach a layer instance obtained from them after cleanup;
render the hook or component again to get a new layer.

`Component.unmount(root)` on a root mounted with `Component.mount` (including
layers created by the graph) ends its tree: the unmounted subtree is never
iterated or rebuilt again, even by `Component.update(root)`. Unmounting a child
leaves the rest of the tree updating. An unmounted graph keeps no scheduler
registrations or document keyboard listeners, and nothing it scheduled stays
pending, so it becomes collectable right away.

## Graph-driven frame loop

In v1 every root (every layer) registered its own scheduler in the global frame
loop when it was constructed, and `graph.start()` / `graph.stop()` started and
stopped that shared loop. Stopping or unmounting one graph froze every other
graph on the page, and a graph that was created but never unmounted stayed
reachable forever.

In v2 the graph drives its layers:

- `graph.start()` registers one frame task that updates the graph's layers on
  each frame; `graph.stop()`, `graph.detach()` and `graph.unmount()` remove it.
  Other started graphs keep rendering.
- A graph renders only while it is started. An attached graph that is not
  started is not updated, even while other graphs run.
- `graph.stop()` and `graph.detach()` also cancel a start requested before the
  graph was attached: attaching it later no longer starts it automatically.
- Components and layers never deal with the scheduler: they call
  `performRender()`, and the graph updates them on the next frame. Components
  rendered by a layer through `Component.create(...)` are updated with it.
- The frame loop runs while any task is registered (the frame tasks of started
  graphs, `schedule`, `debounce`, `throttle`, or `graph.scheduler.addScheduler`).
  `graph.scheduler` no longer has `start()` or `stop()`.
- Removing a task is immediate: a task removed during a frame is not called
  later in that frame, and in v1 a task removed between frames was still called
  once more.
- A root you mount yourself with `Component.mount` is not driven by anything;
  call `Component.update(root)` from your own loop.
- `graph.unmount()` drops pending `runAfterGraphReady` / `zoomTo` waiters without
  calling them.
- Scheduled work (`schedule`, `debounce`, `throttle`) keeps the loop running by
  itself, even while no graph is started, until it is done or removed. A
  `schedule()` task without `once` runs on every frame until you remove it.
- Within a frame, a graph's layers are updated by one MEDIUM-priority task
  registered at `graph.start()`, so MEDIUM tasks registered earlier run before
  them.
- In tests with Jest fake timers, let registered tasks finish (or remove them)
  before switching timer implementations: a frame requested with one
  implementation is not delivered by the other.

## Viewport culling and the component lifecycle

Every layer culls the canvas components it renders. A frame first prepares the components that are new or
requested an update (data, children, geometry), then publishes which components are in the viewport, then
paints them in z-order. Compared with v1:

- A clean component outside the viewport receives no lifecycle calls at all: no `willIterate`, `didIterate`,
  `willNotRender` or `render`. In v1 every component of a layer was iterated whenever anything in it updated.
- A component that requested an update while outside the viewport is prepared and completes its frame without
  painting (`willNotRender`, `didIterate`). A clean visible component prepares right before its own paint, after
  visibility was published.
- A component outside the viewport is no longer painted once when it mounts: setup done in `render()` or
  `willRender()` happens when it first enters the viewport.
- Children are reconciled before the component's own `render()`, and children added from `render()` are painted
  from the next frame.

| v1 pattern | v2 replacement |
|---|---|
| Override `isVisible()` to stop painting | Override `isRenderAllowed()`. `isVisible()` is only a query now; overriding it does not stop painting. For connections `isRenderAllowed()` also hides the line and arrow; state and props changes re-evaluate it, other changes call `invalidateLine()`. |
| Read external state in `willIterate()` | Subscribe to the source and call `performRender()` (or `setState` / `setProps`); for connection geometry call `updateGeometry()`. Offscreen components are not iterated, so polling never sees the change. |
| Hide an overlay or release a resource in `willNotRender()` | Define `viewportChanged(inViewport)`; release everything in `unmount()`. |
| Compute badges, labels or decorations while painting | Compute their geometry when data changes and include it in the bounds (`setCullingBounds()`, the hit box, or for connections `static geometry`, the line's `getBounds()`, `getAfterRenderBounds()` and `updateLabelGeometry()`). A component is culled by the bounds it reports. |
| `batch.markDirty(connection)` after changing data used by `createPath()` | `connection.updateGeometry()` when the geometry or the line's `createPath()` reads that data: rebuilds the geometry, paths, bounds and hit testing together; `connection.invalidateLine()` when only the look reads it. `markDirty()` only rebuilds the batch chunk from the item's cached path. |
| `isIterated()` as "updated in the last frame" | In a culled layer it means the component is attached in a branch that is walked. |
| `CanvasBlock.isRendered()` as `shouldRender` | False outside the viewport: for a scene block, true while the scene draws it; for a `LegacyCanvasBlock`, `shouldRender && isVisible()` (see [Blocks in the scene](#blocks-in-the-scene)). |
| Return `false` from `iterate()`, or set `shouldRenderChildren = false` in `render()`, to hide children in the same frame | In a culled layer only the component's preparation decides: set `shouldRenderChildren` (or return `false` from `prepareUpdate()`). A value changed while painting applies from the next frame, which the component requests itself; the value `iterate()` returns is ignored. |
| A screen-space layer | Pass `culling: "screen"`; `"none"` walks every component without viewport culling. See [Layers](../rendering/layers.md). |
| Mount a `Layer` as a child component | Layers are tree roots: add them with `graph.addLayer()`. A component that culls cannot become a child; a child layer must pass `culling: "none"`. Appended under a culled tree, it joins its parent's culling: the parent's viewport culls its components. |

Three operations stay separate: `isRenderAllowed()` stops a component's own painting; `shouldRenderChildren = false`
(or `false` from `prepareUpdate()`) stops walking its children; in a culled layer the value `iterate()` returns does not; a batch is
drawn by the component that owns it (`BlockConnections`), so a traversal veto does not hide batched lines.
`afterRender` hooks of Canvas batch items run only for items in the viewport. The Canvas compatibility label pass
draws no labels while `BlockConnections` does not walk its children.

A built-in connection's labels draw above its own line and arrow in the scene. Connections above it in scene order
can cover those labels. A subclass can append scene label primitives with `appendSceneLabels()`. A subclass with
custom Canvas hooks uses the compatibility batch, including its separate label pass. Override `renderLabelText()`
to replace that batch's standard label, or `afterRender()` to draw after the connection's chunk.

`BaseConnection.bBox` of a `BlockConnection` no longer includes the standard label; `getBBox()` still does.

The Canvas compatibility batch groups items by grid cell instead of registration order (`connection.PATH2D_CHUNK_TILES`). Where
two connections of one style overlap, the overlap may be composited twice instead of once, which changes those pixels
for translucent colors and at anti-aliased crossings. `connection.PATH2D_CHUNK_SIZE` now defaults to 200 (it was 100).
`BatchPath2DRenderer` is a `BatchScene`: its protected internals (`indexes`, `itemParams`, `getGroup`,
`requestRender` and the `orderedPaths` cache) are removed; use `has()` to check registration.

`TGraphConnectionsContext.labels` is required: a custom parent that hosts `BlockConnection` must provide a
`ConnectionLabelRenderer`, as `BlockConnections` does. Call `super.appendSceneLabels()` from an override to keep
the inherited labels. The base `BlockConnection.afterRender` hook has no default painter.

The minimap draws block bodies without names. Scene blocks are drawn from their scene elements at the minimalistic
level without text (see [Blocks in the scene](#blocks-in-the-scene)). For a `LegacyCanvasBlock` it calls
`renderMinimalisticBlock(ctx, { text: false })`: an override of `renderMinimalisticBlock` or `renderSchematicView`
follows this rule only if it accepts `options` and passes them on (or checks `options?.text` itself); an override that
takes only `ctx` decides on its own what the minimap shows.

`viewportCulling: false` turns viewport culling off: every component is walked (retained components are never walked), a
graph component paints when the camera sees its hit box, and the Canvas compatibility batch draws every chunk. Its
label pass draws labels whose rectangles meet the camera view. The scene culls built-in connections independently. The lifecycle rules shared with culling
still apply (an offscreen component is not painted on mount; visibility is decided after preparation), so the
switch rules out spatial culling only.

## Retained components: connections outside the frame walk

A component class can declare `static override readonly mode = "retained"`. A retained component is still a child of its parent: the
parent creates, updates and unmounts it, and it receives context. The frame does not walk it: it has no place in the
layer's paint order or culling index and never receives `iterate()`, `render()`, `willRender()`, `didRender()`,
`willNotRender()`, `didIterate()` or `viewportChanged()`. When its data changes (`setState()`, `setProps()`, context,
`performRender()`), it is queued, and its layer applies the update before painting: `checkData()`
(`propsChanged()`, `stateChanged()`), `willIterate()` (`willMount()` on the first update) and its children, which must
be retained too. A layer with viewport culling applies these updates after preparing its other components; a layer
without culling applies them before the walk and again right after a parent reconciles retained children. A component
applies once per frame, and once more after each reconciliation by its parent in that frame; what it requests during
its own update applies in the next frame.

`BlockConnection` and its subclasses are retained by default. The scene draws built-in connections. The
`BlockConnections` batch and its label pass draw connections with custom Canvas hooks. A connection updates its
labels when state, props, geometry or label font size change. `BaseConnection` stays in the walk.

| Pattern in a `BlockConnection` subclass | v2 replacement |
|---|---|
| Draw in `render()`, `willRender()` or `didRender()`, or animate every frame | Declare `static override readonly mode = "immediate"`: the class is walked and culled again, and only it pays for that. Or extend `BaseConnection`. |
| Draw extra content | Prepare label bounds in `updateLabelGeometry()` and add scene primitives in `appendSceneLabels()`. For a custom Canvas label, override `renderLabelText()`. For other Canvas decoration, implement `afterRender(ctx)` and include its bounds in `getAfterRenderBounds()`. |
| Read external state in `willIterate()` every frame | Subscribe to it and call `setState()`, or `updateGeometry()` for geometry inputs. |
| Hide an overlay in `viewportChanged()` | Not called for retained components: check `isInViewport()` where you draw, or declare `static override readonly mode = "immediate"`. |
| Read `connectionPoints`, `getBBox()` or `getGeometry()` right after moving a block or port | Endpoint moves are applied once per frame, before painting: read after the next frame, or call `updateGeometry()` first. The connection's hit box follows its geometry from the next frame too. |

A retained component cannot cull: `setChildrenCulling` throws.

In development builds (`process.env.NODE_ENV !== "production"`) a retained class that defines one of these per-frame
hooks logs one warning. A retained connection keeps its store order for hit testing, `isIterated()` is true while
`BlockConnections` walks its children, and `isInViewport()` compares its paint bounds with the layer's viewport.

Earlier v2 pre-releases spelled the mode as a boolean:

| Before | Now |
|---|---|
| `static detached = true` | `static override readonly mode = "retained"` |
| `static detached = false` | `static override readonly mode = "immediate"` |

The type is `TComponentMode`. `detached` is no longer read: a class that still declares it silently keeps its base's
mode, and `static override detached` no longer compiles (TS4113).

## Blocks in the scene

`CanvasBlock` (`Block`) and `Anchor` are scene components: `graph.scene` draws them on its canvas, with Canvas 2D or
WebGL, from level methods that return primitives, and tags and rules style them. `GraphLayer` stays their parent and
keeps events, hit-testing, drags and the camera. Built-in connections share the scene canvas. See
[Block component](../components/block-component.md), [Anchors](../components/anchors.md), [Scene](../system/scene.md)
and [Tags and styles](../system/tags-and-styles.md).

### Removed `Block` members

| v1 member of `Block` | v2 |
|---|---|
| `render()`, `renderBody(ctx)`, `renderSchematicView(ctx, options)`, `renderMinimalisticBlock(ctx, options)`, `renderDetailedView(ctx)`, `renderStroke(color)`, `renderText(text, ctx, options)` | Level methods `schematic(view)`, `detailed(view)` and, when it differs, `minimalistic(view)`, which return primitives; states as tags and rules on parts. Or extend `LegacyCanvasBlock` for one release. |
| `willRender()` override, `shouldRenderText` | The title's `minScale` (`block.SCALES[0]`); `minScale` / `maxScale` on your own primitives. |
| `calcZIndex()`, `raiseBlock()`, the selection raise in `stateChanged()`, `getRenderIndex()` | Scene raises: the theme's `raise: 1` while selected or dragged, and a new scene order on selection and on drag start. |
| `shouldRenderHtml`, `raised`, `updateViewState()`, `didIterate()` | Removed. React containers read `$viewState`. |
| `$viewState` as a writable `signal` of `{ zIndex, order }` (tree values) | A `ReadonlySignal` of `{ zIndex: 0, order: rank }`: the dense rank, in scene order, among the blocks React containers show. |
| `isRendered()` as `shouldRender && isVisible()` | True while the scene draws the block: its element is written, not hidden, and its hit box is in the viewport. |
| `renderAnchor(anchor)` returning a descriptor | `getAnchorClass(anchor)` returning an anchor class; size and line width are the class's `SIZE` and `LINE_WIDTH`; the key is the anchor's id. An anchor class takes no props of its own (see [Anchor classes](#anchor-classes)). Development builds warn about a class that still defines `renderAnchor`: blocks never call it. |
| `updateChildren()` without a declared type | `updateChildren(): ChildDescriptor[]`, an empty list when anchors are off. It may return child scene components besides the anchors (see [Evented areas are removed](#evented-areas-are-removed)). |
| `setRenderDelegated(true)` from an HTML view | `delegateRender({ canvasVisible })` (graph-react's `GraphBlock` does it): the scene hides the block only at the detailed level. `setRenderDelegated` remains, without the level rule. |
| reading `this.hidden` to know the block is handed to HTML | `isRenderDelegated()` (both writers), or `isShownOutsideScene()` to include views that keep the canvas drawing. `isHeldByHtml()` is true while any view holds the block at the detailed level. |
| `minimalistic(view)` in v2 pre-releases (`this.schematic(view)`) | Not defined: the minimalistic level takes the schematic list. `super.minimalistic(view)` does not compile (TS2722) and throws at runtime: call `super.schematic(view)`. |

`Anchor` lost its `zIndex` getter and `render()`: it is a retained scene component with the parts `anchor` and
`border` (see [Anchors](#anchors)). The theme rules have new parts: a block's `halo` and `badge` (hidden), an anchor's
`border` (the ring).

### `LegacyCanvasBlock`: one release to port

To keep a v1 block's imperative look for one release, switch the base class and keep the overrides:

```diff
- import { CanvasBlock } from "@gravity-ui/graph";
+ import { LegacyCanvasBlock } from "@gravity-ui/graph";

- class MyBlock extends CanvasBlock {
+ class MyBlock extends LegacyCanvasBlock {
    public override renderSchematicView(ctx: CanvasRenderingContext2D): void {
      // unchanged
    }
  }
```

`LegacyCanvasBlock` is deprecated. It draws on `GraphLayer` below the scene canvas, including its blocks and
built-in connections. Its element takes tags and styles (bucket, hit order, and the dim and opacity its anchors
inherit). The body uses imperative drawing. It is hit in scene order, so its visual stacking and hit order can
differ where a scene primitive covers it. Its anchors draw in the scene. In development builds a `CanvasBlock` subclass that still defines one of the
removed render members logs one warning per class. A block whose children draw in `render()` must extend
`LegacyCanvasBlock` too: children of a retained component must be retained, or mounting them throws.

Port a block by moving its drawing into level methods:

```diff
- class StatusBlock extends CanvasBlock {
-   protected renderBody(ctx: CanvasRenderingContext2D): void {
-     ctx.fillStyle = this.state.meta?.failed ? "#d32f2f" : this.context.colors.block.background;
-     ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
-   }
- }
+ // The default Block, no subclass: the state is a tag, the look a rule on its body part.
+ const failedTag = defineTag("failed");
+ graph.scene.styles.add([
+   { target: CanvasBlock, tags: [failedTag], style: { parts: { body: { color: "#d32f2f" } } } },
+ ]);
+ graph.scene.tags.set(failedTag, { block: ["b3"] });
```

A look that needs more structure is a subclass with `schematic(view)` (and `detailed(view)` when it differs), with
coordinates relative to the block's origin; see [Block component](../components/block-component.md#level-methods).

### Order and hit-testing

| Before | Now |
|---|---|
| `block.DEFAULT_Z_INDEX` is 1, a selected or dragged block 2 | Block elements are in bucket 200 (`block.DEFAULT_Z_INDEX`), 201 while selected or dragged (the theme's `raise`). Connections keep 0. |
| Blocks are painted and hit by the tree `zIndex` and `renderOrder` | The scene order decides both ([`compareOrder`](../system/scene.md#compareorder)): bucket, then the element's order (a selection or a drag start gives a new, highest one), anchors right above their block. A block's tree `zIndex` and `renderOrder` no longer order it. |
| An anchor's `zIndex` is its block's + 1: it wins hits over every block of that `zIndex` | An anchor is hit in its block's scene order: an upper block covers the anchors of a lower one. |
| A layer component with a tree `zIndex` from 2 to 199 is hit above blocks | It is hit below blocks. Give it a `zIndex` of at least 201 to stay above every block, selected ones included (at an equal value a component without a scene key wins), or more if your rules raise blocks further. |
| A prevented `block-change` still moved the drawn block (component state) | A scene block stays where the store says: its origin reads the store. |

The drag raise comes from `Block.handleDragStart`, in the default action of `block-drag-start`: a prevented
`block-drag-start` does not raise the block. React containers take their CSS z-index from `$viewState`'s rank; a newly
mounted container gets its rank in the next frame.

### Anchors

- **No anchors at the minimalistic level.** The default anchor is drawn on the schematic level only. The detailed
  level draws nothing for anchors, because React draws them there. The anchor is hit at the schematic level. At the
  detailed level it is hit only while its block is shown outside the scene (an HTML view holds it, or
  `setRenderDelegated(true)`), subject to `static hitLevels` declarations and hidden components (see
  [Anchors are hit where they are shown](#anchors-are-hit-where-they-are-shown)). At the minimalistic level the block
  under it is hit, so gestures that start on an anchor (connection creation, anchor selection, hover) start from the
  schematic level on.
- **Lazy components.** A block creates its anchor components once the camera shows it on a level of its anchor
  classes' `CREATION_LEVELS` (schematic and detailed for `Anchor`). Until then `AnchorState.getViewComponent()` is
  `undefined` (it is reactive through `$viewComponentReady`),
  the anchor port's `owner` is the `Block` (check `instanceof Anchor` on port owners with care), and
  `getElementsOverPoint` / `getElementsOverRect` and `$selectedComponents` return created anchors only. Read anchor
  positions from the port (`block.getAnchorPort(anchorId).getPoint()`), not from
  `getViewComponent().getPosition()`. Override `Block.shouldCreateAnchors()` to create them on other terms.
- **Look.** The selected anchor keeps its ring: the ring is the `border` part, hidden by the theme and shown by
  `selectedTag`. Hover is the theme's `hoveredTag` rule, which scales the hovered anchor's dot and ring by 1.8. Restyle
  both with rules on `Anchor`.
- **`useBlocksAnchors`** turned off at runtime still hides the connections attached to anchors, and turning it on shows
  them again; a graph that starts with it off draws them.
- **graph-react:** `GraphBlockAnchor` positions itself from the anchor's port while the canvas component does not
  exist.

#### Anchor classes

A `renderAnchor` override becomes `getAnchorClass`. The block creates the component itself, with the anchor's data,
its port and the class's `SIZE` and `LINE_WIDTH`, keyed by the anchor's id:

```diff
- protected renderAnchor(anchor: TAnchor) {
-   return MyAnchor.create({ ...anchor, zIndex: this.zIndex, size: 16, lineWidth: 2, shape: "square",
-     port: this.getAnchorPort(anchor.id) }, { key: `${anchor.id}/${anchor.index}` });
- }
+ protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
+   return anchor.type === "OUT" ? SquareAnchor : Anchor; // class SquareAnchor { static SIZE = 16; ... }
+ }
```

An anchor with props of its own (a shape, data types, a muted flag) becomes an anchor class that reads its block:

- A shape prop becomes one class per shape, chosen from the block's data (`this.state.meta`).
- What the look reads (data types for its colour) comes from the block's view data (`view.block`).
- What code outside the look reads (connection validation reading `isGraphEndpoint` or `dataTypes`) becomes a method
  of the anchor class that reads its block's data (`this.connectedState.block`, or the parent block component).
- A state such as muted becomes a tag with a style rule.
- A per-block size getter that returns a constant (an `anchorSize` of 16) becomes the class's `SIZE`. A size that
  differs per block needs one class per size.
- A key with the anchor's index (`${id}/${index}`) only changed component identity. The key is the anchor's id now,
  and development builds report two anchors with one id.

```typescript
import { Anchor, CanvasBlock, defineTag } from "@gravity-ui/graph";
import type { Graph, TAnchor, TAnchorClass, TAnchorView, TBlock, TScenePrimitive } from "@gravity-ui/graph";

declare const graph: Graph;

type TStepMeta = { anchors?: Record<string, { stream?: boolean; dataTypes?: string[] }> };

/** The anchors of a step: 16 world units, their data types read from the block's data. */
class StepAnchor extends Anchor {
  public static override SIZE = 16;

  /** For connection validation: read from the block's data, not from props. */
  public getDataTypes(): readonly string[] {
    const meta = this.connectedState.block.$state.value.meta as TStepMeta | undefined;
    return meta?.anchors?.[this.props.id]?.dataTypes ?? [];
  }
}

/** A stream anchor is a square: another shape is another class. */
class StreamAnchor extends StepAnchor {
  protected override schematic(view: TAnchorView): readonly TScenePrimitive[] {
    const half = view.size / 2;
    return [{ kind: "rect", part: "anchor", x: -half, y: -half, width: view.size, height: view.size }];
  }
}

class StepBlock extends CanvasBlock<TBlock<TStepMeta>> {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return this.state.meta?.anchors?.[anchor.id]?.stream ? StreamAnchor : StepAnchor;
  }
}

// Muted is a tag and a rule, not an anchor prop: the anchors multiply their opacity by their block's.
const mutedTag = defineTag("muted");
graph.scene.styles.add([{ target: StepBlock, tags: [mutedTag], style: { opacity: 0.4 } }]);
graph.scene.tags.add(mutedTag, { block: ["step-1"] });
```

### Evented areas are removed

`eventedArea(fn, params)` and its hover tracking are gone. A clickable region becomes a child component: a
`SceneComponent` returned from the block's `updateChildren()`. Its rect is its look (or `getHitRect()`, without a
look), its handlers are listeners, and the `hovered` state of the render callback becomes `hoveredTag` on the child,
styled by rules on its class. Its primitives are in the block's frame: `x: 0, y: 0` is the block's corner, where the
area used `this.state.x`. To keep a region off a level, draw nothing there or declare `static hitLevels`; a region
without a look must declare it. See [Child components](../components/block-component.md#child-components).

```diff
- class TestBlock extends LegacyCanvasBlock {
-   render() {
-     super.render();
-     this.eventedArea(() => ({ x: this.state.x, y: this.state.y, width: 50, height: 50 }), {
-       key: "area1",
-       click: () => onArea1(),
-     });
-   }
- }
+ class Area1 extends SceneComponent<object, TGraphComponentProps & { blockId: string }> {
+   public static override entityType = "area1";
+   public override getEntityId(): string { return this.props.blockId; }
+   protected override willMount(): void { super.willMount(); this.addEventListener("click", () => onArea1()); }
+   protected override getViewData(): object { return {}; }
+   protected override schematic(): readonly TScenePrimitive[] {
+     return [{ kind: "rect", x: 0, y: 0, width: 50, height: 50, fill: "rgba(0, 120, 255, 0.2)" }];
+   }
+ }
+ class TestBlock extends CanvasBlock {
+   protected override updateChildren(): ChildDescriptor[] {
+     return [Area1.create({ blockId: String(this.props.id) }, { key: "area1" }), ...super.updateChildren()];
+   }
+ }
```

The event order of a child differs from an area's. These are differences of the replacement, not changes of a kept
API:

- **Handler order.** The owner's handlers ran before its areas' (`_fireEvent`). Now the child's handler runs first,
  then its parent's through the parent walk.
- **Stopping.** A child's `stopPropagation()` keeps the event from its parent: a button that stops its click no longer
  lets the block select.
- **Overlaps.** A click went to every area under the pointer. Now it goes to the one topmost child.
- **Outside the owner.** A child's hit box may lie outside its owner's, and takes events there.
- **Hover events.** As for every event, `mouseenter` and `mouseleave` walk the parent chain from the target, so a
  block's listeners hear its children's hover too. Check `getEventTarget(event)`, `detail.target` or the new
  `detail.relatedTarget` to tell which. `Anchor` no longer stops its hover events, only its clicks and presses.
- **Presses.** A press on a child that is not draggable drags its nearest draggable ancestor, as in the DOM. So a
  press-drag on a former area still drags the block, as in v1, and the camera pans only when nothing in the chain is
  draggable. A press that the drag or the pan takes reaches no component: the child gets no `mousedown`, as the block
  body gets none. The `mouseup` and the `click` reach the child. A child with a gesture of its own makes itself
  draggable (`isDraggable()` and `handleDrag*`, as `Anchor` does), or a graph `mousedown` listener prevents the press
  and calls `graph.dragService.startDrag`. A child's `onDrag()` never starts under a draggable block. See
  [Presses and drags](../system/event-model.md#presses-and-drags).

### Hit levels and transparent components

- A scene component is hit on the levels where it is shown:
  - an element owner (a block) on every level;
  - a child (an anchor, a child component) on the levels its look is drawn on, and wherever its block is shown outside
    the scene: at the detailed level while an HTML view holds the block, on every level after
    `setRenderDelegated(true)`;
  - a child without a look only on the levels its `static hitLevels` declares. The declaration is required: without
    it the child is not hit, and development builds warn.

  `static hitLevels` overrides the rule in every case. `getElementsOverRect()` leaves out what the level does not hit.
- **Visible change:** the stock anchor at the detailed level is no longer hit while nothing shows its block outside
  the scene (no HTML view, no `setRenderDelegated(true)`). v1 drew no canvas anchor there but hit it; now the block
  under it is hit. Reason: a component is hit where it is shown, and events have one source, the graph's bus. See
  [Anchors are hit where they are shown](#anchors-are-hit-where-they-are-shown).
- A scene component hidden for a reason other than the handover (`setVisibility(false, …)`, a collapsed group) is a
  barrier for its descendants: none of them is hit, on any level, as under `display: none` in the DOM. A hidden child
  is not hit either. A hidden block is not hit once its hit box is removed
  (`setVisibility(false, { removeHitbox: true })`, a collapsed group); with `removeHitbox: false` it keeps its hit box
  and stays a target. See
  [Hit levels](../system/event-model.md#hit-levels).
- `static transparentToEvents = true` is available for a component that keeps a hit box but must never be the
  pointer's target: `getElementOverPoint()` and the pointer skip it, while `getElementsOverPoint()`,
  `getElementsOverRect()` and the usable rect keep it. `onHitBox() { return false; }` keeps working and leaves the
  component out of every hit query; keep it where that is what you need.

### Events and hover

**The model.** The event model is the component tree's. The component under the pointer handles an event and lets it
go on, or stops it. An event it does not stop reaches its parent, and its parent's parent, and each can check the
target. Hover events also carry `detail.relatedTarget`, the other side of the target change (none for the camera or
outside the graph), so a parent can tell whether the pointer stayed inside it.

**The hit target (new).** `getEventTarget(event)` returns the graph component a pointer event hit (a block, an anchor,
a child component, a connection or a group), the same in every handler of the walk and after the dispatch;
`getEventTarget(event, Class)` returns it only for that class.

- `click`, `mousedown`, `mouseup` and `dblclick` stay the browser's `MouseEvent`s. An emulated click is a copy of the
  browser's event, and its DOM `target` is `null`.
- Only the hover events (`mouseenter`, `mouseleave`, `mouseover`, `mouseout`) are `CustomEvent`s with
  `detail.target` and `detail.relatedTarget` (`TGraphHoverDetail`).
- On the graph's bus, use `detail.target` or `getEventTarget(detail.sourceEvent)`.

```typescript
import { CanvasBlock, getEventTarget } from "@gravity-ui/graph";

class RunButtonAwareBlock extends CanvasBlock {
  protected override willMount(): void {
    super.willMount();
    this.addEventListener("click", (event: Event) => {
      if (getEventTarget(event) !== this) return; // a child's click that bubbled up
      // A click on the block itself.
    });
  }
}
```

**The graph's events.** `graph.on` and `useGraphEvent` get the same events with the same targets, with
`relatedTarget` added on `mouseenter` and `mouseleave` (`GraphMouseEvent.detail.relatedTarget`). Menus and cursors
that follow the target behave as before.

**Visible changes of the event model**, each with its reason:

- **Only the sides of a change that exist get events.** Entering the graph no longer sends the new target a
  `mouseleave` first. Reason: that leave named the new target as the old side, a false leave.
- **Leaving the graph.** When the pointer leaves the graph's root, the target becomes none: the old target gets its
  `mouseleave`, and a camera move then finds no target. Reason: the target must match what the pointer is on.
- **A removed hovered component** gets no event, as before. The nearest graph component above it gets the
  `mouseleave` in its place when the pointer is no longer on it, so a block whose hovered child is removed stops
  showing as hovered. Reason: otherwise the block stayed hovered.
- **A still pointer.** When what it hits changes, the target is found again at the end of the frame (or once the hit
  test has indexed the frame's hit boxes): a component hidden, shown or removed; a hit box that was set before
  moving, resizing, going or coming back (a block or an anchor moved through the API, a child's look); hit levels, an
  HTML hold or the scene level changing. Hover and
  cursor used to wait for the next pointer move there. The graph's `mouseenter` and `mouseleave` fire then as well,
  so menus, tooltips and other listeners that follow the target react without a pointer move. A level change does
  this even with `emulateMouseEventsOnCameraChange` off. A component that mounts under the pointer is found at the
  next move, as before, and so are the anchors a pan creates. Camera moves keep the
  `emulateMouseEventsOnCameraChange` rule. Reason: hover, cursor and the bus must follow what the pointer hits.
- **Hover of a block.** A block stays hovered (`hoveredTag`, React's `graph-tag-hovered`) while the pointer is on its
  anchor or another child; the tag used to go away there. Reason: a block shows as hovered as an element does with
  CSS `:hover`, while the pointer is on it or on any of its descendants.
- **`Anchor` now lets its `mouseenter` and `mouseleave` reach its block.** A block listener that set a hover state on
  `mouseenter` and cleared it on `mouseleave` without checking the target now also hears its anchors': the state stays
  on over the anchor and goes off when the pointer leaves the block. Check `getEventTarget(event)`, or
  `detail.relatedTarget` on leave, to keep the old behaviour. Reason: a parent hears the events of its
  children, as in the DOM.

**`hoveredTag`** is written by components on themselves, for styles only. The binding to the pointer's target is
gone. The library `Block` tags itself while the pointer is on it or on a descendant (`isHoveredBy`); `Anchor`,
connections and groups while they are the target. A custom component with a `static entityType` that relied on the
binding tags itself now: call `this.setHoveredTag(pointerTargetAfter(event) === this)` from its `mouseenter` and
`mouseleave` listeners, or `isWithinComponent(this, pointerTargetAfter(event))` for a CSS-like hover of itself and
its descendants.

```typescript
import { GraphComponent, pointerTargetAfter } from "@gravity-ui/graph";

class Pin extends GraphComponent {
  public static entityType = "pin";

  public override getEntityId(): string {
    return "pin-1";
  }

  protected override willMount(): void {
    super.willMount();
    // Tagged while it is the pointer's target, as the binding did.
    const follow = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
    this.addEventListener("mouseenter", follow);
    this.addEventListener("mouseleave", follow);
  }
}
```

- No library code reads `hoveredTag` to decide behaviour. A rule that gives hovered components a `raise` changes the
  scene order, and so the hit order where components overlap; a `scale` changes the drawing, not the hit box.
- A graph `mouseleave` handler that calls `preventDefault()` keeps the event from the components, so a block or an
  anchor that was tagged keeps its `hoveredTag`. Prevent hover events only where that is what you want.
- A child or a custom anchor that calls `stopPropagation()` on `mouseleave` keeps the event from its block, so the
  block keeps its `hoveredTag` after the pointer leaves it through that child. Stop hover events only where the parent
  must not hear them.
- **An overridden `dispatchEvent`.** The hover hook `onDispatchedEvent` runs in the parent walk (`_dipping`). A class
  that overrides `dispatchEvent` to fire its own listeners without the walk, as a block that keeps its events to
  itself does, skips its own hook too. The library `Block`'s hover then follows only what bubbles up from its anchors,
  so it is off over the body and stays on after the pointer leaves the body. Keep the stopping and call the hook
  first:

  ```diff
    public override dispatchEvent(event: Event): boolean {
      if (!this.isInteractive()) return this._dipping(this, event);
  +   // Its own events reach the hover hook, as the parent walk would do.
  +   this.onDispatchedEvent(event);
      if (this._hasListener(this, event.type)) this._fireEvent(this, event);
      return false;
    }
  ```

  Routing through `super.dispatchEvent(event)` instead changes more than the hover: the events then walk on to the
  block's parents (the camera unsets the selection on a `click` that reaches it) unless a listener stops them.
- A connection whose stroke width follows the camera (a width in screen pixels, read again on zoom) calls
  `invalidateLine({ followsCamera: true })` or `ConnectionLine.invalidate({ followsCamera: true })`: the hit box it
  resizes then asks for no retarget, as camera moves keep their rule. The option is new and optional.

### The handover to HTML

- `GraphBlock` no longer calls `setRenderDelegated`. It calls `delegateRender({ canvasVisible })` once its HTML has
  mounted, and releases it on unmount. A hold counts at the detailed level only: there the block and its children are
  hit, unless a class's `static hitLevels` leaves the detailed level out (see
  [Hit levels and transparent components](#hit-levels-and-transparent-components)), and with `canvasVisible: false`
  the scene draws nothing of the block.
- `hidden` no longer means "held by HTML": a hold does not write it. A block that skips work while it is not visible
  reads the handover instead:

  ```diff
  - if (!this.isVisible() && !this.hidden) return; // off screen, and no HTML view
  + if (!this.isVisible() && !this.isShownOutsideScene()) return; // off screen, and no HTML view
  ```

  `isShownOutsideScene()` covers a view that keeps the canvas drawing (`canvasVisible={!ready}`); `isHeldByHtml()`
  is true while any view holds the block at the detailed level. A test that called `setRenderDelegated(true)` to stand
  for the HTML view calls `delegateRender({ canvasVisible: false })` at the detailed level.
- **Visible change: the handover follows the level.** ReactLayer switches its HTML at the end of the graph frame, so
  zooming out draws the canvas blocks in the frame that hides the HTML, and no frame shows neither picture. A stopped
  graph does not switch it. Reason: the HTML and the scene blocks must switch in one frame.
- When the level becomes detailed, graph-react's blocks list holds the pointer's retarget until its views have
  mounted (at most three graph frames). A `GraphBlock` rendered outside that list, or a view that mounts later, can
  move the target once: one extra `mouseleave` and `mouseenter`.

### Anchors are hit where they are shown

Events come from one source, the graph's bus: GraphLayer listens on the root, where HTML events bubble, and targets the
hit-tested component. A component is hit on the levels where it is shown, by its scene look or by an HTML view. v1 hit
the stock anchor at the detailed level, where it drew nothing on the canvas. v2 hits it there only while its block is
shown outside the scene (an HTML view holds it, or `setRenderDelegated(true)`), subject to `static hitLevels`
declarations and hidden components (see
[Hit levels and transparent components](#hit-levels-and-transparent-components)). Standard anchors at the
minimalistic level are not a new consequence: earlier v2 pre-releases already stopped drawing and hitting them
there.

| Case | Consequence |
| --- | --- |
| Detailed without HTML, a stock anchor | Point queries no longer return it; the target is the block under it, or another entity, or the camera |
| A click on such an anchor | The anchor's selection toggle no longer runs; the block's or the background's action may run |
| Hover | The anchor's enter/leave, raised state, `hoveredTag`, tooltip and cursor do not activate; the new target gets the events |
| The graph bus and target-based menus | `mousedown`, `click`, `dblclick`, hover events and `getElementOverPoint()` callers get another target |
| Starting a connection gesture | The anchor-based start goes; where a block start is allowed (Shift) the block gesture remains |
| Finishing a connection gesture | Without `snappable` meta the fallback picks the block's input port instead of the anchor's; validation and the endpoint change |
| Explicitly snappable ports | The port search can still reach the anchor port through the block's port map: a separate port path |
| Rect and viewport queries | Excluded anchors leave `getElementsOverRect()` and `getElementsInViewport()`; their custom callers change |
| Rect selection | Unchanged: the default selects `[Block]`, and the anchor selection bucket relates to no component, so a rect selection never selected anchors. Only custom callers of `getElementsOverRect()` see fewer anchors |
| A block a collapsed group hides | Its anchors take no hits and drop out of point and rect queries, on every level |
| Zooming across a level boundary | Retargets the pointer at the end of the frame: a still pointer over an anchor's point gets the anchor at the schematic level, and loses it at the detailed level without HTML |
| Drag | Where an anchor took the gesture, the block's or the camera's rules apply; visible with `captureAnchors` and connection editing |
| A custom anchor drawn at minimalistic | Once created with its look, it is a hit target there: hover, selection and anchor gestures where earlier pre-releases rejected every anchor |
| Detailed with an HTML hold | Anchors and other children keep the graph-bus interaction, except levels excluded by `hitLevels`; `autoHideCanvas={false}` without `canvasVisible` registers the hold too |
| Explicit `hitLevels` | It may exclude detailed even under HTML; the next eligible target gets the events |

`<GraphBlock autoHideCanvas={false}>` without `canvasVisible` now registers the view (the canvas stays drawn), so its
anchors are hit through the HTML at the detailed level. A canvas-only graph that started connections from anchors at
the detailed level starts them at the schematic level, or marks anchor ports `snappable`.

### Visibility, delegation and groups

**API.**

- `setVisibility(visible, …)` and `setRenderDelegated(delegated)` write two separate inputs, and `hidden` is derived
  from both. New: `GraphComponent.isHiddenForOtherReason()` (hidden by `setVisibility` or a subclass's reason, not by
  delegation) and the protected hook `hiddenChanged(hidden)`, called when the derived state changes.
  `BlockConnection` no longer overrides `setVisibility`: a subclass that followed it overrides `hiddenChanged`.
- `SceneComponent.isSceneHidden()` no longer includes delegation. An override that returns `this.hidden || x` makes a
  delegated component a hit barrier, because `this.hidden` is the derived state: return `super.isSceneHidden() || x`.
  `SceneComponent.isHitBarrier()` (protected) decides whether the component's descendants take no hits; a hidden
  child is not hit itself either, while an element owner leaves the hit test only with its hit box.
- `Group.subscribeGroupSignal(signal, callback)` subscribes for as long as the component is bound to its group state.
  A group removed and added back with its id before a frame keeps its component, which binds to the new state: a
  `subscribeToGroup` override that subscribes with plain `subscribeSignal` keeps a stale subscription to the old
  state per rebind. `Group.leaveGroupState()` (protected) undoes what the component applied for its state, on a rebind
  and on unmount; `CollapsibleGroup` ends its collapse there.

  ```typescript
  import { CollapsibleGroup } from "@gravity-ui/graph";

  class BadgeGroup extends CollapsibleGroup {
    protected override subscribeToGroup(): void {
      super.subscribeToGroup();
      // Ended on a rebind and on unmount; subscribeSignal would keep listening to the old state.
      this.subscribeGroupSignal(this.groupState.$selected, () => this.performRender());
    }
  }
  ```
- `BlockState.unsetViewComponent()` is public: a block state names no component after its block was re-added and the
  kept component bound to the new state. `BaseConnection.isMounted()` is now true while the connection is mounted.

**Visible changes**, each with its reason:

- **Hide, then delegate, then end the delegation: the component stays hidden.** v1 showed it again, because the last
  writer of one shared flag won. `setVisibility(true, …)` on a delegated component no longer draws it while it is
  delegated. `setVisibility(false, { removeHitbox: true })` on a delegated component now removes its hit box. Reason:
  one writer per input (derive, don't override).
- **A block that leaves a collapsed group** (by `updateBlock`, a move to another group, or a re-add with or without a
  frame between) is shown, and its ports are its own again. Earlier versions could leave it hidden, with its ports
  delegated to the group. Reason: the group no longer holds a block it does not contain.
- **A member re-added with its membership** into a collapsed group that a static `setGroups` set (no grouping layer
  sets the groups again) is shown, as it is with a frame between. The earlier same-frame path kept it hidden by
  accident.
  Under `withBlockGrouping` it stays hidden. Reason: one result whatever the frames between.
- **`BlockState.getViewComponent()` of a removed block's state** is `undefined` once its component unmounts; v1
  returned the dead component. So the deprecated `$sourceBlock` and `$targetBlock` of a connection whose endpoint
  block was removed become `undefined` after the frame. Reason: a dead component accepted writes that went nowhere.
- **Same-frame remove and re-add.** An entity removed and added back with its id before a frame (an undo and a redo,
  or `setEntities` without it and then with it) now ends as it does with a frame between. Reason, for each case
  below: one result whatever the frames between.
  - **Anchors.** The kept anchors of a re-added block bind to the new block's `AnchorState`s: the new state's
    `getViewComponent()` names the anchor, and its selection, clicks and drags go through the new state. They used to
    stay bound to the removed states, and the new states named no component. The anchor component, its element, its
    tags and its port stay.
  - **Connections.** A re-added connection gets a new component. The old one unmounts: `graph-component-unmounted`
    fires, listeners added to it are gone, and the new state's `getViewComponent()` returns the new component. The
    old component used to stay, bound to the removed state, and the new state got none. Code that holds a connection
    component across an undo and a redo (a hover menu or a tooltip that keeps the instance) sees it unmount. Its hover
    state starts over on the new component; the selection stays, because it is kept by id.
  - **Connection endpoints.** A connection's `$sourceBlock`, `$targetBlock` (deprecated) and `$hidden` follow a block
    re-added before a frame: they read the new `BlockState`, so the line hides and shows with the new block. They
    used to keep the removed state, also after the block moved.
  - **A re-added block's hidden state.** The block takes the new state's hidden value, `false` included. It used to
    keep its old value: a block hidden by a collapsed group, or hidden directly, stayed hidden after the re-add until
    something showed it again.
  - **Deleting a group in the frame of its collapse** shows its blocks and gives them their ports back. They used to
    stay hidden, with their ports delegated to the removed group: the deletion read the component's collapsed state,
    which the collapse had not reached yet.
  - **A hit box set back in the same frame.** A hit box changed and then set back to where it was before the frame
    runs (a group collapsed and expanded in one frame, or collapsed and re-added expanded) ends where the last change
    put it. The change before it used to win: such a group was hit only on its collapsed header.

### New members for child components, hit levels, events and the handover

| Member | What it is |
| --- | --- |
| `getEventTarget(event, Class?)` | The graph component a pointer event hit (a block, an anchor, a child component, a connection or a group), in every handler of its walk |
| `pointerTargetAfter(event)`, `isWithinComponent(ancestor, target)` | Hover helpers: the target after a hover event; whether a target is a component or its descendant |
| `TGraphHoverDetail`, `GraphMouseEvent.detail.relatedTarget` | The detail of hover events; the other side of a target change |
| `EventedComponent.onDispatchedEvent(event)` (protected) | A hook for each event that walks through the component, before its listeners |
| `GraphComponent.transparentToEvents`, `isTransparentToEvents()` | Pointer events pass through the component |
| `GraphComponent.setHoveredTag(hovered)` (protected) | Writes the component's own `hoveredTag` |
| `GraphComponent.isRenderDelegated()`, `isHiddenForOtherReason()`, `hiddenChanged(hidden)` (protected) | The delegation input, the other hide reasons, and a hook for the derived `hidden` |
| `GraphComponent.withCameraDerivedHitBox(update)` (protected) | Hit box changes inside `update` follow the camera and ask for no retarget |
| `SceneComponent.hitLevels`, `isHitOnLevel(level)`, `isShownOutsideScene()`, `isHitBarrier()` (protected) | Hit levels: a component is hit where it is shown |
| `SceneComponent.getHitRect(bounds)`, `invalidateChildren()` (protected) | A child's hit box; reading the view data of its child scene components again |
| `Block.getAnchorClass(anchor)`, `isHoveredBy(target)` (protected) | The anchor classes; when the block shows as hovered |
| `Block.delegateRender(request)`, `isHeldByHtml()`, `THtmlViewRequest` | The handover to HTML |
| `Anchor.SIZE`, `LINE_WIDTH`, `CREATION_LEVELS`, `TAnchorClass` | An anchor class's statics |
| `graph.scene.query(rect, options)`, `TSceneQueryOptions`, `revisionOf(type)`, `onFrameEnd(listener)` | Scene queries by level, hidden state and type; per-type revisions; the frame's end |
| `TSceneElementView.entityType`, `nestedIn` | An element's type and the child element it is nested in |
| `BlockState.unsetViewComponent()`, `Group.subscribeGroupSignal()`, `Group.leaveGroupState()` (protected) | Rebinding to a re-added entity |
| `BlockConnection.invalidateLine({ followsCamera })`, `ConnectionLine.invalidate({ followsCamera })` | A stroke width that follows the camera asks for no retarget |

`Graph.getComponentsInViewport()`, `GraphLayer.requestRetarget()`, `GraphLayer.holdRetarget()`,
`HitTest.hasPendingUpdates()` and `Anchor.creationLevelsOf()` are `@internal`.

### Text, primitives and ports

- **Text sizes.** A text primitive's `size` is a number: world units, or screen pixels with `cameraAware`. The text
  forms of `TSceneSize` are removed, with `TSceneTextSize`:

  | Before (v2 pre-releases) | After |
  | --- | --- |
  | `size: { px: 9, maxWorld: 90 }` | `size: 9, cameraAware: { maxWorld: 90 }` |
  | `size: { px: 13 }` | `size: 13, cameraAware: true` |
  | `size: { world: 12, minPx, maxPx }` | no equivalent: a world size `size: 12`, or a camera-aware one with world clamps |
  | `size: 14` | `size: 14` (unchanged: world text) |

  `lineHeight` is the pitch at `size`, in its units, and scales with the resolved font size. A part style's
  `cameraAware` and the graph setting `cameraAwareText` (default `true`; `false` turns every text world-sized) change
  the mode at runtime (see [Text primitives](../system/scene.md#text-primitives)).
- **Text fits its box at every zoom, as v1's `layoutText` did.** Both renderers and exports lay a text out with one
  shared layout at the resolved size: lines wrap to `width` (a word wider than the box splits by characters, whitespace
  and newlines collapse), a line is kept while it fits `height` at the resolved pitch, then `maxLines`; `wrap: false`
  keeps one line and `overflow: "ellipsis"` ends the last kept line with "…". Lines never leave the box. The pre-release
  scene wrapped once at scale 1 and stretched the lines, so camera-aware text overflowed its block when zoomed out;
  that is fixed, and pre-cut texts (an app's own `fitText` with "…") can pass the full text with `wrap: false`,
  `maxLines: 1`, `overflow: "ellipsis"` instead. A text whose lines fit its box is not clipped, as in v1 (glyph ink may
  overhang by side bearings, accents and descenders); one whose layout overflows the box is clipped to it in both
  renderers. A style's `cameraAware: true` applies only to texts with a `height`.
- **Placement.** Each line's top lies where v1 Canvas 2D drew it (`textBaseline = "top"`), in both renderers:
  `verticalAlign` (`"top"`, the default, `"middle"`, `"bottom"`) places the block of lines in its box. This undoes the
  1–3 px downward shift of the earlier v2 pre-releases. Line breaks are the same in both renderers.
- **Bounds.** A text with a `height` contributes its box to the element's culling bounds, at any zoom.
- Primitive types are read-only (`TScenePrimitive`, `TSceneStroke` and the object forms of `TSceneSize`): code that
  assigns to a primitive no longer compiles. Development builds freeze the text primitives the store receives, so
  changing one in place throws.
- `PortState.setPoint(x, y)` with the port's current point writes nothing, so its subscribers and the connections at
  the port do not recompute.
- View data compares a hole in a sparse array as `undefined` (see
  [View data](../components/block-component.md#view-data)).

### Minimap, export and the canvas

- The minimap draws the scene's block elements with `graph.scene.query(rect, { level: "minimalistic", includeHidden:
  true, entityTypes })` and the interpreter, in the blocks list order. `entityTypes` are `"block"` and the types of the
  other block classes on the list or in `blockComponents`. Blocks handed over to HTML and blocks in collapsed groups
  stay on it; anchors and child components do not. `LegacyCanvasBlock`s draw with
  `renderMinimalisticBlock(ctx, { text: false })` and redraw it on every camera move.
- The minimap draws from a cached picture, redrawn on `graph.scene.revisionOf()` of those types and on block moves.
  **Visible change:** it shows tags and styles one frame after the main view, and during continuous changes (pointer
  drags, a stream of API moves) it redraws at most about once per 100 ms, always ending with the last state. Before,
  block moves and drags redrew it in the same frame. Reason: the picture is redrawn whole, and a redraw in every frame
  of a drag cost that frame's time; one full redraw per change, or per period of continuous changes, is the
  accepted cost. A camera move only redraws the camera frame. The `@gravity-ui/graph-minimap` README
  ("What it draws") lists what redraws it.
- A style that scales or widens primitives now widens their culling bounds: a hovered anchor at the edge of the view
  is no longer clipped (see [Bounds and styles](../system/scene.md#bounds-and-styles)).
- Take screenshots with `graph.scene.toImage()` (see [toImage](../system/scene.md#toimage)): `getGraphCanvas()` keeps
  returning the `GraphLayer` canvas for immediate drawing. The scene canvas holds the built-in connections, blocks and anchors.

### Custom WebGL backends

A custom module for the `webglBackend` setting (`ISceneBackendModule`) changed its contract since the earlier v2
pre-releases:

- The backend implements `applyMany(changes: readonly TSceneChange[])` instead of `apply(change)`. The scene passes
  the changes of one frame at once, coalesced per element, and the backend renumbers its depth once per call. A backend
  that still only has `apply()` throws when the scene calls `applyMany()` on the first update; the scene then
  reports the failure and falls back to the Canvas 2D interpreter.
- `stats` has a required `subBits` field (the depth's sub-order width after the last apply, at least 5), and
  `lastApplyMs` now measures `applyMany()`.
- `replay(store, text?)` and `applyMany(changes, text?)` receive the camera scale and text policy to lay texts out for
  (`TSceneTextFrame`), and each frame carries the `textPolicy` (the `cameraAwareText` setting). `stats` has the text
  re-layout counters (`textRelayouts`, `lastTextRelayouts`, `lastTextRelayoutGlyphs`, `lastTextRelayoutBytes`,
  `lastTextRelayoutWrittenBytes`, `lastTextRelayoutDrawnBytes`, `lastTextRelayoutMs`, `lastTextRelayoutsKept`,
  `staleTexts`) and the upload sizes (`uploadBytes`, `lastUploadBytes`,
  `lastUploadWrites`).

## Connection lines and geometry

`BlockConnection` uses `SceneLine` by default. Describe the shape with `static geometry` and the look with a
`getStroke()` override on a `SceneLine` subclass. Set `renderer: "webgl"` or switch a running graph with
`graph.scene.setRenderer("canvas")`. The same connection and line class work in both scene renderers. Its shaft,
arrow and labels share scene order. Canvas-specific path or paint hooks draw through the GraphLayer Canvas batch.

If you used the experimental connection API, replace imports of `Path2DLine` and `WebGLLine` with `SceneLine`,
and `TWebGLStroke` with `TSceneLineStroke`. Remove a `static line` assignment that only selected one of the old
classes. Keep the assignment when it installs your own line subclass. A subclass that only overrides `getStroke()`
now works in both scene renderers, including when it previously extended the Canvas-specific class.

If you tested the separate WebGL connections renderer, replace `graph.getGraphLayer().$connectionsRenderer`
with `graph.scene.$renderer`. Use `TSceneRenderer` for the requested renderer and `TSceneRendererState` for the
observable state, which includes loading and recovery. The experimental line class's static `renderer` field,
the `getWebGLConnectionsStats()` and `resetWebGLConnectionsStats()` exports, and the batch's `forEachItem()`
were retired with that renderer. A custom Canvas item can still check its registration with `batch.has(item)`.
See [Connection Lines, Geometry and WebGL](../connections/webgl-connections.md) for the API.

| Before | After |
|---|---|
| `createPath()` / `createArrowPath()` on the component | A custom `static geometry`, shared by drawing and hit testing in both scene renderers; or `createPath(geometry)` / `createArrowPath(geometry)` of a `SceneLine` subclass with `static line = MyLine` |
| `getPath()`, `getArrowPath()`, `generatePath()`, `getArrowPoints()` | `getGeometry()`: the segments and the arrow; the line builds and caches its paths |
| `style(ctx)`, `styleArrow(ctx)`, `setRenderStyles(ctx)` | `style(ctx)` / `styleArrow(ctx)` of a `SceneLine` subclass |
| `getStrokeColor(state)` | `getStroke(state)` of the line class: color, width and dash |
| `getClassName(state)` | `getGroup()` of a `SceneLine` subclass; the default group follows `getStroke()` |
| `MultipointConnection` / `BezierMultipointConnection` path overrides | `static geometry = multipointGeometry` / `bezierMultipointGeometry`; the ready classes are `BlockConnection` subclasses with these statics |
| `collectBBoxPoints()` | Bounds come from the geometry; `getBounds(geometry)` of the line for custom paths; `getAfterRenderBounds()` for what `afterRender()` draws |
| `onHitBox()` overridden for the line | `hitTest(x, y, threshold)` of the line class; the label hit stays on the component (`hitTestLabel()`) |
| `applyShape()` | `invalidateLine()` for looks that read data outside the store; `updateGeometry()` for shapes that do |
| `this.geometry` (`{ x1, y1, x2, y2 }`) | `this.connectionPoints` (the endpoints) or `this.getGeometry()` |
| `this.arrowShape`, `this.path2d` | The line's items (`this.line`, `this.line.arrow`); the component holds no `Path2D` |

### Custom shapes

Both scene renderers draw a shape described by `static geometry`. Bounds, arrow placement and hit testing follow the same route.

```typescript
// v1
class ZigzagConnection extends BlockConnection {
  protected createPath(): Path2D {
    const { x1, y1, x2, y2 } = this.geometry;
    const midX = (x1 + x2) / 2;
    const path = new Path2D();
    path.moveTo(x1, y1);
    path.lineTo(midX - 20, y1);
    path.lineTo(midX + 20, y2);
    path.lineTo(x2, y2);
    return path;
  }
}
```

```typescript
import { BlockConnection, lineSegment } from "@gravity-ui/graph";
import type { TConnectionGeometryFn } from "@gravity-ui/graph";

const zigzagGeometry: TConnectionGeometryFn = ({ source, target }) => {
  const midX = (source.x + target.x) / 2;
  const a = { x: midX - 20, y: source.y };
  const b = { x: midX + 20, y: target.y };
  // No `arrow`: none is drawn. Return { points, closed } to draw one.
  return { segments: new Float32Array([...lineSegment(source, a), ...lineSegment(a, b), ...lineSegment(b, target)]) };
};

class ZigzagConnection extends BlockConnection {
  public static override geometry = zigzagGeometry;
}
```

To keep a Canvas-specific shape, override `SceneLine.createPath(geometry)`. The compatibility batch paints
the returned path and hit testing uses it. The arrow and bounds still come from `static geometry`. Override
`getBounds()` if your path extends beyond those bounds.

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TConnectionGeometry } from "@gravity-ui/graph";

class ZigzagLine extends SceneLine {
  protected override createPath(geometry: TConnectionGeometry): Path2D {
    const { segments } = geometry;
    const x1 = segments[0];
    const y1 = segments[1];
    const x2 = segments[segments.length - 2];
    const y2 = segments[segments.length - 1];
    const midX = (x1 + x2) / 2;
    const path = new Path2D();
    path.moveTo(x1, y1);
    path.lineTo(midX - 20, y1);
    path.lineTo(midX + 20, y2);
    path.lineTo(x2, y2);
    return path;
  }
}

class ZigzagConnection extends BlockConnection {
  public static override line = ZigzagLine;
}
```

### Styles from data

Return the colour, width and dash from `getStroke()` once for both renderers.

```typescript
// v1
class StatusConnection extends BlockConnection {
  public style(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = this.state.status === "failed" ? "#e5484d" : "#4285f4";
    ctx.lineWidth = this.state.selected ? 4 : 2;
    return { type: "stroke" };
  }

  public getClassName(state = this.state) {
    return `${super.getClassName(state)}/${state.status}`;
  }
}
```

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TLineStroke } from "@gravity-ui/graph";

type TStatusConnection = TConnection & { status?: "ok" | "failed" };

class StatusLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const { status } = state as Partial<TStatusConnection>;
    // withInteraction() applies hover and selection: the selected color, 2 units wider; the dash stays.
    return this.withInteraction({ color: status === "failed" ? "#e5484d" : "#4285f4", width: 2 }, state);
  }
}

class StatusConnection extends BlockConnection<TStatusConnection> {
  public static override line = StatusLine;
}
```

`withInteraction()` adds 2 units of width for hover or selection and supplies the selection color while retaining
your dash. A WebGL shader effect receives the base stroke color and can use `f.selected` to draw its selection.
See [Hover and selection in effects](../connections/webgl-connections.md#hover-and-selection-in-effects).
`style()` stays for what a stroke cannot say (gradients, shadows, fills); a `style()` that reads more than
`getStroke()` overrides `getGroup()` as well.

### Multipoint connections

`MultipointConnection` and `BezierMultipointConnection` are `BlockConnection` subclasses with
`static geometry = multipointGeometry` and `bezierMultipointGeometry`. A custom class can set the same static.

- Supply both endpoints, even for a route with explicit `points`. The connection becomes visible and hittable
  once both ports and their delegates resolve. Delegating one end replaces the corresponding end of the rendered
  route with the delegate position. Stored points remain available when the delegation ends.
- The default `SceneLine` strokes the closed triangle at the end with the line's width (v1 used width 1).
- The built-in `labels` use the scene's `label` and `labelBackground` parts with both renderers. Connections that
  use the Canvas compatibility batch draw those labels through `afterRender()`.

### Bounds and hit testing

Bounds come from the geometry: the tight bounds of every cubic (the control-point hull with
`EXP_USE_TIGHT_BEZIER_BOUNDS = false`), joined with the arrow, the label and `getAfterRenderBounds()`. Culling pads
them by half the stroke width (1 for the default width, 2 hovered or selected) and the arrow points by half the arrow's
width times the canvas miter limit, so wider strokes are culled by their real extent.
`collectBBoxPoints()` still exists on `BaseConnection`, which keeps calling it, so an override compiles, but
`BlockConnection` does not call it. Content drawn in `afterRender()` reports its bounds from `getAfterRenderBounds()`:

```typescript
import { BlockConnection } from "@gravity-ui/graph";
import type { TPathBounds } from "@gravity-ui/graph";

/** A flag at the source, drawn after the connection's chunk (Path2D only). */
class FlagConnection extends BlockConnection {
  public override afterRender(ctx: CanvasRenderingContext2D): void {
    const source = this.connectionPoints?.[0];
    if (!source) return;
    ctx.fillStyle = "#e5484d";
    ctx.fillRect(source.x, source.y - 12, 10, 8);
  }

  /** Joined into the connection's bounds, so culling keeps the flag drawn. */
  protected override getAfterRenderBounds(): TPathBounds | undefined {
    const source = this.connectionPoints?.[0];
    return source ? [source.x, source.y - 12, source.x + 10, source.y - 4] : undefined;
  }
}
```

Hit testing has one rule in both scene renderers: a point hits within `stroke.width / 2 + THRESHOLD_LINE_HIT` world units
of the drawn line (9 for a 2-unit line with the default `THRESHOLD_LINE_HIT = 8`, 10 hovered or selected). In v1 it
was 8 world units from the center, whatever the width. The arrow is part of the hit area while it is shown; label hits
are unchanged. The hit box follows the rule: it covers the line, the arrow and the label, padded by
`THRESHOLD_LINE_HIT` plus half the wider of the line and arrow strokes (in v1, by `THRESHOLD_LINE_HIT` around the line
and the label).

### Detection of removed methods

A `BlockConnection` subclass that still overrides a removed method — `createPath`, `createArrowPath`, `getPath`,
`getArrowPath`, `generatePath`, `getArrowPoints`, `style`, `styleArrow`, `setRenderStyles`, `getClassName`,
`getStrokeColor`, `getStroke` (on the component; it belongs to the line class), `getAppearance`,
`getArrowAppearance`, `isAnimated` or `collectBBoxPoints` — reports
one development-build warning per class, and the method is not called. For example (one line in the console):

```text
[@gravity-ui/graph] StatusConnection overrides style, getClassName, which BlockConnection no longer calls.
Move them: style → style() / styleArrow() of a SceneLine subclass; getClassName → getGroup() of a SceneLine
subclass. See the v2 migration guide, "Connection lines and geometry".
```

TypeScript also rejects `override` on a method the base class no longer has (TS4113, or TS4117 with a suggested
name). The protected `geometry` field (`{ x1, y1, x2, y2 }`) is gone, and `this.geometry` does not compile (TS2576:
`geometry` is the static geometry function now): read `this.connectionPoints` or `this.getGeometry()`.

`static override readonly mode = "immediate"` with a custom `render()` stays possible: the class is walked again and draws on the graph
layer's canvas every frame it is rendered, above its line in the Canvas compatibility batch.
