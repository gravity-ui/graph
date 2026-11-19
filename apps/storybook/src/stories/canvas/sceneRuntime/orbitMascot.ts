import { Layer, SceneComponent } from "@gravity-ui/graph";
import type { ChildDescriptor, Graph, LayerProps, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";
import { computed } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

const ink = "#173c50";
const shell = "#55d6c1";
const light = "#dcfff5";
const amber = "#ffb450";
const walkDistance = 120;
const footLift = 12;
// Includes the full stride and the outstretched hand at both ends of the walk.
export const orbitBounds = { x: -walkDistance / 2 - 24, y: -4, width: walkDistance + 208, height: 150 };

function rect(x: number, y: number, width: number, height: number, radius: number, fill: string): TScenePrimitive {
  return { kind: "rect", x, y, width, height, radius, fill };
}

function circle(cx: number, cy: number, r: number, fill: string): TScenePrimitive {
  return { kind: "circle", cx, cy, r, fill };
}

const portrait: readonly TScenePrimitive[] = [
  // Antenna and shoulder joints sit behind the hull.
  rect(82, 10, 5, 27, 2, ink),
  circle(84.5, 9, 9, ink),
  circle(84.5, 9, 6, amber),
  rect(0, 53, 23, 29, 10, ink),
  rect(125, 53, 23, 29, 10, ink),
  circle(146, 74, 10, ink),
  rect(12, 24, 124, 85, 30, ink),
  rect(16, 28, 116, 76, 27, shell),
  rect(31, 34, 28, 4, 2, light),
  // Faceplate, two luminous eyes and a small asymmetric smile.
  rect(25, 45, 98, 42, 18, ink),
  rect(41, 55, 10, 19, 5, light),
  rect(95, 55, 10, 19, 5, light),
  rect(65, 69, 13, 4, 2, shell),
  circle(78, 67.5, 2.5, shell),
  circle(110, 94, 3.2, ink),
  circle(110, 94, 1.8, amber),
];

const boot = [rect(-7, -26, 14, 28, 6, ink), rect(-14, -6, 29, 17, 7, ink), rect(-10, 3, 21, 4, 2, amber)];

const limbLooks = {
  leftBoot: boot,
  rightBoot: boot,
  leftHand: [rect(-6, -16, 12, 20, 5, ink), circle(0, 0, 10, ink), circle(0, 1, 6, shell)],
  rightForearm: [circle(0, 0, 9, ink)],
  rightHand: [
    rect(-10, -16, 6, 16, 3, ink),
    rect(-3, -19, 6, 19, 3, ink),
    rect(4, -15, 6, 15, 3, ink),
    circle(-9, -2, 5, ink),
    circle(0, 0, 11, ink),
    circle(0, 0, 7, shell),
    circle(0, 0, 3, amber),
  ],
};
type Limb = keyof typeof limbLooks;

function walkingPose(seconds: number) {
  const walkTime = 3;
  const waveTime = 2;
  const passTime = walkTime + waveTime;
  const stridesPerPass = 3;
  const t = seconds % passTime;
  const progress = Math.min(t / walkTime, 1);
  const along = Math.floor(seconds / passTime) % 2 === 0 ? progress : 1 - progress;
  const strides = along * stridesPerPass;
  const step = Math.sin(strides * 2 * Math.PI);
  // A planted boot travels backwards by exactly the distance the body moves during its half-stride.
  const stride = (walkDistance / (4 * stridesPerPass)) * (4 * Math.abs((strides % 1) - 0.5) - 1);
  const bob = -3 * Math.abs(step);
  const wave = Math.max(0, (t - walkTime) / waveTime);
  const raise = Math.min(1, wave * 5, (1 - wave) * 5);
  const angle = 0.3 + 0.15 * step + raise * (2.3 + 0.55 * Math.sin(wave * 5 * Math.PI));
  const reachX = 24 * Math.sin(angle);
  const reachY = 24 * Math.cos(angle);

  return {
    body: { x: (along - 0.5) * walkDistance, y: bob },
    leftBoot: { x: 42 + stride, y: 129 - bob - footLift * Math.max(0, -step) },
    rightBoot: { x: 104 - stride, y: 129 - bob - footLift * Math.max(0, step) },
    leftHand: { x: 2 - stride / 2, y: 88 - 2 * Math.abs(step) },
    rightForearm: { x: 146 + reachX / 2, y: 74 + reachY / 2 },
    rightHand: { x: 146 + reachX, y: 74 + reachY },
  };
}

type LimbProps = { limb: Limb; pose: ReadonlySignal<ReturnType<typeof walkingPose>> };

class OrbitLimb extends SceneComponent<object, TGraphComponentProps & LimbProps> {
  protected override schematic() {
    return limbLooks[this.props.limb];
  }

  protected override getSceneOrigin() {
    const body = super.getSceneOrigin();
    const offset = this.props.pose.value[this.props.limb];
    return { x: body.x + offset.x, y: body.y + offset.y };
  }

  // Decorative limbs let pointer events reach the graph underneath.
  protected override getHitRect() {
    return undefined;
  }
}

type OrbitProps = { elapsed: ReadonlySignal<number> };

class Orbit extends SceneComponent<object, TGraphComponentProps & OrbitProps> {
  public static override entityType = "mascot";
  private readonly pose = computed(() => walkingPose(this.props.elapsed.value));

  public override getEntityId(): string {
    return "orbit";
  }

  protected override getSceneOrigin() {
    return this.pose.value.body;
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return portrait;
  }

  protected override updateChildren(): ChildDescriptor[] {
    return (Object.keys(limbLooks) as Limb[]).map((limb) => OrbitLimb.create({ limb, pose: this.pose }, { key: limb }));
  }
}

export class OrbitLayer extends Layer<LayerProps & OrbitProps> {
  protected override updateChildren(): ChildDescriptor[] {
    return [Orbit.create({ elapsed: this.props.elapsed })];
  }
}

/** Advance only the origin signal, preserving the pose when the animation is paused. */
export function animateOrbit(graph: Graph, elapsed: Signal<number>): () => void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastTime = 0;
  let frame: number | undefined;

  function tick(): void {
    const now = graph.scene.clock.now();
    elapsed.value += now - lastTime;
    lastTime = now;
    frame = window.requestAnimationFrame(tick);
  }

  function sync(): void {
    const camera = graph.cameraService;
    const visibleMotion =
      footLift * camera.getCameraScale() >= 1 &&
      camera.isRectVisible(orbitBounds.x, orbitBounds.y, orbitBounds.width, orbitBounds.height);
    if (document.hidden || reducedMotion.matches || !visibleMotion) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    } else if (frame === undefined) {
      lastTime = graph.scene.clock.now();
      frame = window.requestAnimationFrame(tick);
    }
  }

  const offCamera = graph.$camera.subscribe(sync);
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", sync);
  return () => {
    offCamera();
    document.removeEventListener("visibilitychange", sync);
    reducedMotion.removeEventListener("change", sync);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };
}
