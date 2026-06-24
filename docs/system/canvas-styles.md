# Canvas Styles

This document describes the current `CanvasStyles` system, why it was introduced, and what is still pending.

You can think of `CanvasStyles` as something like `adoptedStyleSheets` for canvas-rendered components:
- rules are registered centrally on graph level
- components resolve styles by class names at render time
- unlike browser CSS, application is explicit inside component render logic (`ctx` API)

## Why this exists

Previously, canvas components (for example `Block`, `ActionBlock`, `TextBlock`) mostly styled themselves directly in render methods via hardcoded `ctx.*` assignments and/or `graphColors`.

Current approach:
- style is resolved by class names through `graph.canvasStyles`
- components call `resolveCanvasStyles([...classes])`
- dynamic state (`selected`, `hovered`, `highlighted`, `dimmed`) is expressed as classes

The goal is to move canvas styling closer to CSS-like composition while staying explicit and fast.

## Current architecture

### `CanvasStyles` service

Location: `src/services/canvasStyles/CanvasStyles.ts`

Main API:
- `register(rule)`
- `registerMany(rules)`
- `unregister(selector)`
- `clear()`
- `resolve(classes, { scaleAdapter? })`
- `getVersion()`

Rules are selector-based:
- `selector: ".block.selected"`

Selectors are class-subset matching (not full CSS engine).

### Where styles live now

- **Built-in graph block styles** are registered by `Graph` in `registerBuiltInCanvasStyles()`
  - location: `src/graph.ts`
  - selectors: `.block`, `.block.selected`
- **Playground custom block styles** (`ActionBlock`, `TextBlock`) are registered in `GraphPlayground`
  - location: `src/stories/Playground/GraphPlayground.tsx`
  - selectors: `.block-action*`, `.block-text*`

### Runtime per-component classes

`GraphComponent` now supports runtime style classes:
- `addStyleClass(className)`
- `removeStyleClass(className)`
- `toggleStyleClass(className, force?)`
- `clearStyleClasses()`
- `hasStyleClass(className)`
- `getStyleClasses()`

This is intended for highlight/focus services.

### Scale adapter source

`GraphComponent` provides `getCanvasScaleAdapter()` and passes it into
`canvasStyles.resolve(..., { scaleAdapter })`.

This means:
- scale adaptation is centralized in `CanvasStyles`
- components should not manually re-apply `limitScaleEffect(...)` or `size / scale` for style-resolved stroke/text values

## Style model

### Grouped style sections (preferred)

```ts
type TCanvasStyleDeclaration = {
  fill?: { color?: string };
  stroke?: {
    color?: string;
    width?: number | `${number}px`;
    scaleWithCamera?: boolean;
    maxWidth?: number | `${number}px`;
    dash?: number[] | "solid" | "dashed" | "dotted";
    dashOffset?: number;
    cap?: CanvasLineCap;
    join?: CanvasLineJoin;
    miterLimit?: number;
  };
  text?: {
    color?: string;
    size?: number | `${number}px`;
    scaleWithCamera?: boolean;
    family?: string;
    weight?: string | number;
    style?: "normal" | "italic" | "oblique";
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  };
  composite?: {
    opacity?: number;
    blendMode?: GlobalCompositeOperation;
  };
};
```

### Normalization details

- lengths support `number | "${number}px"` and are normalized to `number`
- dash string presets:
  - `"solid"` -> `[]`
  - `"dashed"` -> `[6, 4]`
  - `"dotted"` -> `[2, 4]`
- selector matching is class-subset based with specificity + registration order precedence
- resolved styles are cached and invalidated by internal version changes

## Camera scaling semantics

### Stroke

- `stroke.scaleWithCamera = false` (default practical behavior)
  - thickness is camera-compensated in `CanvasStyles.resolve(...)`
  - computed through `scaleAdapter.limitScaleEffect(width, maxWidth)`
- `stroke.scaleWithCamera = true`
  - thickness is used in world units (visually changes with zoom)

### Text size

- `text.scaleWithCamera = false`
  - size is converted to screen-consistent value in `CanvasStyles.resolve(...)` (`size / scale`)
- `text.scaleWithCamera = true`
  - size is used in world units (visually changes with zoom)

## Usage examples

### Register styles

```ts
graph.canvasStyles.registerMany([
  {
    selector: ".block",
    style: {
      fill: { color: "#251b25" },
      stroke: { color: "rgba(229,229,229,0.2)", width: 3, maxWidth: 10 },
      text: { color: "#fff", align: "center", baseline: "alphabetic" },
    },
  },
  {
    selector: ".block.selected",
    style: {
      stroke: { color: "#ffbe5c" },
    },
  },
  {
    selector: ".block.dimmed",
    style: {
      composite: { opacity: 0.6 },
    },
  },
]);
```

### Apply runtime classes

```ts
component.addStyleClass("highlighted");
component.removeStyleClass("highlighted");
component.addStyleClass("dimmed");
```

## What is done

- `CanvasStyles` service with selector-based style rules
- grouped style model (`fill/stroke/text/composite`) without aliases
- runtime class API on `GraphComponent`
- built-in `.block` and `.block.selected` registration in `Graph`
- `Block` migrated to `CanvasStyles`
- `ActionBlock`/`TextBlock` moved to class-based style resolution while keeping previous visual intent
- scale adaptation flow finalized through `GraphComponent.getCanvasScaleAdapter()`
- tests for:
  - selector matching and specificity
  - stroke scaling and max width
  - text scaling flag
  - runtime class resolution

## What is not done yet

- Full migration of all canvas-rendered components (connections, groups, anchors, layers) to `CanvasStyles`
- Unified helper to apply grouped styles to `ctx` (currently some logic is component-local)
- Dedicated docs/examples for focus/highlight service integration
- Automatic re-registration strategy when `setColors`/`setConstants` are changed after graph init
  - current built-in block styles are registered once at graph creation
- Optional stricter style-key filtering policy is still evolving
- Public API docs page update (`docs/system/public_api.md`) for `canvasStyles` methods

## Notes for future work

- Use only grouped sections (`fill/stroke/text/composite`) for declarations.
- Keep style behavior explicit per render pass (shape vs text vs composite).
- Avoid introducing expensive canvas properties unless there is a clear need.
