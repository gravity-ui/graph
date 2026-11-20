/** Effect objects with one fragment text alive at once past which a warning is reported. */
const MAX_OBJECTS_PER_FRAGMENT = 64;

/** The part of `FinalizationRegistry` used here: an ES2021 global, past the package's ES2020 lib. */
interface IFinalizationRegistry<T> {
  register(target: object, held: T): void;
}

type TFinalizationRegistryConstructor = new <T>(cleanup: (held: T) => void) => IFinalizationRegistry<T>;

/** Effect objects alive per fragment text. */
const objectsPerFragment = new Map<string, number>();

const warnedFragments = new Set<string>();

/** An object leaves the count of its fragment when it is collected. */
function releaseObject(fragment: string): void {
  const count = (objectsPerFragment.get(fragment) ?? 0) - 1;
  if (count > 0) objectsPerFragment.set(fragment, count);
  else objectsPerFragment.delete(fragment);
}

/** The registry is created on the first development check, when the platform supports it. */
let collectedObjects: IFinalizationRegistry<string> | null | undefined;

/**
 * Counts the effect objects of a fragment alive at once, so an app that remounts graphs and clones an effect per
 * graph is not reported: many alive at once mean effects created per connection.
 */
export function countEffectObject(effect: object, fragment: string): void {
  if (collectedObjects === undefined) {
    const Registry = (globalThis as { FinalizationRegistry?: TFinalizationRegistryConstructor }).FinalizationRegistry;
    collectedObjects = typeof Registry === "function" ? new Registry<string>(releaseObject) : null;
  }
  collectedObjects?.register(effect, fragment);
  const count = (objectsPerFragment.get(fragment) ?? 0) + 1;
  objectsPerFragment.set(fragment, count);
  if (count > MAX_OBJECTS_PER_FRAGMENT && !warnedFragments.has(fragment)) {
    warnedFragments.add(fragment);
    console.warn(
      `[@gravity-ui/graph] More than ${MAX_OBJECTS_PER_FRAGMENT} connection effect objects with one fragment are ` +
        "alive. defineSceneEffect() or clone() is called per connection (inside getStroke()?): " +
        "define the effect once and pass per-connection values through use(params)."
    );
  }
}

const warnedParams = new WeakSet<object>();

export function warnTruncatedParams(effect: object, supplied: number, limit: number): void {
  if (warnedParams.has(effect)) return;
  warnedParams.add(effect);
  console.warn(
    `[@gravity-ui/graph] A connection effect got ${supplied} parameters; only the first ${limit} reach the shader.`
  );
}
