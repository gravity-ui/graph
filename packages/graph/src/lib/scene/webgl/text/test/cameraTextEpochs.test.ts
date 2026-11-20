import type { TSceneLevel } from "../../../../../services/scene/types";
import { LEVEL_BIT } from "../../../levels";
import type { TScenePrimitive } from "../../../types";
import { CameraTextEpochs, textReachOf } from "../cameraTextEpochs";
import type { ICameraTextHost } from "../cameraTextEpochs";

type TText = Extract<TScenePrimitive, { kind: "text" }>;

function text(patch: Partial<TText> = {}): TText {
  return {
    kind: "text",
    text: "Load",
    family: "f",
    size: 9,
    cameraAware: true,
    lineHeight: 9,
    x: 0,
    y: 0,
    width: 100,
    ...patch,
  };
}

/**
 * A host over a few elements: each draws unless hidden, shows its texts on the levels and scales of its texts, and
 * records each refresh. `refreshed()` takes the refreshes since the last call.
 */
function host(texts: Record<string, readonly TText[]>): ICameraTextHost & {
  hidden: Set<string>;
  refreshed(): string[];
  asked: number;
} {
  const refreshes: string[] = [];
  const result = {
    hidden: new Set<string>(),
    asked: 0,
    isDrawn(id: string): boolean {
      result.asked++;
      return !result.hidden.has(id);
    },
    showsTexts(id: string, scale: number, level: TSceneLevel | undefined): boolean {
      return (texts[id] ?? []).some(
        (primitive) =>
          primitive.cameraAware &&
          scale >= (primitive.minScale ?? 0) &&
          scale < (primitive.maxScale ?? Infinity) &&
          (level === undefined ||
            primitive.levelMask === undefined ||
            Math.floor(primitive.levelMask / LEVEL_BIT[level]) % 2 === 1)
      );
    },
    refresh(id: string): void {
      refreshes.push(id);
    },
    refreshed(): string[] {
      return refreshes.splice(0).sort();
    },
  };
  return result;
}

/** A frame of an 800 x 600 view whose top-left world point is (`left`, `top`) at `scale`. */
function frame(
  epochs: CameraTextEpochs,
  left: number,
  top: number,
  scale = 1,
  level?: TSceneLevel,
  cameraAware = true
): void {
  epochs.check(-left * scale, -top * scale, 800, 600, scale, level, cameraAware);
}

describe("CameraTextEpochs", () => {
  it("refreshes the elements in view once per epoch, and those a pan brings into view", () => {
    const texts = { a: [text()], b: [text()], far: [text()] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("a", texts.a, 10, 10, 110, 40);
    epochs.track("b", texts.b, 500, 300, 600, 340);
    epochs.track("far", texts.far, 5000, 10, 5100, 40);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual(["a", "b"]);
    expect(epochs.stale).toBe(1);
    // The same view and scale: nothing is asked.
    owner.asked = 0;
    frame(epochs, 0, 0);
    expect(owner.asked).toBe(0);
    expect(owner.refreshed()).toEqual([]);
    // A pan within the epoch reaches `far` only.
    frame(epochs, 4600, 0);
    expect(owner.refreshed()).toEqual(["far"]);
    expect(epochs.stale).toBe(0);
    // A zoom starts an epoch: what is in view is refreshed again.
    frame(epochs, 4600, 0, 0.5);
    expect(owner.refreshed()).toEqual(["far"]);
    expect(epochs.stale).toBe(2);
  });

  it("checks an element that moves into the view while the camera stays", () => {
    const texts = { moving: [text()] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("moving", texts.moving, 2000, 10, 2100, 40);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual([]);
    expect(epochs.stale).toBe(1);
    epochs.move("moving", 100, 10, 200, 40);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual(["moving"]);
    expect(epochs.stale).toBe(0);
    // Moving out and back within the epoch: decided already, nothing to refresh.
    epochs.move("moving", 3000, 10, 3100, 40);
    epochs.move("moving", 120, 10, 220, 40);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual([]);
  });

  it("checks a text shown again after being hidden, itself or through its owner", () => {
    const texts = { self: [text()], child: [text()] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("self", texts.self, 10, 10, 110, 40);
    epochs.track("child", texts.child, 10, 100, 110, 140);
    owner.hidden.add("self");
    owner.hidden.add("child");
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual([]);
    expect(epochs.stale).toBe(2);
    // Without a word from the backend, the same frame checks nothing.
    owner.hidden.delete("self");
    owner.hidden.delete("child");
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual([]);
    // Shown again: by its own hidden flag, and by its owner's (the backend tells each child).
    epochs.showAgain("self");
    epochs.showAgain("child");
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual(["child", "self"]);
    expect(epochs.stale).toBe(0);
    // Unknown elements are ignored.
    epochs.showAgain("missing");
    epochs.move("missing", 0, 0, 1, 1);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual([]);
  });

  it("checks nothing on a frame no camera-aware text can show at, then what a frame that can shows", () => {
    // Names on the schematic and detailed levels from scale 0.125 on.
    const name = text({ minScale: 0.125, levelMask: LEVEL_BIT.schematic + LEVEL_BIT.detailed });
    const texts = { a: [name], b: [name] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("a", texts.a, 10, 10, 110, 40);
    epochs.track("b", texts.b, 300, 10, 400, 40);
    // The minimalistic level: no text can show; pans and zooms ask nothing.
    owner.asked = 0;
    frame(epochs, 0, 0, 0.5, "minimalistic");
    frame(epochs, 20, 0, 0.5, "minimalistic");
    frame(epochs, 20, 0, 0.6, "minimalistic");
    expect(owner.asked).toBe(0);
    expect(epochs.stale).toBe(2);
    // Below every text's minScale on a level they show on: nothing either.
    frame(epochs, 0, 0, 0.1, "schematic");
    expect(owner.asked).toBe(0);
    // The level change to one they show on refreshes both.
    frame(epochs, 0, 0, 0.5, "schematic");
    expect(owner.refreshed()).toEqual(["a", "b"]);
    // A level change starts an epoch: they are checked again.
    frame(epochs, 0, 0, 0.5, "detailed");
    expect(owner.refreshed()).toEqual(["a", "b"]);
    // So does the policy.
    frame(epochs, 0, 0, 0.5, "detailed", false);
    expect(owner.refreshed()).toEqual(["a", "b"]);
  });

  it("passes the elements whose texts are off the epoch's scale or level, and asks them in the next epoch", () => {
    const texts = { name: [text({ levelMask: LEVEL_BIT.detailed })], badge: [text({ maxScale: 0.5 })] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("name", texts.name, 10, 10, 110, 40);
    epochs.track("badge", texts.badge, 10, 100, 110, 140);
    // At 0.6 on the schematic level neither shows: both passed, both stale.
    frame(epochs, 0, 0, 0.6, "schematic");
    expect(owner.refreshed()).toEqual([]);
    expect(epochs.stale).toBe(2);
    // Passed: a pan within the epoch does not ask them again.
    owner.asked = 0;
    frame(epochs, 5, 5, 0.6, "schematic");
    expect(owner.asked).toBe(0);
    frame(epochs, 0, 0, 0.6, "detailed");
    expect(owner.refreshed()).toEqual(["name"]);
    expect(epochs.stale).toBe(1);
    frame(epochs, 0, 0, 0.4, "detailed");
    expect(owner.refreshed()).toEqual(["badge", "name"]);
    expect(epochs.stale).toBe(0);
  });

  it("keeps its counts through tracking, new reaches, forgetting and resets", () => {
    const texts: Record<string, TText[]> = { a: [text()], b: [text()] };
    const owner = host(texts);
    const epochs = new CameraTextEpochs(owner);
    epochs.track("a", texts.a, 10, 10, 110, 40);
    epochs.track("b", texts.b, 10, 100, 110, 140);
    frame(epochs, 0, 0);
    expect(owner.refreshed()).toEqual(["a", "b"]);
    expect(epochs.stale).toBe(0);
    // The same reach: still decided. Another reach: undecided again, and the next walk of the view refreshes it.
    epochs.track("a", [text({ text: "other" })], 10, 10, 110, 40);
    expect(epochs.stale).toBe(0);
    epochs.track("a", [text({ maxScale: 2 })], 10, 10, 110, 40);
    expect(epochs.stale).toBe(1);
    frame(epochs, 1, 0);
    expect(owner.refreshed()).toEqual(["a"]);
    // A new element in this epoch counts as stale until a frame decides it.
    epochs.track("c", [text()], 10, 200, 110, 240);
    expect(epochs.stale).toBe(1);
    epochs.forget("c");
    epochs.forget("c");
    expect(epochs.stale).toBe(0);
    expect(epochs.size).toBe(2);
    epochs.reset();
    expect([epochs.size, epochs.stale]).toEqual([0, 0]);
    owner.asked = 0;
    frame(epochs, 0, 0);
    expect(owner.asked).toBe(0);
  });

  it("tells where an element's camera-aware texts can show, and keeps the object when that is unchanged", () => {
    const world: TText = text({ cameraAware: undefined, levelMask: LEVEL_BIT.minimalistic });
    const reach = textReachOf([world, text({ minScale: 0.2, levelMask: LEVEL_BIT.detailed }), text({ maxScale: 1 })]);
    expect(reach).toEqual({ levelMask: 7, minScale: 0, maxScale: Infinity });
    expect(textReachOf([text({ minScale: 0.2, levelMask: LEVEL_BIT.detailed })])).toEqual({
      levelMask: LEVEL_BIT.detailed,
      minScale: 0.2,
      maxScale: Infinity,
    });
    expect(textReachOf([text(), text({ maxScale: 1 })], reach)).toBe(reach);
  });
});
