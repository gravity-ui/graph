import { MIXED_PATH_FRAGMENT, PATH_FRAGMENT } from "./shaders";

/** Executes the shader's scalar/ternary colour selection; GLSL compilation and pixels belong to browser tests. */
function pathColor(
  source: string,
  input: { enabled: number; plain?: number; selected?: number; showsSelection?: number; callsEffect: boolean }
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
    `return (${expression});`
  ) as (...args: unknown[]) => string;
  return evaluate(
    input.enabled,
    input.plain ?? 0,
    { z: input.showsSelection ?? 0 },
    { selected: input.selected ?? 0, selectionColor: "selection" },
    "stroke",
    () => {
      if (!input.callsEffect) throw new Error("The inactive path invoked its effect");
      return "effect";
    }
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
