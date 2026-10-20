import { DEFAULT_UIKIT_PALETTE } from "./palette";
import { mergeColorPatches, readUikitTheme, resolveUikitTheme } from "./resolveUikitTheme";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "./typography";

jest.mock("@gravity-ui/uikit", () => {
  const actual = jest.requireActual<{ TEXT_VARIANTS: readonly string[] }>("@gravity-ui/uikit");
  // A variant from a newer uikit, with a token group the kit does not know.
  return { ...actual, TEXT_VARIANTS: [...actual.TEXT_VARIANTS, "label-1"] };
});

function reader(values: Record<string, string>): (name: string) => string {
  return (name) => values[name] ?? "";
}

describe("resolveUikitTheme", () => {
  it("maps uikit tokens to graph colors and trims values", () => {
    const theme = resolveUikitTheme(
      reader({
        "--g-color-base-float": " rgb(255, 255, 255) ",
        "--g-color-line-brand": "rgb(233, 174, 86)",
        "--g-color-base-background": "rgb(34, 29, 34)",
      })
    );

    expect(theme.isAvailable).toBe(true);
    expect(theme.colors.block).toEqual({ background: "rgb(255, 255, 255)", selectedBorder: "rgb(233, 174, 86)" });
    expect(theme.colors.canvas).toEqual({ layerBackground: "rgb(34, 29, 34)" });
    expect(theme.colors.selection).toEqual({ border: "rgb(233, 174, 86)" });
  });

  it("reports a missing theme and falls back to defaults", () => {
    const theme = resolveUikitTheme(reader({}));

    expect(theme.isAvailable).toBe(false);
    expect(theme.colors.block).toEqual({});
    expect(theme.palette).toEqual(DEFAULT_UIKIT_PALETTE);
    expect(theme.typography).toEqual(DEFAULT_UIKIT_TYPOGRAPHY);
  });

  it("reads the palette and typography", () => {
    const theme = resolveUikitTheme(
      reader({
        "--g-color-base-float": "white",
        "--g-color-text-secondary": "gray",
        "--g-color-line-generic-accent-hover": "black",
        "--g-color-base-info-light": "lightblue",
        "--g-color-line-info": "blue",
        "--g-text-body-font-family": "Test Sans",
        "--g-text-body-font-weight": "500",
        "--g-text-body-1-font-size": "14px",
        "--g-text-body-1-line-height": "20px",
      })
    );

    expect(theme.palette.text.secondary).toBe("gray");
    expect(theme.palette.connectionHover).toBe("black");
    expect(theme.palette.status.info).toEqual({ background: "lightblue", border: "blue" });
    expect(theme.typography["body-1"]).toEqual({
      fontFamily: "Test Sans",
      fontWeight: "500",
      fontSize: 14,
      lineHeight: 20,
    });
    expect(theme.typography["body-short"].fontFamily).toBe("Test Sans");
    expect(theme.typography["caption-2"]).toEqual(DEFAULT_UIKIT_TYPOGRAPHY["caption-2"]);
  });

  it("resolves only the variants the kit has defaults for", () => {
    const theme = resolveUikitTheme(reader({ "--g-text-label-1-font-size": "99px" }));

    expect(Object.keys(theme.typography).sort()).toEqual(Object.keys(DEFAULT_UIKIT_TYPOGRAPHY).sort());
  });

  it("reads computed tokens from an element", () => {
    const element = document.createElement("div");
    element.style.setProperty("--g-color-base-float", "red");
    document.body.appendChild(element);

    expect(readUikitTheme(element).colors.block?.background).toBe("red");

    element.remove();
  });
});

describe("mergeColorPatches", () => {
  it("lets the patch win per key", () => {
    expect(
      mergeColorPatches({ block: { background: "a", border: "b" } }, { block: { background: "c" } }).block
    ).toEqual({ background: "c", border: "b" });
  });
});
