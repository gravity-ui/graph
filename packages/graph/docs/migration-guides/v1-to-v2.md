# Migrating from Gravity Graph 1.x to 2.x

This guide collects changes that applications need when moving to v2. It grows
alongside the v2 implementation; entries below describe implemented changes.
The temporary branch and release process is documented separately in
[v1 to v2 transition](../v1-v2-transition.md).

## Migration checklist

- Move React, Minimap and DevTools imports to their dedicated packages and install their peers.
- Import the stylesheets for each package you use.
- Replace `canChangeBlockGeometry` / `ECanChangeBlockGeometry` with `canDrag` / `ECanDrag`.
- Treat configuration input types as patches and use resolved types for stored state.
- Replace resets through `undefined` with `resetSetting(key)` or `resetSettings()`.
- Supply complete arrays/tuples when updating constants.

## React package boundary

React components and hooks now live in `packages/graph-react` and are exported by `@gravity-ui/graph-react`.
The old `@gravity-ui/graph/react` subpath is removed. Core does not depend on React, React DOM, their types, or ELK.
The React package has a workspace peer dependency on core, plus required React 18 and React DOM 18 peers.

Replace React imports and load the two independently owned stylesheets:

```ts
import { Graph } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useLayeredLayout } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
```

The layered layout algorithm and converters remain framework-independent core APIs; the React package owns the hook.
Storybook and E2E consume the same public package entrypoints. `pnpm run build` builds core before React, and the shared
`tests/package-contract` suite builds and installs one tarball per public package, verifies native imports and strict
declarations, and checks that the React adapter uses the application's core classes.

## Minimap package boundary

`MiniMapLayer`, `MiniMapLayerProps`, `MiniMapLayerContext`, and `TMiniMapLocation` now belong to
`@gravity-ui/graph-minimap`. Replace imports of these symbols from `@gravity-ui/graph` with the new package:

```ts
import { Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import "@gravity-ui/graph/styles.css";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
graph.addLayer(MiniMapLayer, { location: "bottomRight" });
graph.start();
```

Minimap requires core as a peer dependency and does not require React. It uses the public core `Layer` and shares the
consumer's graph, camera, and block components. Navigation, geometry updates, and injected layer styles are unchanged;
there is no separate minimap stylesheet to import. Core no longer includes or re-exports the minimap implementation.

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

## Styles and TypeScript

Each package owns its stylesheet. Keep the explicit stylesheet imports shown
above; Minimap does not have a separate stylesheet.

For TypeScript applications that enable `noUncheckedSideEffectImports`, provide
your bundler's CSS declaration or include an ambient declaration in your
TypeScript project (for example, `src/assets.d.ts`):

```ts
declare module "*.css";
```

This declaration describes CSS imports to TypeScript. Your bundler validates
that the imported files exist. Published declaration locations and NodeNext/CJS
consumers remain supported.

## Scheduler lifecycle

Repeated `start()` and `stop()` calls are safe. Stopping inside an update
prevents another frame from being queued. Calling `update()` before `setRoot()`
is a no-op; schedule an update after setting the root if needed.

## Configuration input and resolved state

`TGraphColors`, `TGraphConstants` and `TGraphSettingsConfig` now describe partial
input/patches. You can supply just the fields you want to override, including
partial constants in the Graph constructor and `api.updateGraphConstants`.

Stored colors/constants and their change-event payloads are complete:
`TResolvedGraphColors` and `TResolvedGraphConstants`. Settings snapshots use
`TResolvedGraphSettings`; fields with no default, such as an optional custom
background/connection constructor, can still be absent. Defaults are normalized
before they enter signals and rendering contexts.

```ts
import { Graph, type TGraphColors, type TResolvedGraphColors } from "@gravity-ui/graph";

const input: TGraphColors = { block: { border: "#123456" } };
const graph = new Graph({}, undefined, input, { camera: { SPEED: 2 } });
const current: TResolvedGraphColors = graph.api.getGraphColors();
const border: string = current.block.border;
```

Use the input types for options you pass to Graph, and the resolved types when
you annotate snapshots received from getters, signals or events. Replace
`RecursivePartial<TGraphConstants>` with `TGraphConstants`; partial arrays are
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
graph.resetSetting("getCameraBlockScaleLevel"); // Restore the library callback.
graph.resetSetting("background"); // Remove an override with no library default.
graph.resetSettings(); // Restore all settings and clear custom registrations.
```

Resetting one setting preserves every other setting. `resetSettings()` affects
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
