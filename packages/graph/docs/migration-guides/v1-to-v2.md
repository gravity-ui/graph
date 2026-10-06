# Migrating from Gravity Graph 1.x to 2.x

This guide collects changes that applications need when moving to v2. It grows
alongside the v2 implementation; entries below describe implemented changes.
The temporary branch and release process is documented separately in
[v1 to v2 transition](../v1-v2-transition.md).

## Migration checklist

- Move React, Minimap and DevTools imports to their dedicated packages and install their peers.
- Import the stylesheets for each package you use, with core styles before addon styles.
- Add `import "@gravity-ui/graph-minimap/styles.css"` when using Minimap: its default border and background now require this explicit import.
- Replace `canChangeBlockGeometry` / `ECanChangeBlockGeometry` with `canDrag` / `ECanDrag`.
- Treat configuration input types as patches and use the complete configuration types for stored state.
- Replace resets through `undefined` with `resetSettings(keys)` or `resetSettings()`.
- Supply complete arrays/tuples when updating constants.
- Use plain `TPoint` / `TRect` objects instead of geometry classes and their conversion methods.

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

## Styles and TypeScript

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

The `point` payloads of `connection-create-drop` and `port-connection-create-drop`
are plain `TPoint` values. Replace `point.toArray()` with `[point.x, point.y]` and
`point.toObject()` with `{ x: point.x, y: point.y }`. For rectangles, use
`[rect.x, rect.y, rect.width, rect.height]` or an object with those four fields.
Remove imports of the internal geometry classes and `instanceof` checks for them.

## Scheduler lifecycle

Repeated `start()` and `stop()` calls are safe. Stopping inside an update
prevents another frame from being queued. Calling `update()` before `setRoot()`
is a no-op; schedule an update after setting the root if needed.

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
`mapGraphColorsToCSSVariables` and `mapGraphConstantsToCSSVariables` also accept
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

Lookup hooks and store methods do not accept a type argument that promises
custom metadata from an ID. Custom canvas blocks retain `CanvasBlock<T, Props>`
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
`schedule(() => updatePosition(x, y), options)`. Its returned function prevents
pending invocations immediately, even
though the Scheduler processes physical removal after the frame. `once: true`
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

Port connection events describe custom component ports, which may have no block or
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
