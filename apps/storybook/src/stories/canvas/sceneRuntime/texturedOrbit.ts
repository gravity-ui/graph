import { Layer, SceneComponent } from "@gravity-ui/graph";
import type { ChildDescriptor, Graph, LayerProps, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import { orbitBounds } from "./orbitMascot";

// Frames 0–31 hold one stride; frames 32–63 hold the greeting. UV starts at the top left.
const fragment = /* glsl */ `
vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params) {
  float t = mod(params.x + params.y * time, 10.0);
  float pass = mod(t, 5.0);
  bool returning = t >= 5.0;
  float progress = min(pass / 3.0, 1.0);
  float x = mix(-60.0, 60.0, returning ? 1.0 - progress : progress);
  float frame = pass < 3.0
    ? floor(fract(returning ? 3.0 - pass : pass) * 32.0)
    : 32.0 + floor((pass - 3.0) * 16.0);

  if (params.w > 0.5) {
    frame = 0.0;
    x = 0.0;
  }
  vec2 cellSize = vec2(textureSize(atlas, 0)) / 8.0;
  vec2 world = uv * vec2(${orbitBounds.width}, ${orbitBounds.height}) + vec2(${orbitBounds.x}, ${orbitBounds.y});
  vec2 pixel = world - vec2(x, 0.0) + vec2(20.0, 6.0);
  if (any(lessThan(pixel, vec2(0.0))) || any(greaterThanEqual(pixel, cellSize))) return vec4(0.0);

  vec2 cell = vec2(mod(frame, 8.0), floor(frame / 8.0));
  vec2 local = clamp(pixel, vec2(0.5), cellSize - 0.5) / cellSize;
  vec4 color = texture(atlas, (cell + local) / 8.0);
  float sweep = fract(t * 0.5) * 2.4 - 0.45;
  float gleam = 1.0 - smoothstep(0.025, 0.12, abs(local.x + local.y * 0.36 - sweep));
  color.rgb = mix(color.rgb, vec3(0.9, 1.0, 1.0), 0.65 * gleam * params.z * (1.0 - params.w));
  return color;
}`;

const playingEffect = { fragment, animated: true };
const stillEffect = { fragment };

export type SpriteParams = readonly [offset: number, playing: number, shimmer: number, overview: number];
type SpriteProps = { image: HTMLImageElement; playback: ReadonlySignal<SpriteParams> };
type SpriteElementProps = TGraphComponentProps & { image: HTMLImageElement; params: SpriteParams };

class TexturedOrbit extends SceneComponent<SpriteElementProps> {
  public static override entityType = "mascot";

  public override getEntityId() {
    return "orbit";
  }

  protected override schematic(): readonly TScenePrimitive[] {
    const { image, params } = this.props;
    return [{ kind: "sprite", ...orbitBounds, image, effect: params[1] ? playingEffect : stillEffect, params }];
  }
}

export class TexturedOrbitLayer extends Layer<LayerProps & SpriteProps> {
  protected override afterInit(): void {
    this.onSignal(this.props.playback, () => {
      this.shouldUpdateChildren = true;
      this.performRender();
    });
    super.afterInit();
  }

  protected override updateChildren(): ChildDescriptor[] {
    const { image, playback } = this.props;
    return [TexturedOrbit.create({ image, params: playback.peek() })];
  }
}

/** Change shader inputs only when a control or the visibility boundary changes. */
export function syncOrbitPlayback(graph: Graph, playback: Signal<SpriteParams>, animate: boolean, shimmer: boolean) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function sync(): void {
    const camera = graph.cameraService;
    const overview = Number(camera.getCameraScale() * 12 < 1);
    const visible = camera.isRectVisible(orbitBounds.x, orbitBounds.y, orbitBounds.width, orbitBounds.height);
    const playing = Number(animate && visible && !overview && !document.hidden && !reducedMotion.matches);
    const [offset, wasPlaying, oldShimmer, wasOverview] = playback.peek();
    if (playing === wasPlaying && Number(shimmer) === oldShimmer && overview === wasOverview) return;
    // Preserve the phase across a change between running clock time and a frozen offset.
    playback.value = [offset + (wasPlaying - playing) * graph.scene.clock.now(), playing, Number(shimmer), overview];
  }

  const offCamera = graph.$camera.subscribe(sync);
  reducedMotion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  return () => {
    offCamera();
    reducedMotion.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
  };
}
