import { LEVEL_BIT } from "../../lib/scene/levels";
import type { TSceneElement, TScenePrimitive, TSceneStyle } from "../../lib/scene/types";

import { blockOutlineShape } from "./blockOutlineShape";

function element(id: string, x: number, y: number, primitives: TScenePrimitive[]): TSceneElement {
  return {
    id,
    x,
    y,
    primitives,
    styleId: 0,
    order: 1,
    childOrder: 0,
    zIndex: 0,
    hidden: false,
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
  };
}

const body = element("block", 200, 100, [
  { kind: "rect", part: "halo", x: -10, y: -10, width: 120, height: 70, fill: "#f00" },
  { kind: "rect", part: "body", x: 3, y: 4, width: 100, height: 50, fill: "#eee" },
  {
    kind: "rect",
    part: "border",
    x: 3,
    y: 4,
    width: 100,
    height: 50,
    border: { color: "#333", width: { px: 2 }, align: "inside" },
  },
]);
const plain = () => undefined;

describe("blockOutlineShape", () => {
  it("selects the visible body and expresses the styled anchor silhouette in its coordinates", () => {
    const anchor = element("anchor", 203, 127, [
      { kind: "circle", part: "anchor", cx: 0, cy: 2, r: 5 },
      { kind: "circle", part: "border", cx: 0, cy: 2, r: 5, border: { width: 2 } },
      { kind: "circle", part: "decoration", cx: 1, cy: 5, r: 50, fill: "#fff0" },
    ]);
    const style: TSceneStyle = {
      base: { anchor: { color: "#eee" }, border: { color: "#111", visible: false } },
      parts: { anchor: { scale: 1.8 }, border: { visible: true, scale: 1.8 } },
    };
    const read = (e: TSceneElement) => (e === anchor ? style : undefined);
    expect(blockOutlineShape(body, [anchor], "schematic", 0.5, read)).toEqual({
      x: 3,
      y: 4,
      width: 100,
      height: 50,
      circles: [{ x: 0, y: 25, r: 10 }],
      scaleDependent: false,
    });
    expect(blockOutlineShape(body, [anchor], "schematic", 0.5, () => ({ opacity: 0 }))).toBeUndefined();
  });

  it("tracks camera-dependent rings and visibility thresholds only for this level", () => {
    const anchor = element("a", 203, 104, [
      { kind: "circle", cx: 0, cy: 0, r: 4, fill: "#fff" },
      {
        kind: "circle",
        cx: 0,
        cy: 0,
        r: 4,
        border: { color: "#111", width: { px: 2 }, align: "outside" },
        minScale: 0.4,
        maxScale: 1,
        levelMask: LEVEL_BIT.schematic,
      },
      { kind: "circle", cx: 0, cy: 0, r: 40, fill: "#0f00", minScale: 0.4 },
    ]);
    const shape = (level: "schematic" | "detailed", scale: number) =>
      blockOutlineShape(body, [anchor], level, scale, plain);
    expect(shape("schematic", 0.2)).toMatchObject({ circles: [{ r: 4 }], scaleDependent: true });
    expect(shape("schematic", 0.4)).toMatchObject({ circles: [{ r: 9 }], scaleDependent: true });
    expect(shape("schematic", 1)).toMatchObject({ circles: [{ r: 4 }] });
    expect(shape("detailed", 0.5)).toMatchObject({ circles: [{ r: 4 }], scaleDependent: false });
  });

  it("uses the rectangle border when it is the only painted face and accounts for its outer stroke", () => {
    const block = element("b", 0, 0, [
      { kind: "rect", part: "body", x: 0, y: 0, width: 100, height: 50, fill: "#0000" },
      {
        kind: "rect",
        part: "border",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        border: { color: "#111", width: 4, align: "outside" },
      },
    ]);
    expect(blockOutlineShape(block, [], "schematic", 1, plain)).toEqual({
      x: -4,
      y: -4,
      width: 108,
      height: 58,
      circles: [],
      scaleDependent: false,
    });
    expect(
      blockOutlineShape(block, [], "schematic", 1, () => ({ parts: { border: { visible: false } } }))
    ).toBeUndefined();
  });
});
