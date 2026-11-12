import { applyStyle, bakeElementStyle, styleDim, styleEncodeKey, styleOpacity, styleRaise } from "./style";
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
});
