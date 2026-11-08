import { DEFAULT_UIKIT_TYPOGRAPHY, getUikitTextGroup } from "./typography";

describe("uikit typography", () => {
  it("maps variants to their token group", () => {
    expect(getUikitTextGroup("body-short")).toBe("body");
    expect(getUikitTextGroup("subheader-1")).toBe("subheader");
    expect(getUikitTextGroup("header-2")).toBe("header");
    expect(getUikitTextGroup("code-inline-2")).toBe("code");
    expect(getUikitTextGroup("caption-2")).toBe("caption");
  });

  it("defaults to uikit sizes and weights", () => {
    expect(DEFAULT_UIKIT_TYPOGRAPHY["body-1"]).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "400" });
    expect(DEFAULT_UIKIT_TYPOGRAPHY["subheader-1"]).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: "600" });
    expect(DEFAULT_UIKIT_TYPOGRAPHY["caption-2"]).toMatchObject({ fontSize: 11, lineHeight: 16 });
    expect(DEFAULT_UIKIT_TYPOGRAPHY["code-1"].fontFamily).toContain("monospace");
  });
});
