# Tags and styles (`graph.scene.tags`, `graph.scene.styles`)

A visual state of a graph element (selected, hovered, running) is a **tag** plus a **rule**, not code in a component
class:

1. **Systems write tags.** Selection, drag, hover and your own code say "this entity has this tag".
2. **Rules map tags to part values.** A stylesheet says "a block with `selected` gets this border colour".
3. **The scene draws computed styles.** For each element the scene resolves its class and tags into a style row and
   draws the row's values.

For a complete example that styles a block and animates its outgoing connection, see [Show a running ETL step](#show-a-running-etl-step).
See [Scene](scene.md) for the renderer itself.

## Tags

A tag belongs to an entity, addressed by `(entityType, id)`: `"block"`, `"connection"`, `"anchor"`, `"group"` or a type
a layer registers. A canvas component exposes its type as `static entityType`; `getEntityAddress(component)` returns the
address. Anchor ids are unique only within their block, so an anchor's id is block-qualified:
`anchorEntityId(blockId, anchorId)` (see [Anchor entity IDs](../components/anchors.md#anchor-entity-ids)), as in
`graph.scene.tags.add(runningTag, { anchor: [anchorEntityId("a", "out")] })`.

```ts
import { defineTag } from "@gravity-ui/graph";

const runningTag = defineTag("running"); // TTag<true>
const presenceTag = defineTag<string>("presence"); // a tag with a value per entity

graph.scene.tags.set(runningTag, { block: ["a", "b"] }); // exactly these blocks
graph.scene.tags.add(presenceTag, { block: new Map([["a", "#ff4081"]]) }); // add members
graph.scene.tags.delete(runningTag, { block: ["a"] });
graph.scene.tags.clear(runningTag);
graph.scene.tags.setRoot(focusTag, true); // a graph-wide ("root") tag
```

- `set` replaces the members of a tag, `add` adds to them, `delete` removes the given ids, `clear` removes all.
- `bind(tag, $members)` keeps a tag equal to a signal of members and returns an unsubscribe function.
- `setRoot(tag, on)` and `$root` hold graph-wide tags (for example "something is focused").
- `$of(type, id)` is a signal of one entity's tags with their values; `peekOf(type, id)` reads them now without a
  signal; `membersOf(tag)` lists a tag's members.

**`$of` signals are released.** The store drops an entity's `$of` signal when its last subscriber leaves, and a later
`$of` call returns a new signal. A holder that subscribes to the same signal again (React StrictMode re-runs effects,
`<Activity>` reconnects them) still gets the entity's tags: the store takes the signal back, and its first read gives
the tags written meanwhile. Read without a subscription, a released signal keeps the tags it had when it was released:
read the current tags with `peekOf`.

**Few distinct values.** The tag values of an entity are part of its style signature: the scene resolves one style row
per distinct `(class, tags, values)` combination. A tag value fits when it takes few distinct values across the graph:
a status out of a small set, or the presence colour of one of a few collaborators. Continuous data (a progress from 0
to 1, a latency) does not belong in a tag; keep it in element data.

**JSON-serialisable values.** The signature encodes tag values with `JSON.stringify`, so a value must be
JSON-serialisable: strings, numbers, booleans, `null`, and plain arrays and objects of them. A `bigint` throws; a `Map`
or a `Set` encodes as `{}` and a function as nothing, so different values of them share one style row.

### Built-in tags

| Tag | Writer |
| --- | --- |
| `selectedTag` | bound to `graph.selectionService.$selection`: every selected entity of every type |
| `hoveredTag` | each component on itself (`GraphComponent.setHoveredTag`), from the pointer events it gets; see below |
| `draggingTag` | `DragService`: the participants of the current drag |
| `dropTargetTag` | the groups transfer layer: a group that accepts the dragged blocks |
| `connectionSourceTag`, `connectionTargetTag` | available for applications to set while creating a connection |

`hoveredTag`:

- It is a styling tool that components put on themselves (`GraphComponent.setHoveredTag`). The library `Block`
  tags itself while the pointer is on it or on any of its descendants (CSS `:hover`; `isHoveredBy` decides). `Anchor`,
  connections and groups tag themselves while they are the pointer's target. A custom component tags itself only if
  it does so; nothing binds the tag to the pointer.
- It is for styling only: no library code reads `hoveredTag`, or any tag's membership, to decide behaviour. Events,
  targets, the cursor, hit-testing and menus come from the [event model](event-model.md).
- One indirect effect: a rule that gives a tagged component a `raise` changes the scene order, and the hit order
  follows it. The default theme raises a hovered or selected built-in connection by one bucket. It scales a hovered
  anchor by 1.8, which changes its appearance and culling bounds. The anchor keeps its original hit box.

`selected` is no longer a field of `TBlock`, `TConnection` or their `$state`. Read it with `$selected`, `selectedTag` or
the selection API (`graph.selectionService`).

## Rules

`graph.scene.styles` is the graph's stylesheet (type `SceneStyleSheet`); `graph.scene.tags` is its tag store (type
`TagStore`). The graph creates both; the package exports their types only.

```ts
import { CanvasBlock } from "@gravity-ui/graph";

const remove = graph.scene.styles.add([
  {
    target: CanvasBlock,
    tags: [runningTag],
    style: { parts: { border: { color: "#00c853" } } },
  },
  {
    target: CanvasBlock,
    tags: [runningTag],
    scope: { levels: ["minimalistic"] },
    style: { parts: { body: { color: "#00c853" } } },
  },
  {
    // Focus: fade every block that is not highlighted. `dim` keeps the blocks' colours, so a selected block keeps the
    // theme's selection border, faded.
    target: CanvasBlock,
    root: [focusTag],
    notTags: [highlightedTag],
    style: { dim: 0.6 },
  },
  {
    target: CanvasBlock,
    tags: [presenceTag],
    style: (values) => ({ parts: { border: { color: values.get(presenceTag) } } }),
  },
]);
remove(); // removes exactly these rules
```

| Field | Meaning |
| --- | --- |
| `target` | A component class. A rule applies to the class and its subclasses (`instanceof` semantics). |
| `tags` | All of these tags are on the entity. |
| `notTags` | None of these tags is on the entity. |
| `root` | These graph-wide tags are on. |
| `scope` | Where the rule applies, like a media query: `levels` (scene levels) and `minScale` / `maxScale` (`[min, max)`). |
| `priority` | Higher applies later and wins, over theme and user rules alike; at equal priority theme rules come first, then registration order. Default 0. |
| `style` | `{ parts?, raise?, dim?, opacity?, motion?, outline? }`, or a function of the entity's tag values returning the same. |

A part value (`TScenePartStyle`) is `color`, `visible`, `width` (stroke or border), `scale` (circle radius factor),
`dim`, `opacity`, `cameraAware` (the mode of the part's texts) and `effect` (WebGL paths). `raise` is added to the element's `zIndex` bucket
while the rule applies: a selected block draws above its neighbour.

**`motion`** applies to a block's own primitives in Canvas 2D and WebGL. The last matching rule that sets it wins.
A change to `"bounce"` or `"shake"` plays that preset once. An unrelated tag change that resolves to the same
preset keeps its progress. An explicit `"none"`, or removal of the last matching motion, returns the face to rest.
Use the rule's `scope` to enable motion at selected levels or scales.

```ts
import { CanvasBlock, hoveredTag } from "@gravity-ui/graph";

graph.scene.styles.add([
  { target: CanvasBlock, tags: [hoveredTag], scope: { levels: ["schematic", "detailed"] }, style: { motion: "shake" } },
]);
```

Each preset lasts 300 ms. The bounce moves up to 8 world units vertically and the shake up to 5 horizontally.
Child scene elements, anchors, ports and hit boxes stay at their layout positions. The stock React `GraphBlock`
applies the same motion to its background, border and content while `GraphBlockAnchor` stays at its port.
Switching between the scene and HTML preserves the progress of the animation, including its resting position
after it ends. See [Bounce or shake on hover](../components/block-component.md#bounce-or-shake-on-hover)
and [the interactive example](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-block-hover--bounce-and-shake).

**`outline`** sets the color and world-unit stroke width of the exterior contour of a block and its visible circular
anchors. An optional `outline.halo: { color, width }` adds a soft static edge. Its width is the reach beyond the rim, in world units. The last matching rule that sets `outline` wins. Use `null` to disable an earlier outline. The same tag,
root, level and scale filters apply as for other block styles. This rule outlines selected blocks at schematic and
detailed zoom.

```ts
import { CanvasBlock, selectedTag } from "@gravity-ui/graph";

graph.scene.styles.add([
  {
    target: CanvasBlock,
    tags: [selectedTag],
    scope: { levels: ["schematic", "detailed"] },
    style: { outline: { color: "#2860ba", width: 3 } },
  },
]);
```

While the outline applies, it replaces the stock rectangular border. Canvas 2D, WebGL and React `GraphBlock` use
the same rule. See [Outline a block and its anchors](../components/block-component.md#outline-a-block-and-its-anchors)
for the supported shapes and [Block styles / Selection outline](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-block-outline--selected)
to compare renderers.

**`cameraAware`** (`true` or `false`) turns the camera-aware mode of the part's texts on or off (see
[Text primitives](scene.md#text-primitives)): on, a text's `size` is in screen pixels and the text re-fits its box as
the camera zooms; off, it is world-sized. The state value wins over the base value, and both over the primitive's own
mode (a base rule too, unlike the base colours and widths, which only fill unset values); an explicit `false` turns a
camera-aware text off. `true` keeps the primitive's clamps (`{ minWorld, maxWorld }`), and applies only to texts with a
`height`: a heightless text that does not declare `cameraAware` itself keeps its world size, because its element's
bounds cover its lines at that size only. Development builds warn once per element type and part, and `explain()`
lists such parts in `cameraAwareNotApplied`; give the text a `height`, or declare `cameraAware` on the primitive. The
graph setting `cameraAwareText: false` turns every text off whatever the rules say, and `explain()` then reports
`cameraAwareText: "forced-off"`. Developers can set it per block type, or hand it to end users through a tag:

```ts
// Every default block's title keeps its size on screen.
graph.scene.styles.add([{ target: CanvasBlock, style: { parts: { title: { cameraAware: true } } } }]);
// Users who prefer world-sized names on some blocks: a tag and a state rule.
const worldNames = defineTag("worldNames");
graph.scene.styles.add([{ target: CanvasBlock, tags: [worldNames], style: { parts: { title: { cameraAware: false } } } }]);
```

**`dim`** (0 to 1, clamped) fades without recolouring: it moves every paint of a primitive towards the scene's dim
colour, the theme's `colors.canvas.layerBackground`, by that amount (`rgb = mix(rgb, dimColor, dim)`). Alpha does not
change, so an opaque block stays opaque. `dim` on the style sets it for the whole element; `dim` on a part overrides it
for that part's primitives, so `{ dim: 0.6, parts: { title: { dim: 0 } } }` fades a block but keeps its title. Because
`dim` touches no colour, it combines with any rule that does: a selected block under a focus `dim` keeps the theme's
selection border, faded. Use hex or `rgb()` / `rgba()` colours for paints and the layer background shared with
WebGL. A browser can preserve `oklch()` when normalizing it on Canvas, leaving the WebGL colour parser unable
to resolve it.

**`opacity`** (0 to 1, clamped) is real transparency: it multiplies the alpha of every paint of a primitive (`a = a ×
opacity`), whether the paint comes from the primitive's data, a base rule or a state rule, so whatever lies under the
element shows through: other elements, and the layers below the scene, such as the `BelowLayer` grid (the scene canvas
is transparent, and the browser composites it over them).
- **Nesting.** The element's `opacity` and a part's multiply: the effective opacity of a part is
  `(style.opacity ?? 1) × (part's state opacity ?? part's base opacity ?? 1)`, so
  `{ opacity: 0.5, parts: { title: { opacity: 0.5 } } }` draws the title at 0.25. A primitive without a part takes
  the element's opacity.
- **Per primitive, not a group.** Each primitive fades on its own, and the primitives of one element show through each
  other. This is not CSS `opacity` on a group, which draws the element first and then fades it as one layer. A block
  at `opacity: 0.5` whose border lies over its body shows the body through the border band: the band is the border at
  0.5 over the body at 0.5 (75% cover), not the border colour at 50%. Group opacity is not available yet.
- **Drawing.** Faded primitives blend in scene order across kinds. A faded block's body can cover the title of
  another faded block below it. Compatible connection strokes can share a draw. The cost depends on the visible
  order and the types of paint that overlap. See [Draw calls and order](../connections/webgl-connections.md#draw-calls-and-order).

Use `dim` to move a colour towards the layer background while keeping its alpha. Use `opacity` to let
underlying content show through. Changing opacity can move affected primitives to another render pass.

### Cascade

Values are resolved in this order; a later step overrides an earlier one:

1. **Base rules** (no `tags`, `notTags` or `root`; a `scope` alone keeps a rule a base rule) give the part's default
   values. The theme's colours are base rules: a primitive with no `fill` takes the theme's body colour.
2. **Data**: the values the primitive sets itself.
3. **State rules** (any rule with `tags`, `notTags` or `root`) override the data.

How each part property goes through these steps:

| Property | Base rule | Data | State rule |
| --- | --- | --- | --- |
| `color` | fills a paint the primitive leaves unset | the primitive's own paint beats the base | replaces the paint |
| `width` | fills a stroke or border width the primitive leaves unset | the primitive's own width beats the base | replaces the width |
| `effect` | fills an unset WebGL path effect | the path's own effect beats the base | replaces the effect, or disables it with `null` |
| `visible` | applies: `false` hides every primitive of the part | primitives have no visibility of their own | wins over the base: `true` shows a part a base rule hides |
| `scale` | applies to the part's circles | the primitive's radius | wins over the base scale |
| `dim` (part) | applies to the part's primitives | primitives have no dim of their own | wins over the base dim |
| `opacity` (part) | applies to the part's primitives | primitives have no opacity of their own (a translucent paint keeps its alpha, and the opacity multiplies it) | wins over the base opacity |
| `cameraAware` | applies to the part's texts, over their own mode | the text's `cameraAware` (and its clamps, kept by a style's `true`) | wins over the base value; the setting `cameraAwareText: false` wins over all |

The element-level `dim` merges like `raise`: the last matching rule that sets it wins, whatever its layer. A part
without a `dim` of its own (from a state or a base rule) and a primitive without a part take it. The effective dim of a
part is therefore its state dim, else its base dim, else the element's, else 0 (`parts ?? base ?? element`). So a base
rule's part `dim` beats a state rule's element-level `dim`: `{ parts: { title: { dim: 0 } } }` in a base rule keeps the
title of a block a focus rule dims with `{ dim: 0.6 }`.

The element-level `opacity` merges the same way, the last matching rule that sets it winning; a part's `opacity` merges
per part like any other part value. Unlike `dim`, the two do not replace each other: they multiply.

A paint or a stroke width that is still unset after the cascade draws nothing. A look that needs new structure (a
status icon) is a part the component declares and draws, hidden by a base rule and shown by a state rule, as the
default `Block` does with its halo and badge:

```ts
const failedTag = defineTag("failed");

// StatusBlock declares a "status" part (see "Part schemas" below) and draws it.
graph.scene.styles.add([
  { target: StatusBlock, style: { parts: { status: { visible: false } } } },
  { target: StatusBlock, tags: [failedTag], style: { parts: { status: { visible: true, color: "#e53935" } } } },
  // A scope alone keeps a rule a base rule: the title is hidden on the minimalistic level.
  { target: StatusBlock, scope: { levels: ["minimalistic"] }, style: { parts: { title: { visible: false } } } },
]);
```

Within a step, rules apply in one order, a later one winning per property: by `priority` (a higher priority applies
later), theme and user rules alike; at equal priority the **theme rules** (created from `TGraphColors` by
`createThemeRules` and replaced when the colours change) come before user rules; then registration order. The theme's
rules have the default priority 0, so a user rule of priority 0 or more overrides them, and a user rule with
`priority: -1` applies before them: it sets a default the theme's selection, drag and hover rules still win over.

### Part schemas

A class declares its part names with a type brand, and `styles.add` checks each rule's `parts` against its own target:

```ts
class StatusBlock extends CanvasBlock {
  public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "halo" | "badge" | "status">;
}
```

The brand is bivariant: a subclass can add parts, and a subclass that does not redeclare it inherits its base's parts.
The canvas `Block` declares `"body" | "border" | "title" | "halo" | "badge"` and `Anchor` declares
`"anchor" | "border"`. A class without a brand accepts any part name.

## Default block and anchor parts

The default `Block` draws five parts (see [Block component](../components/block-component.md#the-default-look)):

| Part | Primitive | Theme |
| --- | --- | --- |
| `body` | the block's rect | `colors.block.background` |
| `border` | the same rect's inside border | `colors.block.border`; `colors.block.selectedBorder` while selected |
| `title` | the name, from `block.SCALES[0]` on, not on the detailed level | `colors.block.text` |
| `halo` | a rounded rect 12 world units around the block | hidden |
| `badge` | a circle in the top-right corner | hidden |

The theme hides the halo and the badge with a base rule, so a state rule shows them. The theme also raises a selected
or dragged block by one bucket. [Block parts and zoom levels](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-sceneblocks--scene-blocks)
shows how to style those parts with a tag and a rule.

```ts
import { CanvasBlock, defineTag } from "@gravity-ui/graph";
import type { TStyleRule } from "@gravity-ui/graph";

const runningTag = defineTag("running");
const failedTag = defineTag("failed");
const highlightTag = defineTag("highlight");
const focusTag = defineTag("focus");

const rules: TStyleRule<typeof CanvasBlock>[] = [
  { target: CanvasBlock, tags: [runningTag], style: { parts: { border: { color: "#2e7d32" } } } },
  {
    target: CanvasBlock,
    tags: [runningTag],
    scope: { levels: ["minimalistic"] },
    priority: 1,
    style: { parts: { body: { color: "#2e7d32" } } },
  },
  {
    target: CanvasBlock,
    tags: [failedTag],
    style: { parts: { border: { color: "#d32f2f" }, badge: { visible: true, color: "#d32f2f" } } },
  },
  { target: CanvasBlock, tags: [highlightTag], style: { parts: { halo: { visible: true, color: "#ffb300" } } } },
  { target: CanvasBlock, root: [focusTag], notTags: [highlightTag], style: { dim: 0.6 } },
];

graph.scene.styles.add(rules);
graph.scene.tags.set(failedTag, { block: ["b3"] });
```

An anchor draws two parts: the `anchor` part (the dot, `colors.anchor.background`) and the `border` part (a ring
around it, `colors.anchor.selectedBorder`), which the theme hides and shows while the anchor is selected. While an
anchor is hovered, the theme scales both by `Anchor.CANVAS_HOVER_FACTOR` (1.8). Restyle anchors with rules on
`Anchor`:

```ts
import { Anchor, hoveredTag, selectedTag } from "@gravity-ui/graph";

graph.scene.styles.add([
  // A solid dot instead of the ring: a selected anchor takes the selection colour.
  {
    target: Anchor,
    tags: [selectedTag],
    style: { parts: { anchor: { color: "#ffcc00" }, border: { visible: false } } },
  },
]);

graph.scene.styles.add([
  // Or another ring colour and width.
  { target: Anchor, tags: [selectedTag], style: { parts: { border: { color: "#2962ff", width: 3 } } } },
  // A larger hover scale.
  { target: Anchor, tags: [hoveredTag], style: { parts: { anchor: { scale: 2.4 }, border: { scale: 2.4 } } } },
]);
```

At equal priority user rules apply after the theme's, so these win. Another shape needs an `Anchor` subclass with its
own level methods, returned from the block's `getAnchorClass(anchor)` (see [Anchors](../components/anchors.md)).

**Child elements.** An anchor's element is a child element of its block's, and so is a child component's (see
[Scene](scene.md#child-elements)). Its drawn row is its own rules' style, with its scene parent's element `dim` when
it sets none and its element `opacity` multiplied by the parent's. So a focus rule that dims a block dims its anchors
and children too, while their parts follow their own classes' rules. A child takes no `raise` of its own: it draws in
its block's bucket.

## Connection parts

For scene connections, target `BlockConnection` or a subclass. The shaft, arrow, label background and text use
the parts `line`, `arrow`, `labelBackground` and `label`. A tagged line width also changes the hit area.
Set `parts.line.effect` to `effect.use(input, { minScale, maxScale })` or to `null` to turn it off.
The optional scale range includes its lower bound and excludes its upper bound. Canvas draws the base stroke.
See [Connection styles](../connections/webgl-connections.md#scene-styles) for examples.

### Show a running ETL step

Suppose the `extract` block publishes results through the `extract-to-load` connection. Give the block a teal
border and its outgoing connection a teal stroke while the step runs. WebGL adds moving dashes at camera scales
of 0.4 and above. At smaller scales and on Canvas2D, the stroke keeps the status colour.

```ts
import { BlockConnection, CanvasBlock, dashFlow, defineTag, selectedTag } from "@gravity-ui/graph";

const runningTag = defineTag("etl-running");
const color = "#087e67";
const flow = dashFlow.use({ pattern: [12, 8], speed: 40 }, { minScale: 0.4 });
const removeRules = graph.scene.styles.add([
  {
    target: CanvasBlock,
    tags: [runningTag],
    notTags: [selectedTag], // Keep the theme's selection border.
    style: { parts: { border: { color } } },
  },
  {
    target: BlockConnection,
    tags: [runningTag],
    style: { parts: { line: { color, effect: flow } } },
  },
]);
```

Register the rules once per graph. When the job starts, apply the tag to the block and connection by ID.
The graph maintains `selectedTag` as the selection changes.

```ts
const step = { block: ["extract"], connection: ["extract-to-load"] };
graph.scene.tags.add(runningTag, step);
```

When the job finishes, remove its tag. The same rules still apply to other running steps.

```ts
graph.scene.tags.delete(runningTag, step);
```

Call `removeRules()` when the view that installed the rules closes.
To design your own animation, see [Writing a tagged shader effect](../connections/webgl-connections.md#writing-a-tagged-shader-effect).

## Elements and `explain`

A scene element is styled when it is bound to an entity. Library components do this themselves; code that writes
elements into `graph.scene.store` directly (stories, benches) calls the internal
`graph.scene.bindStyle(elementId, { type, id }, target)` **after** adding the element (adding resets its style row to
0). It returns a function that releases the binding.

`graph.scene.explain(entityType, id)` answers "why does this entity look like this": its tags and values, the root
tags, the class its element is styled as, the matched rules in application order (theme or not, priority, base or
state layer, tags) and the computed style. It reads no signal. `graph.scene.styleFor(target, tags)` computes a style
without an element, and `graph.scene.$styleGeneration` changes when rules or the theme change.

## Costs

| Change | What the renderer does |
| --- | --- |
| a tag, a rule or the theme changes a `color`, `visible` or `dim` | rewrites style table rows; no element is re-encoded |
| the theme changes the dim colour (`canvas.layerBackground`) | redraws; no row is rewritten and no element is re-encoded |
| `width`, `scale`, `cameraAware`, or a colour with alpha < 1 | re-encodes one element (a translucent colour moves its primitive into the translucent pass) |
| `opacity` below 1 (element or part), or a colour of a part under it | re-encodes one element: its faded primitives get their colours baked and move into the translucent pass. Opacity 1 or none changes nothing |
| `raise` | updates the owner's depth key and its children's order without re-encoding geometry. Moving between buckets can also renumber other owners in the affected depth bands. |
| `scope` with `minScale` / `maxScale` | adds a threshold; crossing it re-resolves the affected rows |

Rows are shared: a thousand blocks with the same class and tags use one row.

## Limits

- Text size and static dash patterns come from the text primitive and the connection stroke, respectively.
- `opacity` fades each primitive individually.
- A part's `scale` or `width` can grow the live culling bounds. Built-in connections also use the styled shaft
  and arrow widths for picking. An export can crop geometry grown only by its own rules (see
  [Bounds and styles](scene.md#bounds-and-styles)).
- A primitive's paint colour and stroke width are optional: with no value of its own and none from a style, the paint
  or the stroke draws nothing.
- At most 15 distinct part names in the scene (see [Limits](scene.md#limits)).

## Migration

- `selected` is gone from `TBlock`, `TConnection` and `$state`, and from `asTBlock()`, `asTBlockShallow()`,
  `asTConnection()` and `toJSON()`. Select through the selection API and read `$selected`, `selectedTag` or
  `graph.selectionService`.
- React: `GraphBlock` and `GraphBlockAnchor` get a `graph-tag-<name>` class per tag and `--graph-block-<part>-color` /
  `--graph-block-anchor-<part>-color` variables; the `selected` classes stay as aliases. `useEntityStyle(graph, entity,
  target, prefix)` gives the same for your own components.
