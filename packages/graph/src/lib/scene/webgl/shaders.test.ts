import { toConnectionEffect } from "../../../components/canvas/connections/effects/ConnectionEffect";
import { dashFlow, pulse } from "../../../components/canvas/connections/effects/library";

import {
  MIXED_PATH_FRAGMENT,
  PATH_FRAGMENT,
  STOCK_PATH_FRAGMENT,
  createMixedPathVertex,
  createStockPathPlugin,
} from "./shaders";

/** Executes the shader's scalar/ternary colour selection; GLSL compilation and pixels belong to browser tests. */
function pathColor(
  source: string,
  input: {
    enabled: number;
    plain?: number;
    stock?: number;
    selected?: number;
    showsSelection?: number;
    callsEffect: boolean;
  }
): string {
  const expression = source.match(/\bvec4 color = ([^;]+);/)?.[1];
  if (!expression) throw new Error("The path shader has no colour selection expression");
  // This expression uses the scalar arithmetic and conditional operators shared by GLSL and JavaScript.
  // eslint-disable-next-line no-new-func
  const evaluate = new Function(
    "graph_effectEnabled",
    "graph_vMixedPlain",
    "graph_vInteraction",
    "f",
    "graph_vColor",
    "effect",
    "graph_vStockEffect",
    "graph_dashFlowEffect",
    "graph_pulseEffect",
    `return (${expression});`
  ) as (...args: unknown[]) => string;
  const effect = (name: string): string => {
    if (!input.callsEffect) throw new Error("The inactive path invoked its effect");
    return name;
  };
  return evaluate(
    input.enabled,
    input.plain ?? 0,
    { z: input.showsSelection ?? 0 },
    { selected: input.selected ?? 0, selectionColor: "selection" },
    "stroke",
    () => effect("effect"),
    input.stock ?? 0,
    () => effect("dashFlow"),
    () => effect("pulse")
  );
}

describe("path effect shader selection", () => {
  it.each([
    { selected: 0, showsSelection: 0, expected: "stroke" },
    { selected: 1, showsSelection: 0, expected: "stroke" },
    { selected: 0, showsSelection: 1, expected: "stroke" },
    { selected: 1, showsSelection: 1, expected: "selection" },
  ])("draws the inactive native identity for $selected/$showsSelection", ({ expected, ...state }) => {
    expect(pathColor(PATH_FRAGMENT, { ...state, enabled: 0, callsEffect: false })).toBe(expected);
  });

  it("leaves an active native effect in charge of its selection colour", () => {
    expect(pathColor(PATH_FRAGMENT, { enabled: 1, selected: 1, showsSelection: 1, callsEffect: true })).toBe("effect");
  });

  it.each([0, 1])("uses the mixed source's flag independently of native enabled=%s", (enabled) => {
    expect(pathColor(MIXED_PATH_FRAGMENT, { enabled, plain: 0, callsEffect: true })).toBe("effect");
    expect(pathColor(MIXED_PATH_FRAGMENT, { enabled, plain: 1, callsEffect: false })).toBe("stroke");
    expect(
      pathColor(MIXED_PATH_FRAGMENT, { enabled, plain: 1, selected: 1, showsSelection: 1, callsEffect: false })
    ).toBe("selection");
  });
});

describe("shared stock path shader", () => {
  it.each([0, 1])("dispatches the active stock effect %s without the native enabled flag", (stock) => {
    for (const enabled of [0, 1]) {
      expect(
        pathColor(STOCK_PATH_FRAGMENT, { enabled, stock, selected: 1, showsSelection: 1, callsEffect: true })
      ).toBe(stock ? "pulse" : "dashFlow");
    }
  });

  it.each([0, 1])("suspends stock effect %s without losing ordinary stroke selection", (stock) => {
    for (const selected of [0, 1]) {
      for (const showsSelection of [0, 1]) {
        expect(
          pathColor(STOCK_PATH_FRAGMENT, {
            enabled: 1,
            stock,
            plain: 1,
            selected,
            showsSelection,
            callsEffect: false,
          })
        ).toBe(selected && showsSelection ? "selection" : "stroke");
      }
    }
  });

  it("decodes identity and pulse independently of each source's chord template", () => {
    const source = createMixedPathVertex(3);
    const readFlag = (name: string, flags: number): number => {
      const expression = source.match(new RegExp(`${name} = ([^;]+);`))?.[1];
      if (!expression) throw new Error(`Missing ${name} assignment`);
      // These packed integer operations have the same semantics in GLSL and JavaScript.
      // eslint-disable-next-line no-new-func
      return new Function("flags", "float", `return (${expression});`)(flags, Number) as number;
    };
    for (const chords of [1, 8, 16]) {
      for (const plain of [0, 1]) {
        for (const stock of [0, 1]) {
          const flags = chords + plain * 32 + stock * 64;
          expect(readFlag("graph_vMixedPlain", flags)).toBe(plain);
          expect(readFlag("graph_vStockEffect", flags)).toBe(stock);
          expect(
            pathColor(MIXED_PATH_FRAGMENT, {
              enabled: 0,
              plain: readFlag("graph_vMixedPlain", flags),
              callsEffect: plain === 0,
            })
          ).toBe(plain ? "stroke" : "effect");
        }
      }
    }
  });

  it("injects the current built-in bodies with only their entry point names changed", () => {
    const plugin = createStockPathPlugin();
    const declaration = plugin.injections?.find((injection) => injection.target === "fs:#decl")?.injection;
    expect(declaration).toContain(
      toConnectionEffect(dashFlow).fragment.replace("vec4 effect(", "vec4 graph_dashFlowEffect(")
    );
    expect(declaration).toContain(
      toConnectionEffect(pulse).fragment.replace("vec4 effect(", "vec4 graph_pulseEffect(")
    );
  });
});
