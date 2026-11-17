import { dashFlow, pulse } from "../../components/canvas/connections/effects";

import {
  applyStyle,
  bakeElementStyle,
  composeChildStyle,
  ignoresCameraAware,
  inheritsElementStyle,
  styleDim,
  styleEncodeKey,
  styleGeometryKey,
  styleLookKey,
  styleOpacity,
  styleRaise,
} from "./style";
import type { TScenePrimitive, TSceneStyle } from "./types";

const body: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10, part: "body" };
const border: TScenePrimitive = {
  kind: "rect",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  part: "border",
  border: { width: 2 },
};
const dot: TScenePrimitive = { kind: "circle", cx: 0, cy: 0, r: 4, fill: "#111111", part: "anchor" };

describe("path effects", () => {
  const path: TScenePrimitive = {
    kind: "path",
    part: "line",
    segments: new Float32Array(8),
    stroke: { color: "#f00", width: 2, dash: [3, 4] },
  };
  const flow = dashFlow.use({ pattern: [12, 8], speed: 40 });
  const own = pulse.use({ period: 2, wavelength: 20 });

  it("bakes a named part's effect for WebGL while Canvas uses the styled stroke", () => {
    const style = { parts: { line: { effect: flow, color: "rgba(0, 255, 0, 0.5)" } }, opacity: 0.5 };
    const [baked, untouched] = bakeElementStyle([path, dot], style);
    expect(baked).toMatchObject({
      effect: flow,
      stroke: { color: "rgba(0, 255, 0, 0.25)", width: 2, dash: [3, 4] },
    });
    expect(untouched).not.toHaveProperty("effect");
    expect(applyStyle(path, style)).toMatchObject({
      stroke: { color: "rgba(0, 255, 0, 0.25)", width: 2, dash: [3, 4] },
    });
    expect(applyStyle(path, style)).not.toHaveProperty("effect");
    expect(path).not.toHaveProperty("effect");
  });

  it("uses the base effect only for an unset path effect and lets a tag override or disable it", () => {
    const base = { line: { effect: flow } };
    const alreadyAnimated = { ...path, effect: own };
    expect(bakeElementStyle([path], { base })[0]).toMatchObject({ effect: flow });
    expect(bakeElementStyle([alreadyAnimated], { base })[0]).toBe(alreadyAnimated);
    expect(bakeElementStyle([alreadyAnimated], { base, parts: { line: { effect: flow } } })[0]).toMatchObject({
      effect: flow,
    });
    expect(bakeElementStyle([alreadyAnimated], { base, parts: { line: { effect: null } } })[0]).toMatchObject({
      effect: undefined,
    });
  });

  it("keeps reused effect instances equal and tracks changes in their parameters or identity", () => {
    const look = { parts: { line: { effect: flow } } };
    const same = { parts: { line: { effect: dashFlow.use({ pattern: [12, 8], speed: 40 }) } } };
    const faster = { parts: { line: { effect: dashFlow.use({ pattern: [12, 8], speed: 60 }) } } };
    const clone = { parts: { line: { effect: dashFlow.clone().use({ pattern: [12, 8], speed: 40 }) } } };
    for (const key of [styleEncodeKey, styleLookKey]) {
      expect(key(look)).toBe(key(same));
      expect(key(look)).not.toBe(key(faster));
      expect(key(look)).not.toBe(key(clone));
      expect(key(look)).not.toBe(key({}));
    }
  });
});

describe("applyStyle", () => {
  it("fills unset paints from base and leaves set ones", () => {
    const style: TSceneStyle = { base: { body: { color: "#222222" }, anchor: { color: "#333333" } } };
    expect(applyStyle(body, style)).toMatchObject({ fill: "#222222" });
    expect(applyStyle(dot, style)).toMatchObject({ fill: "#111111" });
  });

  it("overrides set paints, widths and circle radii from parts", () => {
    const style: TSceneStyle = {
      parts: { border: { color: "#ffcc00", width: 3 }, anchor: { color: "#ffffff", scale: 1.8 } },
    };
    expect(applyStyle(border, style)).toMatchObject({ border: { color: "#ffcc00", width: 3 } });
    expect(applyStyle(dot, style)).toMatchObject({ fill: "#ffffff", r: 4 * 1.8 });
  });

  it("hides primitives of an invisible part", () => {
    expect(applyStyle(dot, { parts: { anchor: { visible: false } } })).toBeUndefined();
  });

  it("override wins over base", () => {
    const style: TSceneStyle = { base: { body: { color: "#000001" } }, parts: { body: { color: "#000002" } } };
    expect(applyStyle(body, style)).toMatchObject({ fill: "#000002" });
  });

  it("hides a part by base visible: false, and a state rule's visible: true shows it again", () => {
    const titled: TScenePrimitive = {
      kind: "text",
      text: "A",
      family: "sans",
      size: 12,
      lineHeight: 14,
      x: 0,
      y: 0,
      width: 40,
      part: "title",
      color: "#000000",
    };
    expect(applyStyle(titled, { base: { title: { visible: false } } })).toBeUndefined();
    expect(applyStyle(titled, { base: { title: { visible: false } }, parts: { title: { visible: true } } })).toBe(
      titled
    );
    expect(applyStyle(titled, { base: { title: { visible: true } }, parts: { title: { visible: false } } })).toBe(
      undefined
    );
  });

  it("scales circles by the base scale unless the override sets one", () => {
    expect(applyStyle(dot, { base: { anchor: { scale: 2 } } })).toMatchObject({ r: 8 });
    expect(applyStyle(dot, { base: { anchor: { scale: 2 } }, parts: { anchor: { scale: 3 } } })).toMatchObject({
      r: 12,
    });
  });

  it("fills an unset stroke width from base and keeps a set one", () => {
    const bare: TScenePrimitive = { ...border, border: { color: "#000000" } };
    expect(applyStyle(bare, { base: { border: { width: 3 } } })).toMatchObject({ border: { width: 3 } });
    expect(applyStyle(border, { base: { border: { width: 3 } } })).toMatchObject({ border: { width: 2 } });
    expect(applyStyle(border, { base: { border: { width: 3 } }, parts: { border: { width: 5 } } })).toMatchObject({
      border: { width: 5 },
    });
    const path: TScenePrimitive = { kind: "path", part: "line", segments: new Float32Array(8), stroke: {} };
    expect(applyStyle(path, { base: { line: { width: 1.5 } } })).toMatchObject({ stroke: { width: 1.5 } });
    const polygon: TScenePrimitive = { kind: "polygon", part: "arrow", points: new Float32Array(6), stroke: {} };
    expect(applyStyle(polygon, { base: { arrow: { width: 1 } } })).toMatchObject({ stroke: { width: 1 } });
  });
});

describe("encode key and raise", () => {
  it("differs for width, scale and translucent colours, not for opaque colour changes", () => {
    const a = styleEncodeKey({ parts: { border: { color: "#ff0000" } } });
    const b = styleEncodeKey({ parts: { border: { color: "#00ff00" } } });
    const c = styleEncodeKey({ parts: { border: { color: "rgba(0, 255, 0, 0.5)" } } });
    const d = styleEncodeKey({ parts: { border: { width: 4 } } });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(d).not.toBe(a);
  });

  it("keys the geometry a row changes: circle scales and stroke widths, nothing else", () => {
    expect(styleGeometryKey(undefined)).toBe("");
    expect(styleGeometryKey({ parts: { border: { color: "#f00" } }, raise: 1 })).toBe("");
    const scaled = styleGeometryKey({ parts: { anchor: { scale: 1.8, color: "#f00" } } });
    expect(scaled).not.toBe("");
    expect(styleGeometryKey({ parts: { anchor: { scale: 1.8, color: "#0f0" } } })).toBe(scaled);
    expect(styleGeometryKey({ parts: { anchor: { scale: 2 } } })).not.toBe(scaled);
    expect(styleGeometryKey({ base: { border: { width: 4 } } })).not.toBe("");
  });

  it("keys a row's look by its content", () => {
    const red = (): { parts: { body: { color: string } } } => ({ parts: { body: { color: "#f00" } } });
    expect(styleLookKey(red())).toBe(styleLookKey(red()));
    expect(styleLookKey(red())).not.toBe(styleLookKey({ parts: { body: { color: "#0f0" } } }));
    expect(styleLookKey(undefined)).toBe(styleLookKey({}));
  });

  it("keys a row's look whatever the order of its properties and parts", () => {
    expect(styleLookKey({ parts: { body: { color: "#ff0000", visible: true } } })).toBe(
      styleLookKey({ parts: { body: { visible: true, color: "#ff0000" } } })
    );
    expect(styleLookKey({ parts: { body: { width: 2 }, title: { width: 1 } }, raise: 1 })).toBe(
      styleLookKey({ raise: 1, parts: { title: { width: 1 }, body: { width: 2 } } })
    );
    expect(styleLookKey({ base: { border: { width: { px: 2, maxWorld: 4 } } } })).toBe(
      styleLookKey({ base: { border: { width: { maxWorld: 4, px: 2 } } } })
    );
    // Undefined values and empty objects draw nothing.
    expect(styleLookKey({ parts: {}, raise: undefined })).toBe(styleLookKey({}));
    expect(styleLookKey({ parts: { body: {} }, dim: 0.5 })).toBe(styleLookKey({ dim: 0.5 }));
    expect(styleLookKey({ parts: { body: { width: 2 } } })).not.toBe(styleLookKey({ parts: { title: { width: 2 } } }));
  });

  it("raise defaults to 0", () => {
    expect(styleRaise(undefined)).toBe(0);
    expect(styleRaise({ raise: 1 })).toBe(1);
  });

  it("bakeElementStyle returns the same array when the style has no element properties", () => {
    const primitives = [body, dot];
    expect(bakeElementStyle(primitives, { parts: { body: { color: "#ff0000" } } })).toBe(primitives);
    const baked = bakeElementStyle(primitives, { parts: { anchor: { scale: 2 } } });
    expect(baked).not.toBe(primitives);
    expect(baked[1]).toMatchObject({ r: 8 });
  });

  it("bakes the base width into an unset width and the base scale unless the override sets one", () => {
    const bare: TScenePrimitive = { ...border, border: {} };
    const baked = bakeElementStyle([bare, dot], {
      base: { border: { width: 3 }, anchor: { scale: 2 } },
      parts: { anchor: { scale: 3 } },
    });
    expect(baked[0]).toMatchObject({ border: { width: 3 } });
    expect(baked[1]).toMatchObject({ r: 12 });
    expect(bakeElementStyle([dot], { base: { anchor: { scale: 2 } } })[0]).toMatchObject({ r: 8 });
  });

  it("keeps visible out of the encode key: it is a table property", () => {
    expect(styleEncodeKey({ base: { title: { visible: false } } })).toBe(styleEncodeKey({}));
    expect(styleEncodeKey({ parts: { title: { visible: false } } })).toBe(styleEncodeKey({}));
    expect(styleEncodeKey({ base: { border: { width: 2 } } })).not.toBe(styleEncodeKey({}));
    expect(styleEncodeKey({ base: { anchor: { scale: 2 } } })).not.toBe(styleEncodeKey({}));
  });

  it("keeps dim out of the encode key and out of the baked primitives: it is a table property", () => {
    const dimmed: TSceneStyle = { dim: 0.5, base: { body: { dim: 0.2 } }, parts: { anchor: { dim: 0.7 } } };
    expect(styleEncodeKey(dimmed)).toBe(styleEncodeKey({}));
    const primitives = [body, dot];
    expect(bakeElementStyle(primitives, dimmed)).toBe(primitives);
  });
});

describe("dim", () => {
  const DIM = "#ffffff";
  const black: TScenePrimitive = { ...body, fill: "#000000" };
  const framed: TScenePrimitive = { ...border, fill: "#000000", border: { color: "#000000", width: 2 } };
  const title: TScenePrimitive = {
    kind: "text",
    text: "A",
    family: "sans",
    size: 12,
    lineHeight: 14,
    x: 0,
    y: 0,
    width: 40,
    color: "#000000",
    part: "title",
  };

  it("moves every paint of the primitive towards the dim colour by its part's dim, keeping alpha", () => {
    const style: TSceneStyle = { parts: { border: { dim: 0.5 }, title: { dim: 0.5 } } };
    expect(applyStyle(framed, style, DIM)).toMatchObject({
      fill: "rgba(128, 128, 128, 1)",
      border: { color: "rgba(128, 128, 128, 1)", width: 2 },
    });
    expect(applyStyle(title, style, DIM)).toMatchObject({ color: "rgba(128, 128, 128, 1)" });
    const glass: TScenePrimitive = { ...black, fill: "rgba(0, 0, 0, 0.5)" };
    expect(applyStyle(glass, { parts: { body: { dim: 0.5 } } }, DIM)).toMatchObject({
      fill: "rgba(128, 128, 128, 0.5)",
    });
    const path: TScenePrimitive = {
      kind: "path",
      part: "line",
      segments: new Float32Array(8),
      stroke: { color: "#000000", width: 1 },
    };
    expect(applyStyle(path, { dim: 1 }, DIM)).toMatchObject({ stroke: { color: "rgba(255, 255, 255, 1)", width: 1 } });
  });

  it("takes the part's dim over the base dim over the element dim", () => {
    const element = { dim: 0.25 };
    expect(applyStyle(black, element, DIM)).toMatchObject({ fill: "rgba(64, 64, 64, 1)" });
    expect(applyStyle(black, { ...element, base: { body: { dim: 0.5 } } }, DIM)).toMatchObject({
      fill: "rgba(128, 128, 128, 1)",
    });
    expect(
      applyStyle(black, { ...element, base: { body: { dim: 0.5 } }, parts: { body: { dim: 1 } } }, DIM)
    ).toMatchObject({ fill: "rgba(255, 255, 255, 1)" });
    // A part's own dim: 0 keeps its paints while the element is dimmed.
    expect(applyStyle(black, { ...element, parts: { body: { dim: 0 } } }, DIM)).toMatchObject({ fill: "#000000" });
  });

  it("dims a primitive without a part by the element dim", () => {
    const unparted: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#000000" };
    expect(applyStyle(unparted, { dim: 0.5, parts: { body: { dim: 1 } } }, DIM)).toMatchObject({
      fill: "rgba(128, 128, 128, 1)",
    });
  });

  it("dims after the base fill and the override", () => {
    expect(
      applyStyle(body, { base: { body: { color: "#000000" } }, parts: { body: { dim: 0.5 } } }, DIM)
    ).toMatchObject({ fill: "rgba(128, 128, 128, 1)" });
    expect(applyStyle(body, { parts: { body: { color: "#000000", dim: 0.5 } } }, DIM)).toMatchObject({
      fill: "rgba(128, 128, 128, 1)",
    });
  });

  it("leaves colours unchanged with dim 0 or without a dim colour", () => {
    expect(applyStyle(black, { dim: 0 }, DIM)).toBe(black);
    expect(applyStyle(black, { dim: 0.5 })).toBe(black);
  });

  it("dims named and hsl() paints, and towards a named dim colour, as WebGL does (DOM fallback)", () => {
    expect(applyStyle({ ...black, fill: "red" }, { dim: 0.5 }, DIM)).toMatchObject({ fill: "rgba(255, 128, 128, 1)" });
    expect(applyStyle({ ...black, fill: "hsl(120, 100%, 25%)" }, { dim: 0.5 }, DIM)).toMatchObject({
      fill: "rgba(128, 192, 128, 1)",
    });
    expect(applyStyle(black, { dim: 0.5 }, "white")).toMatchObject({ fill: "rgba(128, 128, 128, 1)" });
  });

  it("keeps an empty fill empty: it paints nothing", () => {
    expect(applyStyle({ ...black, fill: "" }, { dim: 0.5 }, DIM)).toMatchObject({ fill: "" });
  });

  it("clamps dim to [0, 1]", () => {
    expect(applyStyle(black, { dim: 3 }, DIM)).toMatchObject({ fill: "rgba(255, 255, 255, 1)" });
    expect(applyStyle(black, { dim: -1 }, DIM)).toBe(black);
    expect(styleDim({ dim: 3 }, undefined)).toBe(1);
    expect(styleDim({ dim: Number.NaN }, undefined)).toBe(0);
    expect(styleDim({ dim: 0.5, parts: { body: { dim: -2 } } }, "body")).toBe(0);
    expect(styleDim(undefined, "body")).toBe(0);
  });
});

describe("opacity", () => {
  const black: TScenePrimitive = { ...body, fill: "#000000" };
  const framed: TScenePrimitive = { ...border, fill: "#000000", border: { color: "#ffffff", width: 2 } };
  const title: TScenePrimitive = {
    kind: "text",
    text: "A",
    family: "sans",
    size: 12,
    lineHeight: 14,
    x: 0,
    y: 0,
    width: 40,
    color: "#000000",
    part: "title",
  };
  const line: TScenePrimitive = {
    kind: "path",
    part: "line",
    segments: new Float32Array(8),
    stroke: { color: "#0000ff", width: 1 },
  };
  const arrow: TScenePrimitive = {
    kind: "polygon",
    part: "arrow",
    points: new Float32Array(6),
    fill: "#00ff00",
    stroke: { color: "#ff0000", width: 1 },
  };

  it("multiplies the alpha of every paint of the primitive, data colours included", () => {
    const style: TSceneStyle = { opacity: 0.5 };
    expect(applyStyle(framed, style)).toMatchObject({
      fill: "rgba(0, 0, 0, 0.5)",
      border: { color: "rgba(255, 255, 255, 0.5)", width: 2 },
    });
    expect(applyStyle(title, style)).toMatchObject({ color: "rgba(0, 0, 0, 0.5)" });
    expect(applyStyle(line, style)).toMatchObject({ stroke: { color: "rgba(0, 0, 255, 0.5)", width: 1 } });
    expect(applyStyle(arrow, style)).toMatchObject({
      fill: "rgba(0, 255, 0, 0.5)",
      stroke: { color: "rgba(255, 0, 0, 0.5)" },
    });
    expect(applyStyle({ ...black, fill: "rgba(0, 0, 0, 0.5)" }, style)).toMatchObject({ fill: "rgba(0, 0, 0, 0.25)" });
  });

  it("multiplies the element's opacity by the part's, a state value winning over a base one", () => {
    expect(styleOpacity({ opacity: 0.5 }, "body")).toBe(0.5);
    expect(styleOpacity({ opacity: 0.5, base: { body: { opacity: 0.5 } } }, "body")).toBe(0.25);
    expect(
      styleOpacity({ opacity: 0.5, base: { body: { opacity: 0.5 } }, parts: { body: { opacity: 0.8 } } }, "body")
    ).toBe(0.4);
    expect(styleOpacity({ parts: { body: { opacity: 0.3 } } }, "body")).toBe(0.3);
    // A part's opacity 1 does not undo the element's: the two multiply.
    expect(styleOpacity({ opacity: 0.5, parts: { body: { opacity: 1 } } }, "body")).toBe(0.5);
    expect(applyStyle(black, { opacity: 0.5, parts: { body: { opacity: 0.5 } } })).toMatchObject({
      fill: "rgba(0, 0, 0, 0.25)",
    });
  });

  it("fades a primitive without a part by the element's opacity only", () => {
    const unparted: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#000000" };
    expect(styleOpacity({ opacity: 0.5, parts: { body: { opacity: 0.1 } } }, undefined)).toBe(0.5);
    expect(applyStyle(unparted, { opacity: 0.5, parts: { body: { opacity: 0.1 } } })).toMatchObject({
      fill: "rgba(0, 0, 0, 0.5)",
    });
  });

  it("fills an unset paint from the base colour before fading, and fades an override", () => {
    const style: TSceneStyle = { opacity: 0.5, base: { body: { color: "#ff0000" } } };
    expect(applyStyle(body, style)).toMatchObject({ fill: "rgba(255, 0, 0, 0.5)" });
    expect(bakeElementStyle([body], style)[0]).toMatchObject({ fill: "rgba(255, 0, 0, 0.5)" });
    const override: TSceneStyle = { opacity: 0.5, parts: { border: { color: "#00ff00" } } };
    expect(applyStyle(border, override)).toMatchObject({ border: { color: "rgba(0, 255, 0, 0.5)", width: 2 } });
    expect(bakeElementStyle([border], override)[0]).toMatchObject({ border: { color: "rgba(0, 255, 0, 0.5)" } });
  });

  it("bakes every paint of a faded primitive and leaves the others and an unset paint without a base colour", () => {
    const baked = bakeElementStyle([framed, body, title], { parts: { border: { opacity: 0.5 } } });
    expect(baked[0]).toMatchObject({ fill: "rgba(0, 0, 0, 0.5)", border: { color: "rgba(255, 255, 255, 0.5)" } });
    expect(baked[1]).toBe(body);
    expect(baked[2]).toBe(title);
    const unset = bakeElementStyle([body], { opacity: 0.5 })[0];
    expect(unset.kind === "rect" && unset.fill).toBeUndefined();
  });

  it("fades named and hsl() paints as WebGL does (DOM fallback)", () => {
    expect(applyStyle({ ...black, fill: "red" }, { opacity: 0.4 })).toMatchObject({ fill: "rgba(255, 0, 0, 0.4)" });
    expect(applyStyle({ ...black, fill: "hsl(120, 100%, 25%)" }, { opacity: 0.5 })).toMatchObject({
      fill: "rgba(0, 128, 0, 0.5)",
    });
  });

  it("combines with dim: dim moves the rgb, opacity the alpha", () => {
    expect(applyStyle(black, { opacity: 0.5, dim: 0.5 }, "#ffffff")).toMatchObject({
      fill: "rgba(128, 128, 128, 0.5)",
    });
  });

  it("clamps opacity to [0, 1]; 1, NaN and no opacity change nothing", () => {
    expect(applyStyle(black, { opacity: 1 })).toBe(black);
    expect(applyStyle(black, { opacity: 3 })).toBe(black);
    expect(applyStyle(black, { opacity: Number.NaN })).toBe(black);
    expect(applyStyle(black, { opacity: -1 })).toMatchObject({ fill: "rgba(0, 0, 0, 0)" });
    expect(styleOpacity({ opacity: 3 }, undefined)).toBe(1);
    expect(styleOpacity({ opacity: -1 }, undefined)).toBe(0);
    expect(styleOpacity({ parts: { body: { opacity: 2 } } }, "body")).toBe(1);
    expect(styleOpacity(undefined, "body")).toBe(1);
  });

  it("changes the encode key when an opacity below 1 changes, and keeps it for 1", () => {
    const none = styleEncodeKey({});
    expect(styleEncodeKey({ opacity: 1 })).toBe(none);
    expect(styleEncodeKey({ parts: { body: { opacity: 1 } } })).toBe(none);
    expect(styleEncodeKey({ opacity: 0.5 })).not.toBe(none);
    expect(styleEncodeKey({ opacity: 0.4 })).not.toBe(styleEncodeKey({ opacity: 0.5 }));
    expect(styleEncodeKey({ parts: { body: { opacity: 0.5 } } })).not.toBe(none);
    expect(styleEncodeKey({ base: { body: { opacity: 0.5 } } })).not.toBe(
      styleEncodeKey({ base: { body: { opacity: 0.4 } } })
    );
    // Under an opacity, opaque colours are baked too: their changes re-encode.
    expect(styleEncodeKey({ opacity: 0.5, parts: { border: { color: "#ff0000" } } })).not.toBe(
      styleEncodeKey({ opacity: 0.5, parts: { border: { color: "#00ff00" } } })
    );
    expect(styleEncodeKey({ parts: { border: { color: "#ff0000" } } })).toBe(
      styleEncodeKey({ parts: { border: { color: "#00ff00" } } })
    );
  });

  it("returns the same primitives from bakeElementStyle with opacity 1", () => {
    const primitives = [black, title];
    expect(bakeElementStyle(primitives, { opacity: 1, parts: { title: { opacity: 1 } } })).toBe(primitives);
  });

  it("computes a row's encode key once", () => {
    const row = Object.freeze({ parts: { border: { width: 4 } } });
    const stringify = jest.spyOn(JSON, "stringify");
    expect(styleEncodeKey(row)).toBe(styleEncodeKey(row));
    expect(stringify).toHaveBeenCalledTimes(1);
    stringify.mockRestore();
  });
});

describe("child element styles", () => {
  it("composes a child's row from its own row and the parent's element values", () => {
    expect(composeChildStyle({ dim: 0.2, opacity: 0.5, raise: 2 }, { dim: 0.6, opacity: 0.5 })).toEqual({
      dim: 0.2,
      opacity: 0.25,
    });
    expect(composeChildStyle(undefined, { dim: 0.6 })).toEqual({ dim: 0.6 });
    expect([inheritsElementStyle({ dim: 0 }), inheritsElementStyle({ opacity: 1 }), inheritsElementStyle({})]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("multiplies the clamped opacities, as each renderer clamps them", () => {
    // Unclamped, 2 * 0.4 would be 0.8 and -1 * -1 would be 1.
    expect(composeChildStyle({ opacity: 2 }, { opacity: 0.4 }).opacity).toBe(0.4);
    expect(composeChildStyle({ opacity: -1 }, { opacity: -1 }).opacity).toBe(0);
    expect(composeChildStyle({ opacity: NaN }, { opacity: 0.5 }).opacity).toBe(0.5);
  });
});

describe("cameraAware precedence (Task 17h)", () => {
  type TText = Extract<TScenePrimitive, { kind: "text" }>;
  const title = (cameraAware?: TText["cameraAware"]): TText => ({
    kind: "text",
    part: "title",
    text: "t",
    family: "f",
    size: 9,
    lineHeight: 9,
    color: "#000000",
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    ...(cameraAware === undefined ? {} : { cameraAware }),
  });
  const clamps = { maxWorld: 90 };
  const modeOf = (primitive: TScenePrimitive | undefined): unknown =>
    primitive?.kind === "text" ? primitive.cameraAware : "not a text";

  // [primitive's mode, base value, parts value, effective mode]: parts, then base, then the primitive's own, then off;
  // an explicit false survives, and true keeps the primitive's clamps.
  const TABLE: ReadonlyArray<[TText["cameraAware"], boolean | undefined, boolean | undefined, unknown]> = [
    [undefined, undefined, undefined, undefined],
    [clamps, undefined, undefined, clamps],
    [clamps, false, undefined, false],
    [clamps, true, undefined, clamps],
    [undefined, true, undefined, true],
    [true, false, true, true],
    [clamps, true, false, false],
    [false, undefined, true, true],
    [clamps, false, true, clamps],
    [undefined, undefined, false, undefined],
  ];

  for (const [own, base, parts, want] of TABLE) {
    it(`own ${JSON.stringify(own)}, base ${base}, parts ${parts}: ${JSON.stringify(want)} on both renderers`, () => {
      const style: TSceneStyle = {
        ...(base === undefined ? {} : { base: { title: { cameraAware: base } } }),
        ...(parts === undefined ? {} : { parts: { title: { cameraAware: parts } } }),
      };
      expect(modeOf(applyStyle(title(own), style))).toEqual(want);
      expect(modeOf(bakeElementStyle([title(own)], style)[0])).toEqual(want);
      // The faded path bakes every value of the part too.
      expect(modeOf(bakeElementStyle([title(own)], { ...style, opacity: 0.5 })[0])).toEqual(want);
    });
  }

  it("does not turn a heightless text on: its bounds cover its world size only", () => {
    const on: TSceneStyle = { base: { title: { cameraAware: true } } };
    const heightless: TText = { ...title(), height: undefined };
    expect(modeOf(applyStyle(heightless, on))).toBeUndefined();
    expect(modeOf(bakeElementStyle([heightless], on)[0])).toBeUndefined();
    expect(modeOf(bakeElementStyle([heightless], { ...on, opacity: 0.5 })[0])).toBeUndefined();
    expect(ignoresCameraAware(heightless, on)).toBe(true);
    // A heightless text that declares the mode itself keeps it, and a style can still turn it off.
    const declared: TText = { ...title(clamps), height: undefined };
    expect(modeOf(applyStyle(declared, on))).toEqual(clamps);
    expect(ignoresCameraAware(declared, on)).toBe(false);
    expect(modeOf(applyStyle(declared, { parts: { title: { cameraAware: false } } }))).toBe(false);
    expect(ignoresCameraAware(title(), on)).toBe(false);
    expect(ignoresCameraAware(heightless, { parts: { title: { cameraAware: false } } })).toBe(false);
  });

  it("keeps the primitive's clamp object, and leaves other kinds and texts without a style alone", () => {
    const own = title(clamps);
    const styled = applyStyle(own, { base: { title: { cameraAware: true } } });
    expect(styled).toBe(own);
    expect(applyStyle(body, { base: { body: { cameraAware: false } } })).toBe(body);
    expect(applyStyle(own, undefined)).toBe(own);
  });

  it("is an element property: part of the encode key", () => {
    expect(styleEncodeKey({ base: { title: { cameraAware: true } } })).not.toBe(styleEncodeKey({}));
    expect(styleEncodeKey({ parts: { title: { cameraAware: false } } })).not.toBe(
      styleEncodeKey({ parts: { title: { cameraAware: true } } })
    );
  });
});
