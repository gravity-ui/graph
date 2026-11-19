import { ALL_LEVELS_MASK, LEVEL_BIT } from "../levels";
import type { TScenePrimitive } from "../types";

import type { TSceneFrame } from "./backendTypes";
import { NO_LIMIT, scaleBound } from "./encodeRects";
import { SCENE_COMMON, SCENE_OUTPUT } from "./shaders";
import { STYLE_ROW_TEXELS } from "./tables";

export type TSprite = Extract<TScenePrimitive, { kind: "sprite" }>;

// Keep the visibility predicates in the same positions as triangle instances.
export const SPRITE_FLOATS = 16;
export const SPRITE_ATTRIBUTES = ["sprite_ids", "sprite_box", "sprite_style", "sprite_params"] as const;

export function appendSprite(
  data: number[],
  sprite: TSprite,
  element: number,
  sub: number,
  slot: number,
  opacity: number
): void {
  const { x, y, width, height, params } = sprite;
  data.push(
    element,
    sub,
    slot,
    sprite.levelMask ?? ALL_LEVELS_MASK,
    x,
    y,
    width,
    height,
    opacity,
    sprite.effect?.animated ? 1 : 0,
    scaleBound(sprite.minScale, 0),
    scaleBound(sprite.maxScale, NO_LIMIT),
    params?.[0] ?? 0,
    params?.[1] ?? 0,
    params?.[2] ?? 0,
    params?.[3] ?? 0
  );
}

/** The submitted rows that can produce animated pixels, in the current camera and style. */
export function visibleSpriteAnimation(
  data: Float32Array,
  first: number,
  count: number,
  elements: Float32Array,
  styles: Float32Array,
  frame: TSceneFrame
): boolean {
  const scale = Math.fround(frame.scale);
  const level = frame.level === undefined ? 0 : LEVEL_BIT[frame.level];
  for (let i = first * SPRITE_FLOATS; i < (first + count) * SPRITE_FLOATS; i += SPRITE_FLOATS) {
    if (!data[i + 9] || data[i + 8] <= 0 || scale < data[i + 10] || scale >= data[i + 11]) continue;
    if (level && Math.floor(data[i + 3] / level) % 2 === 0) continue;
    const el = data[i] * 4;
    if (elements[el + 2] < 0) continue;
    const slot = elements[el + 3] * STYLE_ROW_TEXELS + data[i + 2];
    if (styles[slot * 4 + 3] < -1.5) continue;
    const x = (elements[el] + data[i + 4]) * scale + frame.x;
    const y = (elements[el + 1] + data[i + 5]) * scale + frame.y;
    if (x < frame.width && y < frame.height && x + data[i + 6] * scale > 0 && y + data[i + 7] * scale > 0) return true;
  }
  return false;
}

export const SPRITE_VERTEX = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 scene_template;
layout(location = 1) in vec4 sprite_ids;
layout(location = 2) in vec4 sprite_box;
layout(location = 3) in vec4 sprite_style;
layout(location = 4) in vec4 sprite_params;
${SCENE_COMMON}
out vec2 sprite_uv;
flat out vec4 sprite_values;
flat out float sprite_opacity;
flat out float sprite_dim;
void main() {
  vec4 element = sceneElement(sprite_ids.x);
  if (sceneHidden(element.w, sprite_ids.z) || !sceneShown(element.z, sprite_style.z, sprite_style.w)
      || !sceneOnLevel(sprite_ids.w) || sprite_style.x <= 0.0) {
    gl_Position = SCENE_HIDDEN;
    return;
  }
  gl_Position = sceneClip(element.xy + sprite_box.xy + scene_template * sprite_box.zw, sceneDepth(element.z, sprite_ids.y));
  sprite_uv = scene_template;
  sprite_values = sprite_params;
  sprite_opacity = sprite_style.x;
  sprite_dim = sceneDim(element.w, sprite_ids.z);
}`;

export const SAMPLE_SPRITE =
  "vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params) { return texture(atlas, uv); }";

export function spriteFragment(effect: string): string {
  return `#version 300 es
precision highp float;
uniform sampler2D sprite_image;
uniform float scene_time;
uniform vec4 scene_dimColor;
in vec2 sprite_uv;
flat in vec4 sprite_values;
flat in float sprite_opacity;
flat in float sprite_dim;
out vec4 scene_fragColor;
${SCENE_OUTPUT}
${effect}
void main() {
  vec4 color = spriteColor(sprite_image, sprite_uv, scene_time, sprite_values);
  color.a *= sprite_opacity;
  if (color.a <= 0.0) discard;
  if (scene_dimColor.a >= 0.0) color.rgb = mix(color.rgb, scene_dimColor.rgb, sprite_dim);
  scene_fragColor = sceneOutput(color.rgb * color.a, color.a);
}`;
}
