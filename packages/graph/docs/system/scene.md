# Scene (`graph.scene`)

`graph.scene` is the scene runtime of a graph. It owns the element store (flat lists of drawing primitives with
bounds, a shared `zIndex` and a style id), the renderer that draws them, the scene level and a pausable clock.
The graph frame task updates it right after all layers (`layers.update()`, then `scene.update()`).

> Interim: blocks, anchors and connections still draw on `GraphLayer`. The scene canvas sits above the
> `GraphLayer` canvas and below `ReactLayer` until the component work moves them into the scene.

## Settings

```ts
graph.updateSettings({ renderer: "webgl" }); // default: "canvas"
graph.updateSettings({ webglBackend: () => import("./my-backend") }); // optional custom loader
```

- `renderer`: `"canvas"` interprets the elements with Canvas 2D; `"webgl"` draws them through the WebGL backend.
- `webglBackend`: loader of an `ISceneBackendModule`. By default the built-in backend is imported dynamically, so
  luma.gl is a separate chunk and is never loaded for `"canvas"`.
- `graph.scene.setRenderer(value)` writes the same `renderer` setting.

## `$level`

`graph.scene.$level` is a signal of `"minimalistic" | "schematic" | "detailed"`. It re-evaluates on zoom, on a change
of the camera scale-level strategy and on a change of graph constants. `$level` is for consumers: it does not filter
primitives. A primitive declares `minScale` / `maxScale` and is shown by the camera scale alone, so a consumer that
wants a tier-dependent look picks its own scale bounds.

## `$renderer`

`graph.scene.$renderer` is the state of the renderer:

- `"canvas"`: Canvas 2D is drawing.
- `"loading"`: WebGL was requested and the backend is loading; Canvas 2D keeps drawing.
- `"webgl"`: the WebGL backend is drawing.
- `"lost"` / `"restoring"`: the GPU context was lost and is being restored.
- `"webgl-fallback"`: the backend failed to load or restore; the scene draws with Canvas 2D.

## `clock`

`graph.scene.clock.now()` returns scene time in seconds. It stops on `graph.stop()` and while the document is
hidden, and resumes on `graph.start()`, so animations do not jump after a pause.

## `query` and `drawInterpreted`

`query(rect)` takes a world rectangle as `TRect` (`{ x, y, width, height }`, like `zoomToRect`) and returns read-only
views of the visible (non-hidden) elements whose bounds meet it, in draw order, bottom first. A view's `bounds` is
relative to the element's origin (`x`, `y`) and `hidden` is always `false`.

`drawInterpreted(ctx, elements, scale, { skipText })` draws views on any 2D context with the Canvas 2D interpreter,
whatever the active renderer. The caller owns the context transform, device pixel ratio included. A minimap uses both:

```ts
const dpr = window.devicePixelRatio || 1;
const elements = graph.scene.query({ x: 0, y: 0, width: 4000, height: 3000 });
ctx.save();
ctx.setTransform(k * dpr, 0, 0, k * dpr, offsetX * dpr, offsetY * dpr); // world to minimap device pixels
graph.scene.drawInterpreted(ctx, elements, k, { skipText: true });
ctx.restore();
```

`graph.scene.store` is `@internal`: it is the write side used by the library components and the benches.

## Styles: `bindStyle`, `styleFor`, `explain`

Elements take their looks from [tags and styles](tags-and-styles.md). `graph.scene.bindStyle(elementId, { type, id },
target)` (`@internal`) keeps an element's style row on the tags of an entity; add the element to the store first.
`graph.scene.styleFor(target, tags)` computes a style, and `graph.scene.explain(entityType, id)` lists an entity's
tags, matched rules and computed style.
