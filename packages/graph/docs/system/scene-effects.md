# WebGL scene effect types

An effect uses the inputs supplied by the primitive's shader. A block can use a path effect on a contour represented
as a `path`. Its regular rectangular fill and text keep their own rendering.

| What you draw                                                   | TypeScript API                                                           | GLSL entry point                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Stroked `path`, including a connection shaft or a block contour | `defineSceneEffect({ kind: "path", ... })` and `TSceneEffectUse<"path">` | `vec4 effect(PathFragment f, vec4 color)`                             |
| Textured `sprite`                                               | `TSceneSpriteEffect` on the sprite, with `params` on the primitive       | `vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params)` |

`TSceneEffectKind` currently contains `"path"`. The scene applies `parts.*.effect` only to path primitives. For
regular rects, circles and text, use the appearance fields in [Tags and styles](tags-and-styles.md). Use
[`style.motion`](tags-and-styles.md#rules) to bounce or shake a block in WebGL, Canvas 2D or HTML.

## Path effect types

| Type                           | Role                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSceneEffectDefinition<U, P>` | Input to `defineSceneEffect`. It declares the shader source, its uniforms `U` and how to encode typed input `P`.                                                                                                                                      |
| `TSceneEffect<"path", U, P>`   | Reusable effect object. Set `effect.uniforms.name.value` to update a uniform on all uses of this object. `clone()` starts with the definition's defaults and has independent uniform values.                                                          |
| `TSceneEffectUse<"path">`      | Result of `.use(input, range)`. Assign it to a path's `effect`, a `TSceneLineStroke.effect` or a path part's style rule. It contains the effect object, encoded parameters and optional scale bounds.                                                 |
| `TSceneEffectScaleRange`       | Camera-scale interval `[minScale, maxScale)`. Omit either bound to use zero or no upper limit. Outside the interval the path draws its base stroke. This range controls the effect. Set visibility bounds on the primitive to control the whole path. |

A definition has `kind: "path"` and a GLSL `fragment`. Set `animated: true` when the effect uses time and needs
frames while it is active and visible.

Supply finite scale bounds. `minScale` must be nonnegative and `maxScale` must exceed `minScale` (or zero when
the lower bound is omitted). You can also supply `{ effect, params, minScale, maxScale }` directly.

Declare uniforms as `{ name: { type, value } }` using `"float"`, `"vec2"`, `"vec3"` or `"vec4"`. In GLSL they are
available as `u_<name>`. Use parameters for values that differ per path. For glow beyond the stroke, set
`extraWidth` in CSS pixels. In Canvas 2D the scene draws the base stroke. The optional `fallback` callback applies
to [the compatibility Canvas batch](../connections/webgl-connections.md#fallback-strokes).

### Per-path parameters

`f.params0` and `f.params1` are the numbers you pass to the shader for one use of an effect. Pass an array to
`effect.use([...])`, or give the definition an `encode` function that converts named TypeScript input to an array.
GLSL receives the array as two `vec4` values of four numbers each, in the same order.

| GLSL vector | `.x`        | `.y`        | `.z`        | `.w`        |
| ----------- | ----------- | ----------- | ----------- | ----------- |
| `f.params0` | `params[0]` | `params[1]` | `params[2]` | `params[3]` |
| `f.params1` | `params[4]` | `params[5]` | `params[6]` | `params[7]` |

For example, `effect.use([12, 8, 40, 1, 0.5])` with no `encode` function gives the shader
`f.params0 = vec4(12.0, 8.0, 40.0, 1.0)` and `f.params1 = vec4(0.5, 0.0, 0.0, 0.0)`. The renderer fills
missing slots with zero and reads up to eight numbers.

In the example below, `encode` converts the first argument of `brighten.use(0.4, { minScale: 0.25 })` to `[0.4]`.
The shader reads the brightness strength as `f.params0.x`. The slot has that meaning because the TypeScript encoder
and the shader agree on its position.
Each use can supply different parameters. A uniform such as `u_strength` is shared by all uses of the same effect
object.

### One effect on a connection and a block outline

The rule below uses the effect on the shaft of a hovered connection. The block also returns a path with the same
effect in its schematic view. The rectangle used for the block's fill keeps its usual style.

```ts
import { BlockConnection, CanvasBlock, defineSceneEffect, hoveredTag, lineSegment } from "@gravity-ui/graph";
import type { Graph, TScenePrimitive } from "@gravity-ui/graph";

const brighten = defineSceneEffect({
  kind: "path",
  animated: true,
  encode: (strength: number) => [strength],
  fragment: `
    vec4 effect(PathFragment f, vec4 color) {
      float wave = 0.5 + 0.5 * sin(f.time * 3.0 - f.along / 20.0);
      return vec4(mix(color.rgb, vec3(1.0), wave * f.params0.x), color.a);
    }
  `,
});

const brightStroke = brighten.use(0.4, { minScale: 0.25 });

export function styleHoveredConnections(graph: Graph): () => void {
  return graph.scene.styles.add([
    { target: BlockConnection, tags: [hoveredTag], style: { parts: { line: { effect: brightStroke } } } },
  ]);
}

export class OutlineBlock extends CanvasBlock {
  protected override schematic(): readonly TScenePrimitive[] {
    const { width, height } = this.state;
    const topLeft = { x: 0, y: 0 };
    const topRight = { x: width, y: 0 };
    const bottomRight = { x: width, y: height };
    const bottomLeft = { x: 0, y: height };
    return [
      ...super.schematic(),
      {
        kind: "path",
        part: "outline",
        segments: new Float32Array([
          ...lineSegment(topLeft, topRight),
          ...lineSegment(topRight, bottomRight),
          ...lineSegment(bottomRight, bottomLeft),
          ...lineSegment(bottomLeft, topLeft),
        ]),
        stroke: { color: "#4c79ff", width: 2 },
        effect: brightStroke,
      },
    ];
  }
}
```

Register `OutlineBlock` for a block type using [`settings.blockComponents`](../components/block-component.md).
For a separately styled custom part, also [declare the part in the block's schema](tags-and-styles.md#part-schemas).

## PathFragment

A path shader defines `vec4 effect(PathFragment f, vec4 color)`. The library supplies the structure,
`#version 300 es`, `precision highp float` and the [path helpers](../connections/webgl-connections.md#library-effects-and-helpers).

| Field                     | GLSL type | Value                                                                                                                 |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `along`                   | `float`   | Distance from the start of the path in world units. It stays continuous across segments and is approximate on curves. |
| `length`                  | `float`   | Total path length in world units.                                                                                     |
| `t`                       | `float`   | `along / length` clamped to `[0, 1]`. Zero at the start of the path or when its length is zero.                       |
| `across`                  | `float`   | Signed distance from the stroke center line in CSS pixels.                                                            |
| `halfWidth`, `extraWidth` | `float`   | Half the drawn stroke width and the effect's additional reach on either side, respectively, in CSS pixels.            |
| `coverage`                | `float`   | Anti-aliased coverage of the base stroke at this pixel, from zero to one.                                             |
| `scale`                   | `float`   | Current camera scale in CSS pixels per world unit.                                                                    |
| `world`                   | `vec2`    | Fragment position in world coordinates.                                                                               |
| `time`                    | `float`   | Seconds on the [scene clock](scene.md#clock), shared across renderer switches.                                        |
| `params0`, `params1`      | `vec4`    | Per-path parameters 0–3 and 4–7, respectively.                                                                        |
| `hovered`, `selected`     | `float`   | Interaction flags, each zero or one.                                                                                  |
| `selectionColor`          | `vec4`    | Straight RGBA selection color from the interaction data. Its alpha is stored in steps of 1/255.                       |

Stock connections supply the interaction values. A custom path can populate its `interaction` field. Without it,
both flags and the selection color are zero. Style tags can enable a shader independently of the shader's
interaction inputs. See [Hover and selection in effects](../connections/webgl-connections.md#hover-and-selection-in-effects).

The input `color` is the straight RGBA stroke color. A static dash discards fragments in its gaps before the
effect runs. Return straight RGBA, using alpha zero for a transparent fragment. The renderer applies edge coverage,
hairline fade and premultiplication for blending. With `extraWidth`, the effect can use `f.coverage` to distinguish
the base stroke from the extra area. See [Glows](../connections/webgl-connections.md#glows-extrawidth).

`GRAPH_PATH_FRAGMENT` is the contract version, currently `1`. Use a guard such as `#if GRAPH_PATH_FRAGMENT >= 2` for fields or helpers
added in a later version. Fields and public helpers are additive within a major version. Shaders written with
`ConnectionFragment` and `GRAPH_CONNECTION_FRAGMENT` can still use those names as aliases. Use the documented
fields, `u_<name>` uniforms and public helpers. Renderer attributes, varyings and uniforms are private.

## Sprite fragment inputs

`TSceneSpriteEffect` supplies `fragment` and optional `animated` for a sprite. The fragment defines
`vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params)`. Set `animated: true` to request frames while
the sprite is visible when the shader reads `time`.

| Argument | Value                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------ |
| `atlas`  | Sampler for the sprite's decoded image. It can contain an atlas if the shader selects a region.  |
| `uv`     | Normalized position within the drawn rectangle, from top-left `(0, 0)` to bottom-right `(1, 1)`. |
| `time`   | Seconds on the same scene clock used by path effects.                                            |
| `params` | The sprite primitive's four numeric parameters. Omit `params` to give the shader four zeros.     |

Return straight RGBA. Keep the sampled alpha to preserve transparent edges of the image. The scene's Canvas 2D
renderer and interpreted exports omit sprites. See [a complete sprite example](scene.md#draw-a-texture-and-animate-it-in-webgl).
